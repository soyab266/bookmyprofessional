import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  isMetaTrackingEnabled,
  verifyMetaWebhookSignature,
  splitMetaWebhookPayload,
  recordMetaStatusUpdate,
  stageMetaStatusEvent,
} from '@/lib/meta-tracking';

/**
 * Meta WhatsApp webhook endpoint (delivery tracking).
 *
 * GET  - Meta's endpoint verification challenge (one-time, on config save).
 * POST - status events for messages we sent (sent/delivered/read/failed).
 *        A status whose wamid no outbox row holds yet (webhook/acceptance
 *        race, or pre-tracking sends) is STAGED durably and reconciled when
 *        the acceptance row is written - never dropped. Duplicates and
 *        out-of-order events are skipped by a forward-only rank guard.
 *        Inbound customer message content arriving in the same payload is
 *        counted and DISCARDED, never persisted.
 *
 * Tracking stays disabled until its storage migration, env values and
 * Meta-side configuration are approved and in place. While disabled, events
 * are dropped with an explicit log line, never silently.
 */

export async function GET(req) {
  const verifyToken = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  // Fail closed: an unset verify token must never validate.
  if (verifyToken && mode === 'subscribe' && token === verifyToken && challenge !== null) {
    return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(req) {
  const appSecret = process.env.META_APP_SECRET;
  // Fail closed: without the app secret no signature can be verified.
  if (!appSecret) {
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 401 });
  }

  const rawBody = await req.text();
  if (!verifyMetaWebhookSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  // Tracking is off until storage + config are approved: drop explicitly,
  // never silently. (Meta only sends here once the subscription is
  // configured, which is itself gated on approval.)
  if (!isMetaTrackingEnabled()) {
    console.error('[MetaTracking] event received while tracking disabled; dropped without recording.');
    return NextResponse.json({ received: true, tracking: 'disabled' });
  }

  let payload = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { statuses, inboundMessageCount } = splitMetaWebhookPayload(payload);
  if (inboundMessageCount > 0) {
    console.info(`[MetaTracking] ${inboundMessageCount} inbound message(s) discarded; reply content is not stored.`);
  }

  if (!statuses.length) {
    return NextResponse.json({ received: true, statuses: 0 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  let matched = 0;
  let stale = 0;
  let staged = 0;
  for (const update of statuses) {
    const result = await recordMetaStatusUpdate(supabase, update);
    if (result.matched && result.applied !== false) {
      matched++;
    } else if (result.matched) {
      // Duplicate or out-of-order: row already at a further-along state.
      stale++;
    } else {
      // No row holds this wamid yet (webhook/acceptance race or pre-tracking
      // send): stage durably for reconciliation instead of dropping.
      const s = await stageMetaStatusEvent(supabase, update);
      if (s.staged) {
        staged++;
      } else {
        console.error('[MetaTracking] unmatched status event could not be staged; reason:', s.reason);
      }
    }
  }
  return NextResponse.json({ received: true, statuses: statuses.length, matched, stale, staged });
}
