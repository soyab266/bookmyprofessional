import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.NODE_ENV = 'test';

import { isDefinitiveAuthLoss } from '../src/lib/auth-session-loss.js';

// 20 Nov 2026: deleting a customer in the admin panel removed their auth
// user and profile row, but the customer's browser kept its persisted
// Supabase session (getSession() reads local storage only). The stale
// session hydrated with a null profile, fell back to phone-less metadata,
// and the onboarding gate sent the deleted account to the mobile-number
// step, where "Save and continue" falsely reported success on a zero-row
// update. The repair: validate definitively-lost sessions against the
// server and clear only THIS browser's local session; never sign out on
// transient failures; never report a zero-row save as success.

const ctxSrc = readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('../src/app/complete-profile/CompleteProfileClient.jsx', import.meta.url), 'utf8');

// Extract the REAL hydrate validation block from AuthContext (brace-balanced).
function extractValidationBlock(src) {
  const marker = 'if (!profile) {';
  const start = src.indexOf(marker);
  assert.ok(start >= 0, 'hydrate validation block must exist');
  let i = src.indexOf('{', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced');
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function makeDriver(calls) {
  const block = extractValidationBlock(ctxSrc);
  return new AsyncFunction(
    'supabase', 'profile', 'active', 'setUser', 'setIsLoading', 'isDefinitiveAuthLoss',
    block
  );
}
function mockSupabase(getUserResult, calls) {
  return {
    auth: {
      getUser: async () => { calls.getUser++; return getUserResult; },
      signOut: async (opts) => { calls.signOut.push(opts); return { error: null }; },
    },
  };
}
const run = (block, supabase, profile, calls) =>
  block(supabase, profile, true, () => calls.setUser++, () => calls.setLoading++, isDefinitiveAuthLoss);

describe('isDefinitiveAuthLoss classification (real helper)', () => {
  test('deleted/revoked auth is definitive', () => {
    assert.equal(isDefinitiveAuthLoss({ name: 'AuthApiError', status: 403, code: 'user_not_found' }), true);
    assert.equal(isDefinitiveAuthLoss({ name: 'AuthApiError', status: 401, code: 'bad_jwt' }), true);
    assert.equal(isDefinitiveAuthLoss({ name: 'AuthSessionMissingError' }), true);
    assert.equal(isDefinitiveAuthLoss({ name: 'AuthApiError', status: 400, code: 'session_not_found' }), true);
    assert.equal(isDefinitiveAuthLoss({ name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' }), true);
  });
  test('transient failures are never definitive', () => {
    assert.equal(isDefinitiveAuthLoss({ name: 'AuthRetryableFetchError', status: 503 }), false);
    assert.equal(isDefinitiveAuthLoss({ name: 'AuthRetryableFetchError', status: 0 }), false);
    assert.equal(isDefinitiveAuthLoss({ name: 'AuthApiError', status: 500 }), false);
    assert.equal(isDefinitiveAuthLoss({ name: 'AuthApiError', status: 429, code: 'over_request_rate_limit' }), false);
    assert.equal(isDefinitiveAuthLoss({ name: 'AuthApiError', status: 400, code: 'something_unknown' }), false);
    assert.equal(isDefinitiveAuthLoss(null), false);
    assert.equal(isDefinitiveAuthLoss(undefined), false);
  });
});

describe('hydrate validation block (real code, executed)', () => {
  test('deleted user: local-only signOut, user cleared, never global', async () => {
    const calls = { getUser: 0, signOut: [], setUser: 0, setLoading: 0 };
    const driver = makeDriver(calls);
    await run(driver, mockSupabase({ error: { name: 'AuthApiError', status: 403, code: 'user_not_found' } }, calls), null, calls);
    assert.equal(calls.signOut.length, 1, 'must sign out exactly once');
    assert.deepEqual(calls.signOut[0], { scope: 'local' }, 'signOut must be local-scope only (default is global)');
    assert.equal(calls.setUser, 1);
  });
  test('network/5xx failure: session untouched', async () => {
    const calls = { getUser: 0, signOut: [], setUser: 0, setLoading: 0 };
    const driver = makeDriver(calls);
    await run(driver, mockSupabase({ error: { name: 'AuthRetryableFetchError', status: 503 } }, calls), null, calls);
    assert.equal(calls.signOut.length, 0);
    assert.equal(calls.setUser, 0);
  });
  test('rate limit: session untouched', async () => {
    const calls = { getUser: 0, signOut: [], setUser: 0, setLoading: 0 };
    const driver = makeDriver(calls);
    await run(driver, mockSupabase({ error: { name: 'AuthApiError', status: 429, code: 'over_request_rate_limit' } }, calls), null, calls);
    assert.equal(calls.signOut.length, 0);
  });
  test('valid auth with missing row (fresh signup race): no signOut', async () => {
    const calls = { getUser: 0, signOut: [], setUser: 0, setLoading: 0 };
    const driver = makeDriver(calls);
    await run(driver, mockSupabase({ data: { user: { id: 'u1' } }, error: null }, calls), null, calls);
    assert.equal(calls.signOut.length, 0);
  });
  test('existing profile: server validation not even attempted', async () => {
    const calls = { getUser: 0, signOut: [], setUser: 0, setLoading: 0 };
    const driver = makeDriver(calls);
    await run(driver, mockSupabase({ data: { user: { id: 'u1' } }, error: null }, calls), { id: 'u1' }, calls);
    assert.equal(calls.getUser, 0, 'no extra server call for healthy users');
    assert.equal(calls.signOut.length, 0);
  });
});

describe('wiring pins', () => {
  test('deleted-session clearing is local-scope only (the block never uses bare/global signOut)', () => {
    const block = extractValidationBlock(ctxSrc);
    assert.match(block, /signOut\(\{ scope: "local" \}\)/);
    const bare = block.match(/signOut\(\s*\)/g);
    assert.equal(bare, null, 'bare signOut() defaults to GLOBAL scope and would log out every device');
  });
  test('validation runs before the OAuth professional-role write branch', () => {
    assert.ok(ctxSrc.indexOf('isDefinitiveAuthLoss(userError)') < ctxSrc.indexOf("localStorage.getItem('oauth_role')"));
  });
  test('complete-profile save cannot report success on a zero-row update', () => {
    assert.match(clientSrc, /\.update\(update\)[\s\S]*?\.eq\("id", user\.id\)[\s\S]*?\.select\("id"\)/);
    const throwIdx = clientSrc.indexOf('updatedRows.length === 0');
    const toastIdx = clientSrc.indexOf('"Mobile number saved."');
    assert.ok(throwIdx > 0 && toastIdx > throwIdx, 'zero-row check must run before the success toast');
  });
});
