import { readProfessionalBookability } from './professional-booking-eligibility.js';
// Server-only. Review draft, no live job or activation is installed.
import { hasWhatsAppConsent } from './whatsapp.js';
import { buildCustomerBookingDetails, buildProfessionalBookingDetails, META_TEMPLATE, normaliseMetaRecipient } from './meta-whatsapp-templates.js';
import { validateTemplateMessage } from './meta-whatsapp-validate.js';
import { sendMetaTemplateMessage } from './meta-whatsapp.js';
import { sendEmailViaBrevo } from './brevo.js';

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

// A confirmation is only useful soon after payment. Standing rows that waited
// longer than this (cap overflow, a pause, downtime, the activation gap)
// expire unsent instead of arriving late. Matches the 2-hour freshness bound
// in standing expand_booking_alert_receipts; the owner can tune both together.
const MAX_NOTIFICATION_AGE_MS = 2 * 60 * 60 * 1000;

// Parse the booking start instant from the stored date (YYYY-MM-DD) and slot
// ("H:MM AM"/"H PM"), interpreted as Asia/Kolkata (UTC+5:30, no DST).
// Returns epoch ms, or null when either part is not parseable.
export function bookingStartIST(dateStr, timeSlot) {
  const d = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const m = String(timeSlot || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mins = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3].toUpperCase();
  if (h < 1 || h > 12 || mins > 59) return null;
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h, mins) - 5.5 * 3600e3;
}

// Meta Cloud API billing exhaustion: HTTP 402, or error code 131042 (business
// payment/eligibility failure) in the API error body. Deliberately narrow:
// ordinary template/recipient rejections must NOT pause the standing queue.
export function isMetaBillingFailure(result) {
  if (!result || result.success || result.simulated) return false;
  if (result.status === 402) return true;
  return /"code"\s*:\s*131042/.test(String(result.error || ''));
}

// Fail-closed standing pause after a billing rejection. Best-effort: a failed
// pause write is logged, never thrown - the run already stopped claiming.
export async function pauseStandingBookings(supabase, reason) {
  try {
    await supabase.from('booking_alert_standing').update({ paused: true, pause_reason: reason, updated_at: new Date().toISOString() }).eq('id', 1);
  } catch (err) {
    console.error('[BookingAlerts] standing pause write failed:', err?.message || err);
  }
}

// Best-effort owner notice after a billing pause. Delivery is one Brevo email
// and only when BOOKING_ALERT_OWNER_EMAIL is configured; the pause never
// depends on it and a failed notice is logged, never thrown. Natural dedupe:
// once paused, claim denies everything, so no further email goes out until an
// owner manually unpauses and another billing rejection occurs.
export async function notifyOwnerBillingPause(deps = {}) {
  try {
    const to = (deps.env || process.env).BOOKING_ALERT_OWNER_EMAIL;
    if (!to) return false;
    const sendMail = deps.sendEmail || sendEmailViaBrevo;
    await sendMail({
      toEmail: to,
      toName: 'BookMyProfessional owner',
      subject: 'Booking WhatsApp confirmations paused: Meta billing failure',
      htmlContent: '<p>Automatic booking confirmations were paused because Meta rejected a send for billing (prepaid balance exhausted or the WABA is blocked).</p><p>No further booking messages will be sent. After reviewing the Meta balance, re-enable manually: booking_alert_standing paused=false, pause_reason=null.</p>',
    });
    return true;
  } catch (err) {
    console.error('[BookingAlerts] owner billing notice failed:', err?.message || err);
    return false;
  }
}

// Claim + reserve are one service-only SQL transaction. A claim is never reset
// to pending. Acceptance/finalization failure stays held; no automatic resend.
export async function dispatchBookingAlerts(supabase, deps = {}) {
  const summary = { accepted: 0, uncertain: 0, skipped: 0, failed: 0 };
  if (!bookingAlertsEnabled()) return { ...summary, disabled: true };
  const expanded = await supabase.rpc('expand_booking_alert_receipts', { p_limit: 25 });
  if (expanded.error || expanded.data?.errors > 0) return { ...summary, error: 'booking_expansion_failed' };
  const limit = Math.min(DEFAULT_LIMIT, Math.max(0, Number.isInteger(deps.limit) ? deps.limit : DEFAULT_LIMIT));
  const send = deps.send || sendMetaTemplateMessage;
  // claim_booking_alert returns one booking GROUP (standing SQL: the
  // customer/professional pair claims together or not at all) or a single row
  // (legacy pilot SQL, still live until the standing migration is applied).
  // Groups are processed interleaved: claim one group, send it, then claim.
  for (let g = 0; g < limit; g++) {
    const claim = await supabase.rpc('claim_booking_alert');
    if (claim.error) return { ...summary, error: 'booking_claim_failed' };
    const data = claim.data;
    const groupRows = Array.isArray(data?.rows) ? data.rows : (data ? [data] : []);
    if (groupRows.length === 0) {
      // Backlog visibility for monitoring: pending rows with no claim usually
      // means the daily cap is reached (or the remainder is mid-claim).
      // Best-effort: a failed count must never break the dispatch run.
      try {
        const pend = await supabase.from('booking_alert_outbox').select('id', { count: 'exact', head: true }).eq('status', 'pending');
        summary.pending_remaining = pend && !pend.error && typeof pend.count === 'number' ? pend.count : null;
      } catch {
        summary.pending_remaining = null;
      }
      break;
    }
    for (let gi = 0; gi < groupRows.length; gi++) {
      const row = { ...groupRows[gi], pilot_expires_at: groupRows[gi].pilot_expires_at ?? data?.pilot_expires_at ?? null };
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
      // Bounded notification age (standing rows only; pilot rows carry their
      // own armed-window hard stop). A confirmation is useful only soon after
      // payment and only before the appointment starts. Rows that waited past
      // either bound expire here unsent, with the allowance returned - this is
      // how cap overflow, pauses and the activation gap resolve. Distinct
      // error codes keep a no-attempt expiry distinguishable from a provider
      // attempt that failed or came back uncertain.
      if (!row.pilot_expires_at) {
        const paidAt = Date.parse(row.booking?.alert_created_at || row.created_at || '');
        const startMs = bookingStartIST(b.date, b.time_slot);
        const istToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const expired = !Number.isFinite(paidAt) || Date.now() - paidAt > MAX_NOTIFICATION_AGE_MS ? 'expired_notification_age'
          : startMs !== null && Date.now() >= startMs ? 'booking_started'
          : startMs === null && String(b.date).slice(0, 10) < istToday ? 'booking_date_passed'
          : null;
        if (expired) {
          const done = await supabase.rpc('finish_booking_alert', { p_id: row.id, p_claim_token: row.claim_token, p_status: 'skipped', p_message_id: null, p_error: expired, p_release: true });
          if (done.error || done.data !== true) return { ...summary, error: 'booking_finish_failed' };
          summary.skipped++;
          continue;
        }
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
          // Pilot rows only: the SQL claim is valid inside its own booking
          // pilot, so re-check pilot expiry and the named-recipient scope
          // immediately before requesting Meta. Standing rows
          // (pilot_expires_at null) skip both; their guards are the live
          // booking/consent/template rechecks above and the standing daily
          // cap inside claim_booking_alert.
          if (row.pilot_expires_at) {
            if (!Number.isFinite(Date.parse(row.pilot_expires_at)) || Date.now() >= Date.parse(row.pilot_expires_at)) {
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
          }
          // From here a throw is ambiguous and must consume the reservation.
          const result = await send(validation.sanitised, deps);
          if (isMetaBillingFailure(result)) {
            // A real request was made and Meta rejected it for billing: the
            // prepaid balance is exhausted or the WABA is blocked. Hold the
            // row failed (no retry), pause standing sends fail-closed and
            // stop this run. Re-enabling is a manual owner action after
            // reviewing the balance; never silently keep claiming.
            const done = await supabase.rpc('finish_booking_alert', { p_id: row.id, p_claim_token: row.claim_token, p_status: 'failed', p_message_id: null, p_error: 'meta_billing_failure', p_release: false });
            if (done.error || done.data !== true) return { ...summary, error: 'booking_finish_failed' };
            // Every other claimed row in this booking group never reached
            // Meta: finish it without an attempt and return its allowance.
            // Without this it would park as uncertain and look like a send.
            for (const sib of groupRows.slice(gi + 1)) {
              const sd = await supabase.rpc('finish_booking_alert', { p_id: sib.id, p_claim_token: sib.claim_token, p_status: 'skipped', p_message_id: null, p_error: 'not_attempted_billing_pause', p_release: true });
              if (sd.error || sd.data !== true) return { ...summary, error: 'booking_finish_failed' };
              summary.skipped++;
            }
            await pauseStandingBookings(supabase, 'meta_billing_failure');
            const notified = await (deps.notifyOwner || notifyOwnerBillingPause)(deps);
            summary.failed++;
            return { ...summary, paused: 'meta_billing_failure', owner_notified: notified };
          }
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
  }
  return summary;
}
