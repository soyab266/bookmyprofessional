import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

process.env.NODE_ENV = 'test';

import {
  verifyMetaWebhookSignature,
  splitMetaWebhookPayload,
  recordMetaStatusUpdate,
  isMetaTrackingEnabled,
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

function mockSupabaseFor(rows) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, 'notification_outbox');
      return {
        update(fields) {
          calls.push({ fields });
          return {
            eq(col, val) {
              assert.equal(col, 'meta_message_id');
              const matched = rows.filter((r) => r.meta_message_id === val);
              for (const r of matched) Object.assign(r, fields);
              return {
                async select() {
                  return { data: matched.map((r) => ({ id: r.id })), error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

test('record: known wamid updates delivery fields, unknown wamid reported unmatched', async () => {
  const rows = [{ id: 'row-1', meta_message_id: 'wamid.ABC' }];
  const supabase = mockSupabaseFor(rows);

  const ok = await recordMetaStatusUpdate(supabase, {
    metaMessageId: 'wamid.ABC',
    status: 'delivered',
    statusAt: '2026-11-18T10:20:00.000Z',
    error: null,
  });
  assert.equal(ok.matched, true);
  assert.equal(rows[0].delivery_status, 'delivered');
  assert.equal(rows[0].delivery_status_at, '2026-11-18T10:20:00.000Z');

  const miss = await recordMetaStatusUpdate(supabase, {
    metaMessageId: 'wamid.UNKNOWN',
    status: 'delivered',
    statusAt: null,
    error: null,
  });
  assert.equal(miss.matched, false);
  assert.equal(miss.reason, 'unknown_message_id');
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

test('migration: draft-only header, adds tracking columns and lookup index', () => {
  assert.match(migrationSql, /Draft migration for review - NOT applied/);
  assert.match(migrationSql, /add column if not exists meta_message_id text/);
  assert.match(migrationSql, /add column if not exists delivery_status text/);
  assert.match(migrationSql, /notification_outbox_meta_message_id/);
});
