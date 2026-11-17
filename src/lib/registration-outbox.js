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
import { sendMetaTemplateMessage } from './meta-whatsapp.js';

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
      .in('status', ['pending', 'sent']);

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
    await supabase
      .from(OUTBOX_TABLE)
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    // best-effort status update
  }
}

/**
 * Dispatch pending welcome messages through the Meta connector.
 *
 * @param {object} supabase - service-role client
 * @param {object} [deps]
 * @param {Function} [deps.sendImpl] - defaults to sendMetaTemplateMessage (tests inject)
 * @param {number}   [deps.limit]
 * @param {number}   [deps.maxAttempts] - rows at or above this count are marked failed
 * @returns {Promise<{sent: number, failed: number, skipped: number}>}
 */
export async function dispatchRegistrationWelcomeOutbox(supabase, { sendImpl, limit = 50, maxAttempts = 5 } = {}) {
  const send = sendImpl || sendMetaTemplateMessage;

  // Read the queue directly so a database failure is distinguishable from a
  // genuinely empty queue. (listPendingOutbox intentionally swallows errors
  // for callers that only need a best-effort list; the dispatcher must not -
  // a failed read that looks like "nothing to send" would hide an outage.)
  if (!supabase || typeof supabase.from !== 'function') {
    return { sent: 0, failed: 0, skipped: 0, error: 'queue_read_failed: no_supabase' };
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
      return { sent: 0, failed: 0, skipped: 0, error: `queue_read_failed: ${readError.message || readError}` };
    }
    rows = data || [];
  } catch (err) {
    return { sent: 0, failed: 0, skipped: 0, error: `queue_read_failed: ${err?.message || err}` };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

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

    const result = await send(row.payload);
    if (result?.simulated) {
      // A simulated send is not a delivery: never mark the row sent and never
      // burn an attempt. This keeps test/simulate modes from masking real
      // sends in production.
      await updateOutbox(supabase, row.id, { last_error: 'simulated_not_sent' });
      skipped++;
    } else if (result?.success) {
      await updateOutbox(supabase, row.id, {
        status: 'sent',
        attempts: (row.attempts ?? 0) + 1,
        sent_at: new Date().toISOString(),
        last_error: null,
      });
      sent++;
    } else {
      await updateOutbox(supabase, row.id, {
        attempts: (row.attempts ?? 0) + 1,
        last_error: result?.error || result?.skipped || 'unknown_error',
      });
      skipped++;
    }
  }

  return { sent, failed, skipped };
}
