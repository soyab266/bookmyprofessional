// Server-only registration welcome outbox for Meta Cloud API WhatsApp sends.
// Never import from a client component.
//
// Queues a welcome WhatsApp (approved template) when a customer or
// professional registers with WhatsApp consent, and dispatches queued rows
// through the Meta connector. Delivery is consent-only: no consent, no row.

import { hasWhatsAppConsent } from './whatsapp.js';
import {
  META_TEMPLATE,
  buildCustomerRegistrationReceived,
  buildProfessionalRegistrationReceived,
} from './meta-whatsapp-templates.js';
import { sendMetaTemplateMessage, classifySendOutcome } from './meta-whatsapp.js';
import { isMetaTrackingEnabled, reconcileStagedStatusEvents } from './meta-tracking.js';

export const OUTBOX_TABLE = 'notification_outbox';

function welcomeTemplateForRole(role) {
  return role === 'professional' ? META_TEMPLATE.PRO_REGISTRATION : META_TEMPLATE.CUSTOMER_REGISTRATION;
}

function buildWelcomePayload(profile) {
  return profile.role === 'professional'
    ? buildProfessionalRegistrationReceived({ to: profile.phone, professionalName: profile.full_name })
    : buildCustomerRegistrationReceived({ to: profile.phone, customerName: profile.full_name });
}

/**
 * Queue a registration welcome message for a profile.
 *
 * @param {object} supabase - service-role client
 * @param {object} profile  - { id, full_name, phone, role, whatsapp_consent, notification_prefs }
 * @returns {Promise<{queued: boolean, reason?: string, id?: string}>}
 */
export async function queueRegistrationWelcome(supabase, profile) {
  if (!supabase || typeof supabase.from !== 'function') {
    return { queued: false, reason: 'no_supabase' };
  }
  if (!profile?.id) {
    return { queued: false, reason: 'missing_profile_id' };
  }
  if (!hasWhatsAppConsent(profile)) {
    return { queued: false, reason: 'no_consent_or_phone' };
  }

  const template = welcomeTemplateForRole(profile.role);
  const payload = buildWelcomePayload(profile);
  if (!payload) {
    return { queued: false, reason: 'payload_build_failed' };
  }

  try {
    // Dedupe: do not queue a second welcome while one is pending or already sent.
    const { data: existing, error: readError } = await supabase
      .from(OUTBOX_TABLE)
      .select('id, status')
      .eq('user_id', profile.id)
      .eq('template', template)
      .in('status', ['pending', 'accepted']);

    if (readError) {
      return { queued: false, reason: `read_failed: ${readError.message}` };
    }
    if (existing && existing.length) {
      return { queued: false, reason: 'already_queued_or_sent', id: existing[0].id };
    }

    const { data, error } = await supabase
      .from(OUTBOX_TABLE)
      .insert({
        user_id: profile.id,
        channel: 'whatsapp',
        template,
        payload,
        status: 'pending',
      })
      .select('id');

    if (error) {
      return { queued: false, reason: `insert_failed: ${error.message}` };
    }
    return { queued: true, id: data?.[0]?.id };
  } catch (err) {
    return { queued: false, reason: `exception: ${err?.message || err}` };
  }
}

/**
 * List pending outbox rows, oldest first.
 */
export async function listPendingOutbox(supabase, { limit = 50 } = {}) {
  if (!supabase || typeof supabase.from !== 'function') return [];
  try {
    const { data, error } = await supabase
      .from(OUTBOX_TABLE)
      .select('id, user_id, template, payload, attempts')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

async function updateOutbox(supabase, id, fields) {
  try {
    const { error } = await supabase
      .from(OUTBOX_TABLE)
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      // best-effort status update, but never silent: a failed write (e.g.
      // tracking enabled before its storage migration is applied) must be
      // visible in logs - the row's persisted state may now be stale.
      console.error('[Outbox] status update failed:', error.message || error);
    }
  } catch (err) {
    console.error('[Outbox] status update exception:', err?.message || err);
  }
}

// Duplicate-send protection: a row is claimed atomically (pending -> sending)
// before any send attempt. A second concurrent dispatcher processing the same
// pending batch loses the claim (zero rows updated) and skips the row, so one
// queued message can never be sent twice by overlapping runs.
async function claimOutboxRow(supabase, id) {
  try {
    const { data, error } = await supabase
      .from(OUTBOX_TABLE)
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id');
    if (error) return false;
    return (data || []).length > 0;
  } catch {
    // Claim failure is safe: the row stays pending for a later run.
    return false;
  }
}

// Claims older than this are treated as orphaned (worker crashed mid-send)
// and returned to pending at the start of the next dispatch.
const STALE_CLAIM_MS = 10 * 60 * 1000;

/**
 * Dispatch pending welcome messages through the Meta connector.
 *
 * @param {object} supabase - service-role client
 * @param {object} [deps]
 * @param {Function} [deps.sendImpl] - defaults to sendMetaTemplateMessage (tests inject)
 * @param {number}   [deps.limit]
 * @param {number}   [deps.maxAttempts] - rows at or above this count are marked failed
 * @returns {Promise<{accepted: number, failed: number, skipped: number, uncertain: number}>}
 */
export async function dispatchRegistrationWelcomeOutbox(supabase, { sendImpl, limit = 50, maxAttempts = 5 } = {}) {
  const send = sendImpl || sendMetaTemplateMessage;

  // Read the queue directly so a database failure is distinguishable from a
  // genuinely empty queue. (listPendingOutbox intentionally swallows errors
  // for callers that only need a best-effort list; the dispatcher must not -
  // a failed read that looks like "nothing to send" would hide an outage.)
  if (!supabase || typeof supabase.from !== 'function') {
    return { accepted: 0, failed: 0, skipped: 0, uncertain: 0, error: 'queue_read_failed: no_supabase' };
  }
  // Orphaned claims (crashed/interrupted worker) are HELD for reconciliation,
  // never automatically resent: the crashed worker may have delivered the
  // message before dying, so resending would be a duplicate loop. A live
  // worker's fresh claim is never touched.
  try {
    await supabase
      .from(OUTBOX_TABLE)
      .update({ status: 'uncertain', last_error: 'stale_claim_uncertain', updated_at: new Date().toISOString() })
      .eq('status', 'sending')
      .lt('updated_at', new Date(Date.now() - STALE_CLAIM_MS).toISOString());
  } catch {
    // best effort
  }

  let rows;
  try {
    const { data, error: readError } = await supabase
      .from(OUTBOX_TABLE)
      .select('id, user_id, template, payload, attempts')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);
    if (readError) {
      return { accepted: 0, failed: 0, skipped: 0, uncertain: 0, error: `queue_read_failed: ${readError.message || readError}` };
    }
    rows = data || [];
  } catch (err) {
    return { accepted: 0, failed: 0, skipped: 0, uncertain: 0, error: `queue_read_failed: ${err?.message || err}` };
  }

  let accepted = 0;
  let failed = 0;
  let skipped = 0;
  let uncertain = 0;

  // Fresh consent check at dispatch: queue-time consent is not enough - a
  // user who opted out (or whose phone/consent changed) while queued must not
  // be sent to. When current consent cannot be established, the safe behavior
  // is NO SEND.
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  let profilesById = new Map();
  let consentReadFailed = false;
  if (userIds.length) {
    try {
      const { data: profs, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, phone, whatsapp_consent, notification_prefs')
        .in('id', userIds);
      if (profErr) {
        consentReadFailed = true;
      } else {
        profilesById = new Map((profs || []).map((p) => [p.id, p]));
      }
    } catch {
      consentReadFailed = true;
    }
  }

  for (const row of rows) {
    if ((row.attempts ?? 0) >= maxAttempts) {
      await updateOutbox(supabase, row.id, { status: 'failed', last_error: 'max_attempts_reached' });
      failed++;
      continue;
    }

    if (consentReadFailed) {
      // Consent could not be checked (transient read failure): keep the row
      // pending without burning an attempt, and do not send.
      await updateOutbox(supabase, row.id, { last_error: 'consent_check_failed' });
      skipped++;
      continue;
    }
    const profile = profilesById.get(row.user_id);
    if (!profile) {
      // The profile is gone: no consent can be established - terminal no-send.
      await updateOutbox(supabase, row.id, { status: 'skipped', last_error: 'profile_unavailable' });
      skipped++;
      continue;
    }
    if (!hasWhatsAppConsent(profile)) {
      // Consent withdrawn (or phone removed) after queueing - terminal no-send.
      await updateOutbox(supabase, row.id, { status: 'skipped', last_error: 'consent_withdrawn' });
      skipped++;
      continue;
    }

    // Atomically claim the row before sending: if another dispatcher claimed
    // it first (or the claim write failed), skip - never double-send.
    const claimed = await claimOutboxRow(supabase, row.id);
    if (!claimed) {
      skipped++;
      continue;
    }

    const result = await send(row.payload);
    if (result?.simulated) {
      // A simulated send is not a delivery: never mark the row sent and never
      // burn an attempt. Release the claim back to pending.
      await updateOutbox(supabase, row.id, { status: 'pending', last_error: 'simulated_not_sent' });
      skipped++;
    } else if (result?.success) {
      // Meta ACCEPTED the message (wamid returned). Acceptance is not
      // delivery: without status webhooks we never learn the final
      // disposition, so the terminal state is 'accepted', not 'delivered'.
      // If this persistence write fails, the row stays 'sending' and the
      // stale-claim sweep later holds it as 'uncertain' - it can never
      // return to pending and be resent automatically.
      const acceptedUpdate = {
        status: 'accepted',
        attempts: (row.attempts ?? 0) + 1,
        accepted_at: new Date().toISOString(),
        last_error: null,
      };
      // Delivery tracking only when explicitly enabled (storage migration +
      // env approved). The wamid rides on the SAME write as the acceptance
      // mark - no extra write path - so a persistence failure keeps the
      // existing semantics exactly (row held, never auto-resent). When
      // disabled, the update is identical to before; the disabled state is
      // reported in the dispatch result, never silent.
      if (isMetaTrackingEnabled()) {
        if (result.metaMessageId) {
          acceptedUpdate.meta_message_id = result.metaMessageId;
        } else {
          console.error('[MetaTracking] enabled but Meta response carried no message id; acceptance recorded without tracking id.');
        }
      }
      await updateOutbox(supabase, row.id, acceptedUpdate);
      // Reconcile any status events that arrived before this row carried the
      // wamid (webhook/acceptance race): they were staged durably, not lost.
      // Best-effort and logged; never changes the acceptance outcome.
      if (isMetaTrackingEnabled() && result.metaMessageId) {
        try {
          await reconcileStagedStatusEvents(supabase, result.metaMessageId);
        } catch (err) {
          console.error('[MetaTracking] reconcile exception:', err?.message || err);
        }
      }
      accepted++;
    } else {
      const outcome = classifySendOutcome(result);
      const err = result?.error || result?.skipped || 'unknown_error';
      if (outcome === 'not_attempted' && !String(err).startsWith('validation_failed')) {
        // Never reached Meta (e.g. missing credentials): safe to retry later.
        await updateOutbox(supabase, row.id, {
          status: 'pending',
          attempts: (row.attempts ?? 0) + 1,
          last_error: err,
        });
        skipped++;
      } else if (outcome === 'not_attempted') {
        // Validation failure: permanent payload bug, retrying never helps.
        await updateOutbox(supabase, row.id, {
          status: 'failed',
          attempts: (row.attempts ?? 0) + 1,
          last_error: err,
        });
        failed++;
      } else {
        // Uncertain: the message may have been accepted. HOLD for
        // reconciliation; never auto-resend (duplicate loop).
        await updateOutbox(supabase, row.id, {
          status: 'uncertain',
          attempts: (row.attempts ?? 0) + 1,
          last_error: err,
        });
        uncertain++;
      }
    }
  }

  return {
    accepted,
    failed,
    skipped,
    uncertain,
    tracking: isMetaTrackingEnabled() ? 'enabled' : 'disabled',
  };
}
