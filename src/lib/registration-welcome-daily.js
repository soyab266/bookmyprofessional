// Server-only daily welcome stage. Database owns atomic eligibility, claim and cap.
import { sendMetaTemplateMessage, classifySendOutcome } from './meta-whatsapp.js';

export function isIndiaWelcomePayload(payload) {
  return /^91[6-9]\d{9}$/.test(String(payload?.to || ''))
    && payload?.type === 'template'
    && payload?.template?.language?.code === 'en'
    && ['bmp_customer_registration_received', 'bmp_professional_registration_received'].includes(payload?.template?.name);
}

export async function dispatchDailyRegistrationWelcome(supabase, { sendImpl = sendMetaTemplateMessage, limit = 15 } = {}) {
  const result = { accepted: 0, failed: 0, uncertain: 0, not_attempted: 0 };
  for (let i = 0; i < Math.min(Math.max(limit, 0), 15); i++) {
    let claim;
    try {
      const response = await supabase.rpc('claim_daily_welcome');
      if (response.error) return { ...result, error: 'daily_claim_failed' };
      claim = response.data;
    } catch {
      return { ...result, error: 'daily_claim_failed' };
    }
    if (!claim?.taken) return { ...result, stopped: claim?.reason || 'off_or_empty' };
    // A missing ticket cannot be safely settled. Keep the reservation held.
    if (!claim.ticket) return { ...result, error: 'daily_claim_invalid' };
    let outcome;
    let detail = null;
    if (!isIndiaWelcomePayload(claim.payload)) {
      outcome = 'not_attempted';
      detail = 'daily_payload_ineligible';
    } else {
      try {
        const sent = await sendImpl(claim.payload);
        detail = sent?.error || sent?.skipped || null;
        outcome = sent?.simulated ? 'not_attempted'
          : sent?.success && sent?.metaMessageId ? 'accepted'
            : classifySendOutcome(sent);
        if (!['not_attempted', 'failed', 'uncertain', 'accepted'].includes(outcome)) outcome = 'uncertain';
      } catch {
        // Throw may have occurred after provider receipt. Never retry or release.
        outcome = 'uncertain';
        detail = 'daily_send_exception_held';
      }
    }
    try {
      const settled = await supabase.rpc('finish_daily_welcome', {
        p_ticket: claim.ticket, p_outcome: outcome, p_error: detail,
      });
      if (settled.error || settled.data !== true) return { ...result, error: 'daily_settle_failed_held' };
    } catch {
      return { ...result, error: 'daily_settle_failed_held' };
    }
    result[outcome]++;
    // No retry loop on non-attempted rows or a provider problem. Failed and
    // ambiguous requests keep their budget slot and are terminal/held in DB.
    if (outcome !== 'accepted') return result;
  }
  return result;
}
