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
function mockSupabase(initialRows = [], profiles = 'auto') {
  const rows = initialRows.map((r, i) => ({ id: r.id || `row-${i + 1}`, attempts: 0, ...r }));
  let inserted = 0;

  function applyFilters(data, filters) {
    return data.filter((row) =>
      filters.every((f) => {
        if (f.op === 'eq') return row[f.col] === f.val;
        if (f.op === 'in') return f.val.includes(row[f.col]);
        if (f.op === 'lt') return String(row[f.col] || '') < String(f.val);
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
        select() {
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
          let data = applyFilters(rows, filters);
          if (builder._limit) data = data.slice(0, builder._limit);
          return resolve({ data, error: null });
        },
      };
      // make the builder awaitable
      builder[Symbol.asyncIterator] = undefined;
      return builder;
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
  assert.deepEqual(summary, { accepted: 1, failed: 0, skipped: 0, uncertain: 0 });
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
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 1 });
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
  assert.deepEqual(summary, { accepted: 0, failed: 1, skipped: 0, uncertain: 0 });
  assert.equal(sendCalls, 0);
  assert.equal(sb.rows.find((r) => r.id === 'a').status, 'failed');
  assert.equal(sb.rows.find((r) => r.id === 'a').last_error, 'max_attempts_reached');
});

test('dispatchRegistrationWelcomeOutbox never marks a simulated send as sent', async () => {
  const payload = { messaging_product: 'whatsapp', type: 'template', to: '919970897799', template: { name: META_TEMPLATE.CUSTOMER_REGISTRATION, language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Soyab' }] }] } };
  const sb = mockSupabase([{ id: 'a', user_id: 'u1', template: META_TEMPLATE.CUSTOMER_REGISTRATION, status: 'pending', payload }]);
  // default sender = real connector, which simulates under NODE_ENV=test
  const summary = await dispatchRegistrationWelcomeOutbox(sb);
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 1, uncertain: 0 });
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
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 1, uncertain: 0 });
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
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 0 });
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
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 1, uncertain: 0 });
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
  assert.deepEqual(summaryB, { accepted: 0, failed: 0, skipped: 0, uncertain: 0 }, 'concurrent run sees no claimable rows');
  release();
  const summaryA = await runA;
  assert.deepEqual(summaryA, { accepted: 1, failed: 0, skipped: 0, uncertain: 0 });
  assert.equal(sends, 1, 'exactly one send happened for one queued row');
  assert.equal(sb.rows.find((r) => r.id === 'r-race').status, 'accepted');
});

test('dispatch HOLDS orphaned sending claims older than 10 minutes (crashed worker may have delivered)', async () => {
  const sb = mockSupabase([
    { id: 'r-stale', user_id: 'u-customer', template: 'bmp_customer_registration_received', payload: DISPATCH_PAYLOAD, status: 'sending', updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
  ]);
  let sends = 0;
  const summary = await dispatchRegistrationWelcomeOutbox(sb, { sendImpl: async () => { sends++; return { success: true }; } });
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 0 });
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
  assert.deepEqual(summary, { accepted: 0, failed: 0, skipped: 0, uncertain: 0 });
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
