// Server-only Meta webhook delivery-tracking helpers.
// Never import from a client component.
//
// Tracking is OFF unless META_WHATSAPP_TRACKING_ENABLED === 'true', which must
// only be set after its storage migration and Meta webhook configuration are
// approved and in place. Everything here fails closed and visibly: disabled
// tracking is reported as disabled, never silently dropped, and a write
// failure is logged, never swallowed.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const META_TRACKING_ENV = 'META_WHATSAPP_TRACKING_ENABLED';

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
 * message id stored at acceptance). Never throws. An update whose message id
 * no row holds - e.g. a message accepted before tracking existed - is
 * reported unmatched, not treated as an error.
 *
 * @returns {Promise<{matched: boolean, reason?: string}>}
 */
export async function recordMetaStatusUpdate(supabase, update) {
  if (!supabase || !update?.metaMessageId) return { matched: false, reason: 'invalid_update' };
  try {
    const { data, error } = await supabase
      .from('notification_outbox')
      .update({
        delivery_status: update.status,
        delivery_status_at: update.statusAt || new Date().toISOString(),
        delivery_error: update.error,
        updated_at: new Date().toISOString(),
      })
      .eq('meta_message_id', update.metaMessageId)
      .select('id');
    if (error) {
      console.error('[MetaTracking] status update write failed:', error.message || error);
      return { matched: false, reason: 'write_failed' };
    }
    if (!data || !data.length) return { matched: false, reason: 'unknown_message_id' };
    return { matched: true };
  } catch (err) {
    console.error('[MetaTracking] status update exception:', err?.message || err);
    return { matched: false, reason: 'exception' };
  }
}
