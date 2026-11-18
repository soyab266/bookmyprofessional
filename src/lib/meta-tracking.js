// Server-only Meta webhook delivery-tracking helpers.
// Never import from a client component.
//
// Tracking is OFF unless META_WHATSAPP_TRACKING_ENABLED === 'true', which must
// only be set after its storage migration and Meta webhook configuration are
// approved and in place. Everything here fails closed and visibly: disabled
// tracking is reported as disabled, never silently dropped, and a write
// failure is logged, never swallowed.
//
// Two delivery realities are handled explicitly:
// - RACE: Meta can webhook a status before our dispatcher has saved the
//   acceptance row that carries the wamid. Such events are STAGED durably
//   (meta_status_events) and reconciled when the acceptance row is written,
//   never dropped.
// - ORDER/DEDUP: Meta may deliver duplicates or (rarely) out of order. A
//   status only moves a row FORWARD along sent < delivered < read, with
//   'failed' terminal; same-or-lower rank arrivals are skipped, so retries
//   are idempotent and a late 'sent' can never regress a 'delivered' row.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const META_TRACKING_ENV = 'META_WHATSAPP_TRACKING_ENABLED';

export const STATUS_RANK = { sent: 1, delivered: 2, read: 3, failed: 4 };

export function isMetaTrackingEnabled() {
  return process.env[META_TRACKING_ENV] === 'true';
}

/**
 * Verify Meta's X-Hub-Signature-256 header: HMAC-SHA256 of the RAW request
 * body, keyed with the app secret. Constant-time comparison; anything
 * malformed fails closed.
 *
 * @param {string} rawBody - exact request body as received
 * @param {string|null} signatureHeader - value of x-hub-signature-256
 * @param {string|undefined} appSecret - Meta app secret
 * @returns {boolean}
 */
export function verifyMetaWebhookSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || typeof rawBody !== 'string' || !signatureHeader) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(String(signatureHeader).trim());
  if (!match) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  let provided;
  try {
    provided = Buffer.from(match[1], 'hex');
  } catch {
    return false;
  }
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/**
 * Split a Meta webhook payload into outbound status updates (delivery
 * tracking) and inbound customer messages. Inbound message content is NOT
 * tracked here: it is counted so the receiver can log the discard, and never
 * persisted.
 *
 * @param {object} payload - parsed webhook JSON body
 * @returns {{statuses: Array<{metaMessageId: string, status: string, statusAt: string|null, error: string|null}>, inboundMessageCount: number}}
 */
export function splitMetaWebhookPayload(payload) {
  const statuses = [];
  let inboundMessageCount = 0;
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (!value) continue;
      for (const s of value.statuses || []) {
        if (!s?.id || !s?.status) continue;
        statuses.push({
          metaMessageId: s.id,
          status: s.status,
          statusAt: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null,
          error:
            Array.isArray(s.errors) && s.errors.length
              ? `${s.errors[0].code ?? ''} ${s.errors[0].title ?? ''}`.trim()
              : null,
        });
      }
      if (Array.isArray(value.messages)) inboundMessageCount += value.messages.length;
    }
  }
  return { statuses, inboundMessageCount };
}

/**
 * Record one status update against its outbox row (looked up by the provider
 * message id stored at acceptance). Never throws.
 *
 * Ordering/dedup guard: a status only moves the row forward (STATUS_RANK);
 * a same-or-lower rank arrival (duplicate retry or out-of-order event) is
 * reported { matched: true, applied: false } and changes nothing.
 *
 * An update whose message id no row holds - a message accepted before
 * tracking existed, or the webhook/acceptance race - is reported unmatched;
 * the caller stages it durably rather than dropping it.
 *
 * @returns {Promise<{matched: boolean, applied?: boolean, reason?: string}>}
 */
export async function recordMetaStatusUpdate(supabase, update) {
  if (!supabase || !update?.metaMessageId) return { matched: false, reason: 'invalid_update' };
  try {
    const { data: rows, error: readError } = await supabase
      .from('notification_outbox')
      .select('id, delivery_status')
      .eq('meta_message_id', update.metaMessageId)
      .limit(1);
    if (readError) {
      console.error('[MetaTracking] status read failed:', readError.message || readError);
      return { matched: false, reason: 'read_failed' };
    }
    if (!rows || !rows.length) return { matched: false, reason: 'unknown_message_id' };

    const current = rows[0].delivery_status || null;
    const currentRank = STATUS_RANK[current] ?? 0;
    const incomingRank = STATUS_RANK[update.status] ?? 0;
    if (current && currentRank >= incomingRank) {
      // Duplicate retry or out-of-order event: keep the further-along state.
      return { matched: true, applied: false, reason: 'stale_or_duplicate' };
    }

    const { error } = await supabase
      .from('notification_outbox')
      .update({
        delivery_status: update.status,
        delivery_status_at: update.statusAt || new Date().toISOString(),
        delivery_error: update.error,
        updated_at: new Date().toISOString(),
      })
      .eq('meta_message_id', update.metaMessageId);
    if (error) {
      console.error('[MetaTracking] status update write failed:', error.message || error);
      return { matched: false, reason: 'write_failed' };
    }
    return { matched: true, applied: true };
  } catch (err) {
    console.error('[MetaTracking] status update exception:', err?.message || err);
    return { matched: false, reason: 'exception' };
  }
}

/**
 * Durably stage a status event whose wamid no outbox row holds yet, so a
 * status that arrives before the acceptance save (or before a migration
 * backfill) is never lost. Staged rows are applied by
 * reconcileStagedStatusEvents and then deleted. Never throws.
 *
 * @returns {Promise<{staged: boolean, reason?: string}>}
 */
export async function stageMetaStatusEvent(supabase, update) {
  if (!supabase || !update?.metaMessageId || !update?.status) {
    return { staged: false, reason: 'invalid_update' };
  }
  try {
    const { error } = await supabase.from('meta_status_events').insert({
      meta_message_id: update.metaMessageId,
      status: update.status,
      status_at: update.statusAt || null,
      error: update.error || null,
    });
    if (error) {
      console.error('[MetaTracking] staging write failed:', error.message || error);
      return { staged: false, reason: 'write_failed' };
    }
    return { staged: true };
  } catch (err) {
    console.error('[MetaTracking] staging exception:', err?.message || err);
    return { staged: false, reason: 'exception' };
  }
}

/**
 * Apply the furthest-along staged status for a wamid (called by the
 * dispatcher right after the acceptance row is saved with its wamid), then
 * delete that wamid's staged rows. The same forward-only guard as live
 * recording applies. Never throws.
 *
 * @returns {Promise<{applied: boolean, matched?: boolean, staged: number}>}
 */
export async function reconcileStagedStatusEvents(supabase, metaMessageId) {
  if (!supabase || !metaMessageId) return { applied: false, staged: 0 };
  try {
    const { data: staged, error } = await supabase
      .from('meta_status_events')
      .select('id, status, status_at, error, received_at')
      .eq('meta_message_id', metaMessageId);
    if (error) {
      console.error('[MetaTracking] reconcile read failed:', error.message || error);
      return { applied: false, staged: 0 };
    }
    if (!staged || !staged.length) return { applied: false, staged: 0 };

    // Furthest-along wins; ties break to the later event time.
    const best = staged.reduce((a, b) => {
      const rankDiff = (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0);
      if (rankDiff !== 0) return rankDiff > 0 ? b : a;
      const ta = Date.parse(a.status_at || a.received_at || 0) || 0;
      const tb = Date.parse(b.status_at || b.received_at || 0) || 0;
      return tb > ta ? b : a;
    });

    const result = await recordMetaStatusUpdate(supabase, {
      metaMessageId,
      status: best.status,
      statusAt: best.status_at,
      error: best.error,
    });

    const { error: delError } = await supabase
      .from('meta_status_events')
      .delete()
      .eq('meta_message_id', metaMessageId);
    if (delError) {
      console.error('[MetaTracking] staged cleanup failed:', delError.message || delError);
    }
    return { applied: result.applied === true, matched: result.matched, staged: staged.length };
  } catch (err) {
    console.error('[MetaTracking] reconcile exception:', err?.message || err);
    return { applied: false, staged: 0 };
  }
}
