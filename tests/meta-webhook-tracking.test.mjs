import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

process.env.NODE_ENV = 'test';

import {
  verifyMetaWebhookSignature,
  splitMetaWebhookPayload,
  recordMetaStatusUpdate,
  stageMetaStatusEvent,
  reconcileStagedStatusEvents,
  isMetaTrackingEnabled,
  STATUS_RANK,
} from '../src/lib/meta-tracking.js';

const routeSrc = readFileSync(
  new URL('../src/app/api/webhooks/meta-whatsapp/route.js', import.meta.url),
  'utf8'
);
const outboxSrc = readFileSync(
  new URL('../src/lib/registration-outbox.js', import.meta.url),
  'utf8'
);
const migrationSql = readFileSync(
  new URL('../supabase/registration_welcome_meta_tracking.sql', import.meta.url),
  'utf8'
);

function sign(body, secret) {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

// --- In-memory supabase mock over the two tracking tables ---

function project(row, cols) {
  if (!cols || cols === '*') return { ...row };
  const out = {};
  for (const c of cols.split(',').map((s) => s.trim())) out[c] = row[c];
  return out;
}

function mockDb(initial = {}) {
  const tables = {
    notification_outbox: [],
    meta_status_events: [],
    ...initial,
  };
  return {
    tables,
    from(name) {
      const rows = tables[name];
      if (!rows) throw new Error(`unknown table ${name}`);
      const q = {
        _mode: 'select',
        _cols: '*',
        _filters: [],
        _fields: null,
        _limit: null,
        select(cols) {
          q._mode = 'select';
          q._cols = cols;
          return q;
        },
        insert(r) {
          q._mode = 'insert';
          q._fields = r;
          return q;
        },
        update(f) {
          q._mode = 'update';
          q._fields = f;
          return q;
        },
        delete() {
          q._mode = 'delete';
          return q;
        },
        eq(c, v) {
          q._filters.push([c, v]);
          return q;
        },
        limit(n) {
          q._limit = n;
          return q;
        },
        then(resolve) {
          const match = () => rows.filter((r) => q._filters.every(([c, v]) => r[c] === v));
          let out = { data: null, error: null };
          if (q._mode === 'select') {
            let m = match().map((r) => project(r, q._cols));
            if (q._limit) m = m.slice(0, q._limit);
            out = { data: m, error: null };
          } else if (q._mode === 'update') {
            for (const r of match()) Object.assign(r, q._fields);
          } else if (q._mode === 'insert') {
            rows.push({
              id: `${name}-${rows.length + 1}`,
              received_at: '2026-11-18T00:00:01.000Z',
              ...q._fields,
            });
          } else if (q._mode === 'delete') {
            const doomed = new Set(match());
            for (let i = rows.length - 1; i >= 0; i--) if (doomed.has(rows[i])) rows.splice(i, 1);
          }
          return Promise.resolve(out).then(resolve);
        },
      };
      return q;
    },
  };
}

const UPD = (over = {}) => ({
  metaMessageId: 'wamid.ABC',
  status: 'delivered',
  statusAt: '2026-11-18T10:20:00.000Z',
  error: null,
  ...over,
});

// --- Signature verification ---

test('signature: valid header passes', () => {
  const body = '{"entry":[]}';
  assert.equal(verifyMetaWebhookSignature(body, sign(body, 's3cr3t'), 's3cr3t'), true);
});

test('signature: wrong secret, tampered body, malformed header all fail closed', () => {
  const body = '{"entry":[]}';
  assert.equal(verifyMetaWebhookSignature(body, sign(body, 'other'), 's3cr3t'), false);
  assert.equal(verifyMetaWebhookSignature(body + 'x', sign(body, 's3cr3t'), 's3cr3t'), false);
  assert.equal(verifyMetaWebhookSignature(body, 'sha256=zzzz', 's3cr3t'), false);
  assert.equal(verifyMetaWebhookSignature(body, null, 's3cr3t'), false);
  assert.equal(verifyMetaWebhookSignature(body, sign(body, 's3cr3t'), ''), false);
  assert.equal(verifyMetaWebhookSignature(body, sign(body, 's3cr3t'), undefined), false);
});

// --- Payload splitting ---

const SAMPLE_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '2609598592879698',
      changes: [
        {
          field: 'messages',
          value: {
            statuses: [
              { id: 'wamid.ABC', status: 'sent', timestamp: '1763364000' },
              {
                id: 'wamid.ABC',
                status: 'failed',
                timestamp: '1763367600',
                errors: [{ code: 131026, title: 'Message undeliverable.' }],
              },
            ],
            messages: [
              { from: '919970897799', id: 'wamid.INBOUND', type: 'text', text: { body: 'hi' } },
            ],
          },
        },
      ],
    },
  ],
};

test('split: statuses extracted with timestamps and error, inbound counted not captured', () => {
  const { statuses, inboundMessageCount } = splitMetaWebhookPayload(SAMPLE_PAYLOAD);
  assert.equal(statuses.length, 2);
  assert.equal(inboundMessageCount, 1);
  assert.equal(statuses[0].metaMessageId, 'wamid.ABC');
  assert.equal(statuses[0].status, 'sent');
  assert.equal(statuses[0].statusAt, new Date(1763364000 * 1000).toISOString());
  assert.equal(statuses[1].status, 'failed');
  assert.match(statuses[1].error, /131026/);
  // inbound content never appears in the status extraction
  assert.equal(JSON.stringify(statuses).includes('hi'), false);
});

test('split: malformed and empty payloads yield nothing', () => {
  assert.deepEqual(splitMetaWebhookPayload(null), { statuses: [], inboundMessageCount: 0 });
  assert.deepEqual(splitMetaWebhookPayload({}), { statuses: [], inboundMessageCount: 0 });
  assert.deepEqual(splitMetaWebhookPayload({ entry: [{ changes: [{ value: {} }] }] }), {
    statuses: [],
    inboundMessageCount: 0,
  });
});

// --- Status recording against the outbox ---

test('record: known wamid updates delivery fields, unknown wamid reported unmatched', async () => {
  const db = mockDb({
    notification_outbox: [{ id: 'row-1', meta_message_id: 'wamid.ABC', delivery_status: null }],
  });

  const ok = await recordMetaStatusUpdate(db, UPD());
  assert.deepEqual(ok, { matched: true, applied: true });
  assert.equal(db.tables.notification_outbox[0].delivery_status, 'delivered');
  assert.equal(db.tables.notification_outbox[0].delivery_status_at, '2026-11-18T10:20:00.000Z');

  const miss = await recordMetaStatusUpdate(db, UPD({ metaMessageId: 'wamid.UNKNOWN', statusAt: null }));
  assert.deepEqual(miss, { matched: false, reason: 'unknown_message_id' });
});

// --- Ordering and dedup guard ---

test('ordering: forward progression applies; regression and duplicates are skipped', async () => {
  const db = mockDb({
    notification_outbox: [{ id: 'row-1', meta_message_id: 'wamid.ABC', delivery_status: null }],
  });
  const row = db.tables.notification_outbox[0];

  let r = await recordMetaStatusUpdate(db, UPD({ status: 'sent', statusAt: '2026-11-18T10:19:55.000Z' }));
  assert.equal(r.applied, true);
  assert.equal(row.delivery_status, 'sent');

  r = await recordMetaStatusUpdate(db, UPD({ status: 'delivered' }));
  assert.equal(r.applied, true);
  assert.equal(row.delivery_status, 'delivered');

  // Out-of-order: a late/retried 'sent' must not regress 'delivered'.
  r = await recordMetaStatusUpdate(db, UPD({ status: 'sent', statusAt: '2026-11-18T10:19:55.000Z' }));
  assert.deepEqual(r, { matched: true, applied: false, reason: 'stale_or_duplicate' });
  assert.equal(row.delivery_status, 'delivered');

  // Duplicate 'delivered' is idempotent: no rewrite.
  r = await recordMetaStatusUpdate(db, UPD({ status: 'delivered' }));
  assert.deepEqual(r, { matched: true, applied: false, reason: 'stale_or_duplicate' });
  assert.equal(row.delivery_status, 'delivered');

  r = await recordMetaStatusUpdate(db, UPD({ status: 'read', statusAt: '2026-11-18T10:25:00.000Z' }));
  assert.equal(r.applied, true);
  assert.equal(row.delivery_status, 'read');

  // 'failed' is terminal-rank and overwrites any earlier state.
  r = await recordMetaStatusUpdate(db, UPD({ status: 'failed', error: '131026 Message undeliverable.' }));
  assert.equal(r.applied, true);
  assert.equal(row.delivery_status, 'failed');
  assert.equal(row.delivery_error, '131026 Message undeliverable.');

  assert.ok(STATUS_RANK.failed > STATUS_RANK.read && STATUS_RANK.read > STATUS_RANK.delivered);
});

// --- Race: staged events survive and reconcile at acceptance ---

test('race: unmatched status stages durably; reconciliation applies furthest-along and clears staging', async () => {
  const db = mockDb();

  // Webhook arrives before the acceptance save: no row holds the wamid.
  const direct = await recordMetaStatusUpdate(db, UPD({ status: 'sent' }));
  assert.equal(direct.matched, false);

  const s1 = await stageMetaStatusEvent(db, UPD({ status: 'sent', statusAt: '2026-11-18T10:19:55.000Z' }));
  const s2 = await stageMetaStatusEvent(db, UPD({ status: 'delivered' }));
  assert.equal(s1.staged, true);
  assert.equal(s2.staged, true);
  assert.equal(db.tables.meta_status_events.length, 2);

  // Dispatcher saves the acceptance row carrying the wamid, then reconciles.
  db.tables.notification_outbox.push({ id: 'row-1', meta_message_id: 'wamid.ABC', delivery_status: null });
  const rec = await reconcileStagedStatusEvents(db, 'wamid.ABC');
  assert.deepEqual(rec, { applied: true, matched: true, staged: 2 });
  // Furthest-along staged status wins, not necessarily the first to arrive.
  assert.equal(db.tables.notification_outbox[0].delivery_status, 'delivered');
  // Staging cleared for this wamid.
  assert.equal(db.tables.meta_status_events.length, 0);
});

test('reconcile: no staged rows is a no-op; staged rows respect the forward-only guard', async () => {
  const db = mockDb();
  assert.deepEqual(await reconcileStagedStatusEvents(db, 'wamid.NONE'), { applied: false, staged: 0 });

  // Row already further along than the staged event: guard keeps it, staging still cleared.
  db.tables.notification_outbox.push({ id: 'row-1', meta_message_id: 'wamid.ABC', delivery_status: 'read' });
  await stageMetaStatusEvent(db, UPD({ status: 'sent' }));
  const rec = await reconcileStagedStatusEvents(db, 'wamid.ABC');
  assert.deepEqual(rec, { applied: false, matched: true, staged: 1 });
  assert.equal(db.tables.notification_outbox[0].delivery_status, 'read');
  assert.equal(db.tables.meta_status_events.length, 0);
});

test('stage: never throws on invalid input; error detail is retained', async () => {
  const db = mockDb();
  assert.deepEqual(await stageMetaStatusEvent(db, null), { staged: false, reason: 'invalid_update' });
  assert.deepEqual(await stageMetaStatusEvent(db, { status: 'sent' }), {
    staged: false,
    reason: 'invalid_update',
  });
  const ok = await stageMetaStatusEvent(db, UPD({ status: 'failed', error: '131026 Message undeliverable.' }));
  assert.equal(ok.staged, true);
  assert.equal(db.tables.meta_status_events[0].error, '131026 Message undeliverable.');
});

// --- Tracking flag ---

test('tracking flag: only the exact string true enables', () => {
  delete process.env.META_WHATSAPP_TRACKING_ENABLED;
  assert.equal(isMetaTrackingEnabled(), false);
  process.env.META_WHATSAPP_TRACKING_ENABLED = '1';
  assert.equal(isMetaTrackingEnabled(), false);
  process.env.META_WHATSAPP_TRACKING_ENABLED = 'true';
  assert.equal(isMetaTrackingEnabled(), true);
  delete process.env.META_WHATSAPP_TRACKING_ENABLED;
});

// --- Wiring: route and dispatcher stay fail-closed and explicit ---

test('route: signature verified before parsing; disabled tracking drops loudly', () => {
  const verifyIdx = routeSrc.indexOf('verifyMetaWebhookSignature(');
  const parseIdx = routeSrc.indexOf('JSON.parse(');
  assert.ok(verifyIdx > -1 && parseIdx > verifyIdx, 'signature must be verified before JSON.parse');
  assert.match(routeSrc, /tracking disabled; dropped without recording/);
  assert.match(routeSrc, /reply content is not stored/);
  // fails closed without app secret
  assert.match(routeSrc, /if \(!appSecret\)/);
});

test('route: unmatched statuses are staged, never dropped; stale events counted', () => {
  assert.match(routeSrc, /stageMetaStatusEvent/);
  assert.match(routeSrc, /staged for later reconciliation|staged durably/i);
  assert.match(routeSrc, /matched, stale, staged/);
});

test('route: GET challenge fails closed without verify token', () => {
  assert.match(routeSrc, /META_WHATSAPP_WEBHOOK_VERIFY_TOKEN/);
  assert.match(routeSrc, /if \(verifyToken && mode === 'subscribe' && token === verifyToken/);
});

test('dispatcher: wamid only persisted when tracking enabled; result reports tracking state', () => {
  assert.match(outboxSrc, /if \(isMetaTrackingEnabled\(\)\) \{\s*if \(result\.metaMessageId\)/);
  assert.match(outboxSrc, /tracking: isMetaTrackingEnabled\(\) \? 'enabled' : 'disabled'/);
  // acceptance write still sets accepted + accepted_at in the same update
  assert.match(outboxSrc, /status: 'accepted',[\s\S]{0,200}accepted_at: new Date/);
});

test('dispatcher: reconciles staged events right after the acceptance write, best-effort', () => {
  const saveIdx = outboxSrc.indexOf('await updateOutbox(supabase, row.id, acceptedUpdate);');
  const recIdx = outboxSrc.indexOf('reconcileStagedStatusEvents(supabase, result.metaMessageId)');
  assert.ok(saveIdx > -1 && recIdx > saveIdx, 'reconcile must run after the acceptance write');
  assert.match(outboxSrc, /never changes the acceptance outcome/);
});

test('migration: draft-only header, adds tracking columns, lookup index, and staging table', () => {
  assert.match(migrationSql, /Draft migration for review - NOT applied/);
  assert.match(migrationSql, /add column if not exists meta_message_id text/);
  assert.match(migrationSql, /add column if not exists delivery_status text/);
  assert.match(migrationSql, /notification_outbox_meta_message_id/);
  assert.match(migrationSql, /create table if not exists public\.meta_status_events/);
  assert.match(migrationSql, /meta_status_events_meta_message_id/);
});
