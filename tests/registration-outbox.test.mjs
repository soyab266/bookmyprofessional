import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import {
  queueRegistrationWelcome,
  listPendingOutbox,
  dispatchRegistrationWelcomeOutbox,
  OUTBOX_TABLE,
} from '../src/lib/registration-outbox.js';
import { META_TEMPLATE } from '../src/lib/meta-whatsapp-templates.js';

// In-memory mock of the supabase query builder covering the outbox flows.
// profiles option: 'auto' (default: every requested id is consenting),
// an array of profile rows, or { error: 'message' } for a failed read.
const MOCK_BUDGET_DAY = new Date().toISOString().slice(0, 10);

function mockSupabase(initialRows = [], profiles = 'auto', opts = {}) {
  const rows = initialRows.map((r, i) => ({ id: r.id || `row-${i + 1}`, attempts: 0, ...r }));
  let inserted = 0;
  // In-memory mirror of the single-row budget counter the reserve/release
  // RPCs maintain in production (supabase/registration_welcome_budget.sql).
  // Defaults mirror the seeded owner-approved pilot plan (3/day, 3 all-in).
  // The SQL's hard pilot expiry (expires_at NULL or past) reaches this
  // layer as the same { taken: false } denial as a reached cap, so the
  // denial tests below also cover the dispatcher's response to expiry.
  const budget = { daily_used: 0, total_used: 0, daily_cap: 3, total_cap: 3, ...(opts.budget || {}) };

  function applyFilters(data, filters) {
    return data.filter((row) =>
      filters.every((f) => {
        if (f.op === 'eq') return row[f.col] === f.val;
        if (f.op === 'in') return f.val.includes(row[f.col]);
        if (f.op === 'lt') return String(row[f.col] || '') < String(f.val);
        if (f.op === 'gte') return String(row[f.col] || '') >= String(f.val);
        return true;
      })
    );
  }

  const api = {
    rows,
    from(table) {
      assert.ok(table === OUTBOX_TABLE || table === 'profiles', `unexpected table ${table}`);
      const isProfiles = table === 'profiles';
      const filters = [];
      const builder = {
        select(cols, opts) {
          if (opts && opts.count === 'exact' && opts.head === true) builder._headCount = true;
          return builder;
        },
        eq(col, val) {
          filters.push({ op: 'eq', col, val });
          return builder;
        },
        in(col, val) {
          filters.push({ op: 'in', col, val });
          return builder;
        },
        lt(col, val) {
          filters.push({ op: 'lt', col, val });
          return builder;
        },
        gte(col, val) {
          filters.push({ op: 'gte', col, val });
          return builder;
        },
        order() {
          return builder;
        },
        limit(n) {
          builder._limit = n;
          return builder;
        },
        insert(record) {
          const id = `new-${++inserted}`;
          rows.push({ id, attempts: 0, created_at: new Date().toISOString(), ...record });
          builder._insertedId = id;
          return builder;
        },
        update(fields) {
          builder._update = fields;
          return builder;
        },
        then(resolve) {
          // profiles read path (dispatch-time consent re-check)
          if (isProfiles) {
            if (profiles && profiles.error) return resolve({ data: null, error: { message: profiles.error } });
            const ids = (filters.find((f) => f.col === 'id' && f.op === 'in') || { val: [] }).val;
            const data = profiles === 'auto'
              ? ids.map((id) => ({ id, full_name: 'Test', phone: '919970897799', whatsapp_consent: true }))
              : (profiles || []).filter((p) => ids.includes(p.id));
            return resolve({ data, error: null });
          }
          // select path
          if (builder._update) {
            const targets = applyFilters(rows, filters);
            for (const row of targets) Object.assign(row, builder._update);
            return resolve({ data: targets, error: null });
          }
          if (builder._insertedId) {
            return resolve({ data: [{ id: builder._insertedId }], error: null });
          }
          if (builder._headCount) {
            if (opts.countError) return resolve({ data: null, count: null, error: { message: 'count failed' } });
            return resolve({ data: null, count: applyFilters(rows, filters).length, error: null });
          }
          let data = applyFilters(rows, filters);
          if (builder._limit) data = data.slice(0, builder._limit);
          return resolve({ data, error: null });
        },
      };
      // make the builder awaitable
      builder[Symbol.asyncIterator] = undefined;
      return builder;
    },
    budget,
    async rpc(name, params) {
      assert.ok(
        name === 'reserve_welcome_send' || name === 'release_welcome_send',
        `unexpected rpc ${name}`
      );
      if (opts.rpcError) return { data: null, error: { message: 'rpc failed' } };
      if (name === 'reserve_welcome_send') {
        if (budget.total_used >= budget.total_cap || budget.daily_used >= budget.daily_cap) {
          return { data: { taken: false }, error: null };
        }
        budget.daily_used++;
        budget.total_used++;
        return { data: { taken: true, day: MOCK_BUDGET_DAY }, error: null };
      }
      // release_welcome_send(p_day): total always gives back; daily only when
      // the reservation's day is still the current budget day (mirrors SQL).
      budget.total_used = Math.max(0, budget.total_used - 1);
      if (params && params.p_day === MOCK_BUDGET_DAY) {
        budget.daily_used = Math.max(0, budget.daily_used - 1);
      }
      return { data: null, error: null };
    },
  };
  return api;
}

// Awaiting a builder: support `await builder` via then
const CUSTOMER = {
  id: 'u-customer',
  full_name: 'Soyab',
  phone: '9970897799',
  role: 'customer',
  whatsapp_consent: true,
};
const PRO = {
  id: 'u-pro',
  full_name: 'Ravi',
  phone: '8919328705',
  role: 'professional',
  whatsapp_consent: true,
};

test('queueRegistrationWelcome queues a customer welcome row', async () => {
  const sb = mockSupabase();
  const result = await queueRegistrationWelcome(sb, CUSTOMER);
  assert.equal(result.queued, true);
  assert.ok(result.id);
  const row = sb.rows.find((r) => r.id === result.id);
  assert.equal(row.user_id, 'u-customer');
  assert.equal(row.channel, 'whatsapp');
  assert.equal(row.template, META_TEMPLATE.CUSTOMER_REGISTRATION);
  assert.equal(row.status, 'pending');
  assert.equal(row.payload.template.name, 'bmp_customer_registration_received');
  assert.equal(row.payload.to, '919970897799');
});

test('queueRegistrationWelcome queues a professional welcome row', async () => {
  const sb = mockSupabase();
  const result = await queueRegistrationWelcome(sb, PRO);
  assert.equal(result.queued, true);
  const row = sb.rows.find((r) => r.id === result.id);
  assert.equal(row.template, META_TEMPLATE.PRO_REGISTRATION);
  assert.equal(row.payload.template.name, 'bmp_professional_registration_received');
});

test('queueRegistrationWelcome refuses without consent', async () => {
  const sb = mockSupabase();
  const result = await queueRegistrationWelcome(sb, { ...CUSTOMER, whatsapp_consent: false });
  assert.deepEqual(result, { queued: false, reason: 'no_consent_or_phone' });
  assert.equal(sb.rows.length, 0);
});

test('queueRegistrationWelcome refuses without a phone', async () => {
  const sb = mockSupabase();
  const result = await queueRegistrationWelcome(sb, { ...CUSTOMER, phone: '' });
  assert.deepEqual(result, { queued: false, reason: 'no_consent_or_phone' });
});

test('queueRegistrationWelcome respects a whatsapp opt-out in notification_prefs', async () => {
  const sb = mockSupabase();
  const result = await queueRegistrationWelcome(sb, { ...CUSTOMER, notification_prefs: { whatsapp: false } });
  assert.deepEqual(result, { queued: false, reason: 'no_consent_or_phone' });
});

test('queueRegistrationWelcome refuses missing profile id or supabase', async () => {
  const sb = mockSupabase();
  assert.deepEqual(await queueRegistrationWelcome(sb, { full_name: 'A' }), { queued: false, reason: 'missing_profile_id' });
  assert.deepEqual(await queueRegistrationWelcome(null, CUSTOMER), { queued: false, reason: 'no_supabase' });
});

test('queueRegistrationWelcome dedupes against pending and accepted rows', async () => {
  const pending = [{ user_id: 'u-customer', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending' }];
  let sb = mockSupabase(pending);
  let result = await queueRegistrationWelcome(sb, CUSTOMER);
  assert.equal(result.queued, false);
  assert.equal(result.reason, 'already_queued_or_sent');

  const sent = [{ user_id: 'u-customer', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'accepted' }];
  sb = mockSupabase(sent);
  result = await queueRegistrationWelcome(sb, CUSTOMER);
  assert.equal(result.queued, false);
  assert.equal(result.reason, 'already_queued_or_sent');

  // a failed row does not block a re-queue
  const failedRow = [{ user_id: 'u-customer', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'failed' }];
  sb = mockSupabase(failedRow);
  result = await queueRegistrationWelcome(sb, CUSTOMER);
  assert.equal(result.queued, true);
});

test('queueRegistrationWelcome dedupes per template, not per user', async () => {
  const other = [{ user_id: 'u-customer', template: META_TEMPLATE.PRO_REGISTRATION, status: 'accepted' }];
  const sb = mockSupabase(other);
  const result = await queueRegistrationWelcome(sb, CUSTOMER);
  assert.equal(result.queued, true);
});

test('listPendingOutbox returns pending rows only', async () => {
  const sb = mockSupabase([
    { id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload: {} },
    { id: 'b', user_id: 'u2', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'accepted', payload: {} },
  ]);
  const pending = await listPendingOutbox(sb);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, 'a');
});

test('listPendingOutbox returns [] without supabase', async () => {
  assert.deepEqual(await listPendingOutbox(null), []);
});

test('dispatchRegistrationWelcomeOutbox sends pending rows and marks them accepted (acceptance, not delivery)', async () => {
  const payload = { messaging_product: 'whatsapp', type: 'template', to: '919970897799', template: { name: META_TEMPLATE.CUSTOMER_REGISTRATION, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Soyab' }] }] } };
  const sb = mockSupabase([{ id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload }]);
  const sentPayloads = [];
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async (p) => { sentPayloads.push(p); return { success: true }; },
  });
  assert.deepEqual(summary, { accepted: 1, failed: 0, skipped: 0, uncertain: 0, capped: 0 });
  assert.equal(sentPayloads.length, 1);
  const row = sb.rows.find((r) => r.id === 'a');
  assert.equal(row.status, 'accepted');
  assert.equal(row.attempts, 1);
  assert.ok(row.accepted_at);
});

test('dispatchRegistrationWelcomeOutbox holds ambiguous send failures as uncertain (never auto-resent)', async () => {
  const payload = { messaging_product: 'whatsapp', type: 'template', to: '919970897799', template: { name: META_TEMPLATE.CUSTOMER_REGISTRATION, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Soyab' }] }] } };
  const sb = mockSupabase([{ id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload }]);
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => ({ success: false, error: 'api_error' }),
  });
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 1, capped: 0 });
  const row = sb.rows.find((r) => r.id === 'a');
  assert.equal(row.status, 'uncertain'); // attempted, acceptance unknown: held for reconciliation
  assert.equal(row.attempts, 1);
  assert.equal(row.last_error, 'api_error');
});

test('dispatchRegistrationWelcomeOutbox marks max-attempt rows as failed without sending', async () => {
  const sb = mockSupabase([
    { id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload: {}, attempts: 5 },
  ]);
  let sendCalls = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => { sendCalls++; return { success: true }; },
    maxAttempts: 5,
  });
  assert.deepEqual(summary, { accepted: 0, failed: 1, skipped: 0, uncertain: 0, capped: 0 });
  assert.equal(sendCalls, 0);
  assert.equal(sb.rows.find((r) => r.id === 'a').status, 'failed');
  assert.equal(sb.rows.find((r) => r.id === 'a').last_error, 'max_attempts_reached');
});

test('dispatchRegistrationWelcomeOutbox never marks a simulated send as sent', async () => {
  const payload = { messaging_product: 'whatsapp', type: 'template', to: '919970897799', template: { name: META_TEMPLATE.CUSTOMER_REGISTRATION, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Soyab' }] }] } };
  const sb = mockSupabase([{ id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload }]);
  // default sender = real connector, which simulates under NODE_ENV=test
  const summary = await dispatchRegistrationWelcomeOutbox(sb);
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 1, uncertain: 0, capped: 0 });
  const row = sb.rows.find((r) => r.id === 'a');
  assert.equal(row.status, 'pending');
  assert.equal(row.attempts, 0); // a simulated attempt is not burned
  assert.equal(row.last_error, 'simulated_not_sent');
});

test('dispatchRegistrationWelcomeOutbox counts a missing-credentials skip without marking sent', async () => {
  const payload = { messaging_product: 'whatsapp', type: 'template', to: '919970897799', template: { name: META_TEMPLATE.CUSTOMER_REGISTRATION, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Soyab' }] }] } };
  const sb = mockSupabase([{ id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload }]);
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => ({ success: false, skipped: 'missing_credentials' }),
  });
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 1, uncertain: 0, capped: 0 });
  const row = sb.rows.find((r) => r.id === 'a');
  assert.equal(row.status, 'pending');
  assert.equal(row.last_error, 'missing_credentials');
});

// --- Dispatcher must distinguish a database failure from an empty queue ---

function failingReadSupabase(message) {
  return {
    from() {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        then(resolve) { return resolve({ data: null, error: { message } }); },
      };
      return builder;
    },
  };
}

test('dispatchRegistrationWelcomeOutbox reports a queue read failure instead of fake-healthy zeros', async () => {
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(
    failingReadSupabase('connection refused'),
    { sendImpl: async () => { sends++; return { success: true }; } }
  );
  assert.equal(summary.accepted, 0);
  assert.equal(summary.failed, 0);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.uncertain, 0);
  assert.match(summary.error, /queue_read_failed: connection refused/);
  assert.equal(sends, 0); // nothing was attempted against a broken queue
});

test('dispatchRegistrationWelcomeOutbox without supabase reports an error, not zeros', async () => {
  const summary = await dispatchRegistrationWelcomeOutbox(null);
  assert.match(summary.error, /queue_read_failed/);
});

test('dispatchRegistrationWelcomeOutbox on a genuinely empty queue returns zeros with no error', async () => {
  const sb = mockSupabase([]);
  const summary = await dispatchRegistrationWelcomeOutbox(sb, { sendImpl: async () => ({ success: true }) });
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 0, capped: 0 });
  assert.equal('error' in summary, false);
});

// --- Fresh consent check at dispatch (opt-out while queued must not send) ---

const DISPATCH_PAYLOAD = { messaging_product: 'whatsapp', type: 'template', to: '919970897799', template: { name: META_TEMPLATE.CUSTOMER_REGISTRATION, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Soyab' }] }] } };

test('dispatch skips and never sends when consent was withdrawn while queued', async () => {
  const sb = mockSupabase(
    [{ id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload: DISPATCH_PAYLOAD }],
    [{ id: 'u1', full_name: 'Soyab', phone: '919970897799', whatsapp_consent: false }]
  );
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => { sends++; return { success: true }; },
  });
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 1, uncertain: 0, capped: 0 });
  assert.equal(sends, 0);
  const row = sb.rows.find((r) => r.id === 'a');
  assert.equal(row.status, 'skipped');
  assert.equal(row.last_error, 'consent_withdrawn');
  assert.equal(row.attempts, 0);
});

test('dispatch respects a whatsapp opt-out in notification_prefs at send time', async () => {
  const sb = mockSupabase(
    [{ id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload: DISPATCH_PAYLOAD }],
    [{ id: 'u1', full_name: 'Soyab', phone: '919970897799', whatsapp_consent: true, notification_prefs: { whatsapp: false } }]
  );
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => { sends++; return { success: true }; },
  });
  assert.equal(sends, 0);
  assert.equal(summary.skipped, 1);
  assert.equal(sb.rows.find((r) => r.id === 'a').last_error, 'consent_withdrawn');
});

test('dispatch marks profile_unavailable as terminal no-send', async () => {
  const sb = mockSupabase(
    [{ id: 'a', user_id: 'u-gone', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload: DISPATCH_PAYLOAD }],
    [] // profile no longer exists
  );
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => { sends++; return { success: true }; },
  });
  assert.equal(sends, 0);
  assert.equal(summary.skipped, 1);
  const row = sb.rows.find((r) => r.id === 'a');
  assert.equal(row.status, 'skipped');
  assert.equal(row.last_error, 'profile_unavailable');
});

test('dispatch keeps rows pending without sending when consent cannot be read', async () => {
  const sb = mockSupabase(
    [{ id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload: DISPATCH_PAYLOAD }],
    { error: 'profiles read failed' }
  );
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => { sends++; return { success: true }; },
  });
  assert.equal(sends, 0);
  assert.equal(summary.skipped, 1);
  const row = sb.rows.find((r) => r.id === 'a');
  assert.equal(row.status, 'pending'); // transient: retry later
  assert.equal(row.attempts, 0); // no attempt burned
  assert.equal(row.last_error, 'consent_check_failed');
});

test('dispatch claims rows so a concurrent dispatcher never double-sends', async () => {
  const sb = mockSupabase([
    { id: 'r-race', user_id: 'u-customer', template: 'bmp_customer_registration_received', payload: DISPATCH_PAYLOAD, status: 'pending' },
  ]);
  let sends = 0;
  let started;
  const startedPromise = new Promise((res) => { started = res; });
  let release;
  const gate = new Promise((res) => { release = res; });
  const blockingSend = async () => { sends++; started(); await gate; return { success: true }; };

  const runA = dispatchRegistrationWelcomeOutbox(sb, { sendImpl: blockingSend });
  await startedPromise; // A has claimed the row and is inside the send
  const summaryB = await dispatchRegistrationWelcomeOutbox(sb, { sendImpl: async () => { sends++; return { success: true }; } });
  assert.deepEqual(summaryB, { accepted: 0, failed: 0, skipped: 0, uncertain: 0, capped: 0 }, 'concurrent run sees no claimable rows');
  release();
  const summaryA = await runA;
  assert.deepEqual(summaryA, { accepted: 1, failed: 0, skipped: 0, uncertain: 0, capped: 0 });
  assert.equal(sends, 1, 'exactly one send happened for one queued row');
  assert.equal(sb.rows.find((r) => r.id === 'r-race').status, 'accepted');
});

test('dispatch HOLDS orphaned sending claims older than 10 minutes (crashed worker may have delivered)', async () => {
  const sb = mockSupabase([
    { id: 'r-stale', user_id: 'u-customer', template: 'bmp_customer_registration_received', payload: DISPATCH_PAYLOAD, status: 'sending', updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
  ]);
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, { sendImpl: async () => { sends++; return { success: true }; } });
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 0, capped: 0 });
  assert.equal(sends, 0, 'a stale claim is never automatically resent');
  const row = sb.rows.find((r) => r.id === 'r-stale');
  assert.equal(row.status, 'uncertain');
  assert.equal(row.last_error, 'stale_claim_uncertain');
});

test('dispatch leaves fresh sending claims untouched', async () => {
  const sb = mockSupabase([
    { id: 'r-live', user_id: 'u-customer', template: 'bmp_customer_registration_received', payload: DISPATCH_PAYLOAD, status: 'sending', updated_at: new Date().toISOString() },
  ]);
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, { sendImpl: async () => { sends++; return { success: true }; } });
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 0, capped: 0 });
  assert.equal(sends, 0);
  assert.equal(sb.rows.find((r) => r.id === 'r-live').status, 'sending');
});

test('accepted send with failed status persistence never returns the row to pending', async () => {
  const sb = mockSupabase([
    { id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload: DISPATCH_PAYLOAD },
  ]);
  const origFrom = sb.from.bind(sb);
  sb.from = (table) => {
    const builder = origFrom(table);
    if (table === OUTBOX_TABLE) {
      const origUpdate = builder.update.bind(builder);
      builder.update = (fields) => {
        if (fields && fields.status === 'accepted') throw new Error('persistence lost');
        return origUpdate(fields);
      };
    }
    return builder;
  };
  const summary = await dispatchRegistrationWelcomeOutbox(sb, { sendImpl: async () => ({ success: true }) });
  assert.equal(summary.accepted, 1, 'Meta accepted the message');
  const row = sb.rows.find((r) => r.id === 'a');
  assert.equal(row.status, 'sending', 'row stays claimed; the stale sweep later holds it as uncertain - it can never return to pending and be resent automatically');
});

// --- Budget caps: atomic reservation (message volume, never rupees) --------
// Semantics mirror supabase/registration_welcome_budget.sql: reserve BEFORE
// claim; KEPT on accepted AND uncertain (a held, possibly-real send consumes
// budget); RELEASED only when Meta was definitely never reached (claim lost,
// simulated, not-attempted incl. validation failures). Over-cap or reserve
// error fails closed: no sends, row stays pending, no attempt burned.

const CAP_PENDING = {
  id: 'cap-pending',
  user_id: 'u-customer',
  template: META_TEMPLATE.CUSTOMER_REGISTRATION,
  payload: DISPATCH_PAYLOAD,
  status: 'pending',
  created_at: new Date().toISOString(),
};

test('dispatch stops when the atomic reservation is denied (cap reached); row stays pending, no attempt burned', async () => {
  const sb = mockSupabase([CAP_PENDING], 'auto', { budget: { daily_used: 3 } });
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => { sends++; return { success: true }; },
  });
  assert.equal(sends, 0, 'nothing is sent once the daily cap is reached');
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 0, capped: 1 });
  const row = sb.rows.find((r) => r.id === 'cap-pending');
  assert.equal(row.status, 'pending', 'capped row stays pending for a later run');
  assert.equal(row.attempts, 0, 'capped row burns no attempt');
  assert.equal(sb.budget.daily_used, 3, 'denied reservation consumes nothing');
});

test('dispatch fails closed (no sends) when the reservation RPC errors', async () => {
  const sb = mockSupabase([CAP_PENDING], 'auto', { rpcError: true });
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => { sends++; return { success: true }; },
  });
  assert.equal(sends, 0, 'reserve error means no sends this run');
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 0, capped: 1 });
  assert.equal(sb.rows.find((r) => r.id === 'cap-pending').status, 'pending');
});

test('accepted send KEEPS the reservation (consumes budget)', async () => {
  const sb = mockSupabase([CAP_PENDING]);
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => ({ success: true }),
  });
  assert.deepEqual(summary, { accepted: 1, failed: 0, skipped: 0, uncertain: 0, capped: 0 });
  assert.equal(sb.budget.daily_used, 1, 'an accepted send consumes its slot');
  assert.equal(sb.budget.total_used, 1);
});

test('uncertain outcome KEEPS the reservation (held, possibly-real send consumes budget)', async () => {
  const sb = mockSupabase([CAP_PENDING]);
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => ({ success: false, error: 'network_dropped_after_request' }),
  });
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 1, capped: 0 });
  assert.equal(sb.budget.daily_used, 1, 'a held uncertain attempt keeps its slot');
  assert.equal(sb.rows.find((r) => r.id === 'cap-pending').status, 'uncertain');
});

test('synchronous Meta rejection (HTTP error response) KEEPS the reservation - a real request spent the attempt', async () => {
  const sb = mockSupabase([CAP_PENDING]);
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => ({ success: false, status: 400, error: '(#132000) template parameter mismatch' }),
  });
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 1, capped: 0 });
  assert.equal(sb.budget.daily_used, 1, 'a synchronous rejection still consumes the slot - the request reached Meta');
  assert.equal(sb.budget.total_used, 1);
  assert.equal(sb.rows.find((r) => r.id === 'cap-pending').status, 'uncertain');
});

test('not-attempted outcome RELEASES the reservation (Meta never reached)', async () => {
  const sb = mockSupabase([CAP_PENDING]);
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => ({ success: false, skipped: 'missing_credentials' }),
  });
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 1, uncertain: 0, capped: 0 });
  assert.equal(sb.budget.daily_used, 0, 'slot returned: nothing was sent');
  assert.equal(sb.rows.find((r) => r.id === 'cap-pending').status, 'pending');
});

test('validation failure RELEASES the reservation and marks the row failed', async () => {
  const sb = mockSupabase([CAP_PENDING]);
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => ({ success: false, error: 'validation_failed: bad template' }),
  });
  assert.deepEqual(summary, { accepted: 0, failed: 1, skipped: 0, uncertain: 0, capped: 0 });
  assert.equal(sb.budget.daily_used, 0, 'slot returned: Meta was never reached');
});

test('reservation under both caps still sends normally', async () => {
  const sb = mockSupabase([CAP_PENDING], 'auto', { budget: { daily_used: 2, total_used: 2 } });
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => ({ success: true }),
  });
  assert.deepEqual(summary, { accepted: 1, failed: 0, skipped: 0, uncertain: 0, capped: 0 });
  assert.deepEqual(
    { daily: sb.budget.daily_used, total: sb.budget.total_used },
    { daily: 3, total: 3 },
    'the last available slot is taken exactly once'
  );
});

test('reservation denied when the ALL-IN cap is reached even with daily room', async () => {
  const sb = mockSupabase([CAP_PENDING], 'auto', { budget: { daily_used: 0, total_used: 3 } });
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, {
    sendImpl: async () => { sends++; return { success: true }; },
  });
  assert.equal(sends, 0);
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 0, capped: 1 });
});
