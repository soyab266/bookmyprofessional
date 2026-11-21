import { readProfessionalBookability } from './professional-booking-eligibility.js';
// Server-only. Review draft, no live job or activation is installed.
import { hasWhatsAppConsent } from './whatsapp.js';
import { buildCustomerBookingDetails, buildProfessionalBookingDetails, META_TEMPLATE, normaliseMetaRecipient } from './meta-whatsapp-templates.js';
import { validateTemplateMessage } from './meta-whatsapp-validate.js';
import { sendMetaTemplateMessage } from './meta-whatsapp.js';

export function bookingAlertsEnabled(env = process.env) {
  return env.META_WHATSAPP_BOOKINGS_ENABLED === 'true';
}

// Called ONLY after the existing PayU hash and amount checks in each route.
// Flag off: preserve legacy updates. Flag on: paid + minimal trusted receipt,
// never queue creation or a direct send. Receipt errors propagate, queue errors do not.
export async function confirmVerifiedPaidBooking(supabase, bookingId, amount, providerRef) {
  if (bookingAlertsEnabled()) {
    const { data, error } = await supabase.rpc('record_verified_booking_payment', {
      p_booking_id: bookingId, p_amount: amount, p_provider_ref: providerRef || null,
    });
    if (error) throw new Error('booking_confirmation_transaction_failed');
    // Preserve legacy payment-ledger update separately and best-effort. The
    // trusted provider reference is already durable on the canonical booking.
    try {
      await supabase.from('payments').update({ status: 'held', provider: 'payu', provider_ref: providerRef || null }).eq('booking_id', bookingId);
    } catch { /* canonical verified receipt remains available for reconciliation */ }
    return data || null;
  }
  // Preserve the existing flag-off behavior, including its best-effort updates.
  const { data } = await supabase.from('bookings')
    .update({ payment_status: 'paid' })
    .eq('id', bookingId).neq('payment_status', 'paid').select('*');
  await supabase.from('payments').update({ status: 'held', provider: 'payu', provider_ref: providerRef || null }).eq('booking_id', bookingId);
  return data?.[0] || null;
}

const DEFAULT_LIMIT = 10;
// Claim + reserve are one service-only SQL transaction. A claim is never reset
// to pending. Acceptance/finalization failure stays held; no automatic resend.
export async function dispatchBookingAlerts(supabase, deps = {}) {
  const summary = { accepted: 0, uncertain: 0, skipped: 0, failed: 0 };
  if (!bookingAlertsEnabled()) return { ...summary, disabled: true };
  const expanded = await supabase.rpc('expand_booking_alert_receipts', { p_limit: 25 });
  if (expanded.error || expanded.data?.errors > 0) return { ...summary, error: 'booking_expansion_failed' };
  const limit = Math.min(DEFAULT_LIMIT, Math.max(0, Number.isInteger(deps.limit) ? deps.limit : DEFAULT_LIMIT));
  const send = deps.send || sendMetaTemplateMessage;
  for (let i = 0; i < limit; i++) {
    const claim = await supabase.rpc('claim_booking_alert');
    if (claim.error) return { ...summary, error: 'booking_claim_failed' };
    const row = claim.data;
    if (!row) break;
    let status = 'uncertain';
    let messageId = null;
    let error = null;
    let release = false;
    try {
      // Do not send a delayed confirmation for a cancelled/refunded/rescheduled booking.
      const liveBooking = await supabase.from('bookings').select('id,payment_status,status,date,time_slot,service_title,customer_id,professional_id,address,total_paid').eq('id', row.booking_id).maybeSingle();
      if (liveBooking.error) throw new Error('booking_check_failed');
      const b = liveBooking.data;
      if (!b || row.booking.template_version !== 2 || b.payment_status !== 'paid' || b.status !== 'upcoming' || String(b.date) !== String(row.booking.date) || b.time_slot !== row.booking.time_slot || b.service_title !== row.booking.service_title || String(b.customer_id) !== String(row.booking.customer_id) || String(b.professional_id) !== String(row.booking.professional_id) || b.address !== row.booking.address || b.total_paid == null || row.booking.total_paid == null || Number(b.total_paid) !== Number(row.booking.total_paid) || !await readProfessionalBookability(supabase, b.professional_id)) {
        const done = await supabase.rpc('finish_booking_alert', { p_id: row.id, p_claim_token: row.claim_token, p_status: 'skipped', p_message_id: null, p_error: 'booking_changed_or_unavailable', p_release: true });
        if (done.error || done.data !== true) return { ...summary, error: 'booking_finish_failed' };
        summary.skipped++;
        continue;
      }
      const current = await supabase.from('profiles').select('id,full_name,phone,whatsapp_consent,notification_prefs').eq('id', row.user_id).maybeSingle();
      const p = current.data;
      if (current.error) {
        status = 'failed'; error = 'consent_check_failed'; release = true;
      } else if (!hasWhatsAppConsent(p)) {
        status = 'skipped'; error = 'consent_withdrawn_or_profile_missing'; release = true;
      } else if (normaliseMetaRecipient(p.phone) !== normaliseMetaRecipient(row.recipient_phone)) {
        status = 'skipped'; error = 'recipient_changed'; release = true;
      } else {
        // Fetch customer contact only for the professional, never persist it in
        // either outbox snapshot or the customer's WhatsApp payload.
        let customer = null;
        if (row.recipient_role === 'professional') {
          const contact = await supabase.from('profiles').select('id,full_name,phone')
            .eq('id', b.customer_id).maybeSingle();
          if (contact.error) throw new Error('customer_contact_check_failed');
          customer = contact.data;
        }
        const builders = {
          customer: [META_TEMPLATE.BOOKING_DETAILS, () => buildCustomerBookingDetails({ to: p.phone, customerName: p.full_name, booking: row.booking })],
          professional: [META_TEMPLATE.PRO_BOOKING_DETAILS, () => buildProfessionalBookingDetails({ to: p.phone, professionalName: p.full_name, customer, booking: row.booking })],
        };
        const builder = builders[row.recipient_role];
        const payload = builder && builder[0] === row.template ? builder[1]() : null;
        const validation = validateTemplateMessage(payload);
        if (!validation.ok) {
          status = 'failed'; error = 'validation_failed'; release = true;
        } else {
          // The SQL claim is valid only inside its own booking pilot. Check
          // again immediately before requesting Meta, not only at claim time.
          if (!row.pilot_expires_at || !Number.isFinite(Date.parse(row.pilot_expires_at)) || Date.now() >= Date.parse(row.pilot_expires_at)) {
            const done = await supabase.rpc('finish_booking_alert', { p_id: row.id, p_claim_token: row.claim_token, p_status: 'skipped', p_message_id: null, p_error: 'pilot_expired', p_release: true });
            if (done.error || done.data !== true) return { ...summary, error: 'booking_finish_failed' };
            summary.skipped++;
            continue;
          }
          // A global request cap cannot isolate a named booking or recipient.
          // Recheck the approved scope after the live booking/profile checks.
          // An unavailable/newer schema fails closed before any network request.
          const scope = await supabase.rpc('booking_alert_scope_allows', {
            p_armed_at: row.pilot_armed_at, p_booking_id: row.booking_id,
            p_user_id: row.user_id, p_role: row.recipient_role,
            p_phone: normaliseMetaRecipient(p.phone),
          });
          if (scope.error || scope.data !== true) {
            const done = await supabase.rpc('finish_booking_alert', { p_id: row.id, p_claim_token: row.claim_token, p_status: 'skipped', p_message_id: null, p_error: scope.error ? 'scope_check_failed' : 'outside_approved_scope', p_release: true });
            if (done.error || done.data !== true) return { ...summary, error: 'booking_finish_failed' };
            summary.skipped++;
            continue;
          }
          // From here a throw is ambiguous and must consume the reservation.
          const result = await send(validation.sanitised, deps);
          if (result?.simulated) {
            status = 'skipped'; error = 'simulated'; release = true;
          } else if (result?.success && result.metaMessageId) {
            status = 'accepted'; messageId = result.metaMessageId;
          } else if (result?.skipped === 'missing_credentials' || String(result?.error || '').startsWith('validation_failed')) {
            status = 'failed'; error = result.skipped || 'validation_failed'; release = true;
          } else {
            status = 'uncertain'; error = 'meta_outcome_uncertain';
          }
        }
      }
    } catch {
      // Conservative even on a pre-request exception. A leak cannot add sends.
      status = 'uncertain'; error = 'worker_outcome_uncertain'; release = false;
    }
    const done = await supabase.rpc('finish_booking_alert', {
      p_id: row.id, p_claim_token: row.claim_token, p_status: status,
      p_message_id: messageId, p_error: error, p_release: release,
    });
    if (done.error || done.data !== true) return { ...summary, error: 'booking_finish_failed' };
    summary[status]++;
  }
  return summary;
}
