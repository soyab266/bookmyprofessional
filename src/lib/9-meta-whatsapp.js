// Server-only Meta Cloud API WhatsApp connector.
// Never import from a client component.
//
// Sends the four approved Utility templates (see meta-whatsapp-templates.js)
// through the Meta WhatsApp Cloud API. Environment:
//   META_WHATSAPP_ACCESS_TOKEN    - system-user access token (server-side only)
//   META_WHATSAPP_PHONE_NUMBER_ID - the production phone number ID
//   META_WHATSAPP_GRAPH_VERSION   - optional Graph API version (default v21.0)
//   META_WHATSAPP_SIMULATE        - 'true' forces simulated sends
//
// Every public function fails safe: it never throws and never sends without
// the recipient's WhatsApp consent.

import { hasWhatsAppConsent } from './whatsapp.js';
import {
  buildCustomerBookingReceived,
  buildProfessionalBookingRequest,
  buildCustomerRegistrationReceived,
  buildProfessionalRegistrationReceived,
} from './meta-whatsapp-templates.js';
import { validateTemplateMessage } from './meta-whatsapp-validate.js';

const DEFAULT_GRAPH_VERSION = 'v21.0';

/**
 * Low-level send of a validated template payload.
 *
 * @param {object} payload - built by meta-whatsapp-templates.js
 * @param {object} [deps]
 * @param {Function} [deps.fetchImpl] - injected fetch for tests
 * @returns {Promise<{success: boolean, simulated?: boolean, skipped?: string,
 *                    status?: number, metaMessageId?: string, error?: string}>}
 */
export async function sendMetaTemplateMessage(payload, { fetchImpl } = {}) {
  const check = validateTemplateMessage(payload);
  if (!check.ok) {
    return { success: false, error: `validation_failed: ${check.errors.join(',')}` };
  }

  // Never hit the network from tests or when simulation is forced.
  if (process.env.NODE_ENV === 'test' || process.env.META_WHATSAPP_SIMULATE === 'true') {
    return { success: true, simulated: true };
  }

  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    console.warn('[MetaWhatsApp] META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID not set; send skipped.');
    return { success: false, skipped: 'missing_credentials' };
  }

  const version = process.env.META_WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  const doFetch = fetchImpl || fetch;

  try {
    const res = await doFetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(check.sanitised),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[MetaWhatsApp] send failed (${res.status}): ${errText || res.statusText}`);
      return { success: false, status: res.status, error: errText || res.statusText };
    }

    const data = await res.json().catch(() => ({}));
    return { success: true, status: res.status, metaMessageId: data?.messages?.[0]?.id };
  } catch (err) {
    console.error('[MetaWhatsApp] send error:', err?.message || err);
    return { success: false, error: err?.message || 'network_error' };
  }
}

/**
 * Fetch profiles helper (mirrors whatsapp.js, kept local so this module can
 * run standalone).
 */
async function getProfiles(supabase, ids) {
  const profileIds = ids.filter(Boolean);
  if (!profileIds.length || !supabase || typeof supabase.from !== 'function') return [];
  try {
    const table = supabase.from('profiles');
    if (!table || typeof table.select !== 'function') return [];
    const query = table.select('id, full_name, phone, whatsapp_consent, notification_prefs');
    if (!query || typeof query.in !== 'function') return [];
    const { data } = await query.in('id', profileIds);
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Send a template message to one profile, honouring consent.
 * @returns {Promise<{sent: boolean, reason?: string, result?: object}>}
 */
async function sendToProfile(profile, buildPayload, deps) {
  if (!hasWhatsAppConsent(profile)) {
    return { sent: false, reason: 'no_consent_or_phone' };
  }
  const payload = buildPayload(profile);
  if (!payload) {
    return { sent: false, reason: 'payload_build_failed' };
  }
  const result = await sendMetaTemplateMessage(payload, deps);
  return { sent: result.success === true, result };
}

/**
 * Booking confirmation: customer (bmp_booking_received) and professional
 * (bmp_professional_booking_request). Mirrors notifyBookingConfirmed in
 * whatsapp.js so it can replace the Brevo path at the call site.
 */
export async function notifyBookingConfirmedMeta(booking, supabase, deps) {
  if (!booking || !supabase) return { customer: null, professional: null };
  try {
    const profiles = await getProfiles(supabase, [booking.customer_id, booking.professional_id]);
    const customer = profiles.find((p) => p.id === booking.customer_id);
    const pro = profiles.find((p) => p.id === booking.professional_id);

    const [customerResult, proResult] = await Promise.all([
      customer
        ? sendToProfile(customer, (p) => buildCustomerBookingReceived({ to: p.phone, customerName: p.full_name, booking }), deps)
        : { sent: false, reason: 'profile_not_found' },
      pro
        ? sendToProfile(pro, (p) => buildProfessionalBookingRequest({ to: p.phone, professionalName: p.full_name, booking }), deps)
        : { sent: false, reason: 'profile_not_found' },
    ]);

    return { customer: customerResult, professional: proResult };
  } catch (err) {
    console.error('[MetaWhatsApp] notifyBookingConfirmedMeta error:', err?.message || err);
    return { customer: null, professional: null, error: err?.message };
  }
}

/**
 * Registration welcome for a freshly registered profile.
 * Picks the customer or professional template from the role.
 *
 * @param {object} profile - { full_name, phone, whatsapp_consent, notification_prefs, role }
 */
export async function sendRegistrationWelcomeMeta(profile, deps) {
  const role = profile?.role === 'professional' ? 'professional' : 'customer';
  const build = (p) =>
    role === 'professional'
      ? buildProfessionalRegistrationReceived({ to: p.phone, professionalName: p.full_name })
      : buildCustomerRegistrationReceived({ to: p.phone, customerName: p.full_name });
  return sendToProfile(profile, build, deps);
}
