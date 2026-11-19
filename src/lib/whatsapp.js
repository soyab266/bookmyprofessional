// Server-only legacy WhatsApp helpers. Brevo WhatsApp transport is disabled.
// Never import from a client component.
import { formatMoney } from './money.js';

const BMP_PHONE = process.env.BREVO_WHATSAPP_SENDER_NUMBER || '918919328705'; // BookMyProfessional support line (IST digits)

/**
 * Format a Date (or ISO string) in IST for display.
 */
function toIST(dt) {
  try {
    const d = typeof dt === 'string' ? new Date(dt) : dt;
    if (Number.isNaN(d.getTime())) return String(dt || '');
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(dt || '');
  }
}

/**
 * Normalise a phone number to Indian standard digits without plus/spaces (e.g. 919876543210).
 */
export function normalisePhoneNumber(to) {
  if (!to) return '';
  const digits = String(to).replace(/\D/g, '');
  if (digits.length < 10) return '';
  if (digits.startsWith('91') && digits.length === 12) {
    return digits;
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

/**
 * Check if a user profile has consented and enabled WhatsApp notifications.
 */
export function hasWhatsAppConsent(profile) {
  if (!profile) return false;
  // Must have phone number
  if (!profile.phone || !normalisePhoneNumber(profile.phone)) return false;
  // Must have consent flag true
  const consented = Boolean(profile.whatsapp_consent);
  if (!consented) return false;
  // If notification_prefs has an explicit whatsapp opt-out, respect it
  const prefs = profile.notification_prefs;
  if (prefs && typeof prefs === 'object' && prefs.whatsapp === false) {
    return false;
  }
  return true;
}

/**
 * Legacy Brevo WhatsApp transport is deliberately disabled.
 * Keep the false/no-throw contract so existing booking, refund and payout
 * operations continue without their old WhatsApp side effect. This also blocks
 * confirmation, cancellation, completion and reminder alerts, in every env.
 * Brevo email and the separate Meta registration/booking outboxes are unchanged.
 * Do not add an environment bypass: re-enabling needs a reviewed, authenticated,
 * bounded event path rather than restoring the old unrestricted transport.
 */
export async function sendWhatsApp() {
  return false;
}

/**
 * Send booking-confirmation WhatsApp to a single recipient (customer or professional).
 */
export async function sendBookingConfirmationWhatsApp(profile, booking, recipientType) {
  if (!hasWhatsAppConsent(profile)) return false;

  const slotLabel = toIST(booking.scheduled_at || (booking.date ? `${booking.date} ${booking.time_slot || ''}` : ''));
  const serviceTitle = booking.service_title || 'your service';

  let body;
  if (recipientType === 'customer') {
    body =
      `✅ *Booking Confirmed!*\n\n` +
      `Hi ${profile.full_name || 'there'}, your booking has been confirmed.\n\n` +
      `📋 *Booking ID:* ${booking.id}\n` +
      `🛠 *Service:* ${serviceTitle}\n` +
      `📅 *Appointment:* ${slotLabel || booking.date}\n\n` +
      `Your professional will be with you on time. For any questions reach us at +${BMP_PHONE}.\n\n` +
      `— BookMyProfessional`;
  } else {
    body =
      `🔔 *New Booking Alert!*\n\n` +
      `Hi ${profile.full_name || 'there'}, you have a new booking.\n\n` +
      `📋 *Booking ID:* ${booking.id}\n` +
      `🛠 *Service:* ${serviceTitle}\n` +
      `📅 *Appointment:* ${slotLabel || booking.date}\n\n` +
      `Please be on time. For support call +${BMP_PHONE}.\n\n` +
      `— BookMyProfessional`;
  }

  return await sendWhatsApp({ to: profile.phone, body });
}

/**
 * Send booking-completed WhatsApp to customer.
 */
export async function sendBookingCompletedWhatsApp(profile, booking) {
  if (!hasWhatsAppConsent(profile)) return false;

  const serviceTitle = booking.service_title || 'your service';
  const body =
    `🎉 *Booking Completed!*\n\n` +
    `Hi ${profile.full_name || 'there'}, your booking ${booking.id} for *${serviceTitle}* has been marked as completed.\n\n` +
    `Thank you for using BookMyProfessional! We would love to hear your feedback — please visit your dashboard to rate and review your experience.\n\n` +
    `— BookMyProfessional`;

  return await sendWhatsApp({ to: profile.phone, body });
}

/**
 * Send booking-cancellation WhatsApp to a single recipient.
 */
export async function sendBookingCancellationWhatsApp(profile, booking, recipientType) {
  if (!hasWhatsAppConsent(profile)) return false;

  const slotLabel = toIST(booking.scheduled_at || (booking.date ? `${booking.date} ${booking.time_slot || ''}` : ''));
  const serviceTitle = booking.service_title || 'your service';

  let body;
  if (recipientType === 'customer') {
    body =
      `❌ *Booking Cancelled*\n\n` +
      `Hi ${profile.full_name || 'there'}, your booking ${booking.id} for *${serviceTitle}* ` +
      `${slotLabel ? `(scheduled at ${slotLabel}) ` : ''}has been cancelled.\n\n` +
      `If you did not request this, please contact us immediately at +${BMP_PHONE}.\n\n` +
      `— BookMyProfessional`;
  } else {
    body =
      `❌ *Booking Cancelled*\n\n` +
      `Hi ${profile.full_name || 'there'}, booking ${booking.id} for *${serviceTitle}* ` +
      `${slotLabel ? `(scheduled at ${slotLabel}) ` : ''}has been cancelled by the customer.\n\n` +
      `For queries call +${BMP_PHONE}.\n\n` +
      `— BookMyProfessional`;
  }

  return await sendWhatsApp({ to: profile.phone, body });
}

/**
 * Send refund-processed WhatsApp to customer.
 */
export async function sendRefundProcessedWhatsApp(profile, booking, amount) {
  if (!hasWhatsAppConsent(profile)) return false;

  const amountStr = formatMoney(amount);
  const body =
    `💳 *Refund Processed*\n\n` +
    `Hi ${profile.full_name || 'there'}, your refund of ${amountStr} for booking ${booking.id} has been processed successfully.\n\n` +
    `The amount should reflect in your original payment method within 5-7 business days.\n\n` +
    `For support, contact us at +${BMP_PHONE}.\n\n` +
    `— BookMyProfessional`;

  return await sendWhatsApp({ to: profile.phone, body });
}

/**
 * Send payout-requested WhatsApp to professional.
 */
export async function sendPayoutRequestedWhatsApp(profile, payout) {
  if (!hasWhatsAppConsent(profile)) return false;

  const amountStr = formatMoney(payout.amount);
  const destination = payout.method || 'verified bank/UPI account';
  const body =
    `💸 *Payout Requested*\n\n` +
    `Hi ${profile.full_name || 'there'}, your instant payout request of ${amountStr} has been received and queued for transfer.\n\n` +
    `📋 *Payout ID:* ${payout.id}\n` +
    `🏦 *Destination:* ${destination}\n\n` +
    `You will receive another update as soon as the transfer is processed.\n\n` +
    `— BookMyProfessional`;

  return await sendWhatsApp({ to: profile.phone, body });
}

/**
 * Send payout-paid WhatsApp to professional.
 */
export async function sendPayoutPaidWhatsApp(profile, payout) {
  if (!hasWhatsAppConsent(profile)) return false;

  const amountStr = formatMoney(payout.amount);
  const destination = payout.method || 'verified bank/UPI account';
  const utrLine = payout.transaction_ref ? `🔍 *UTR / Ref:* ${payout.transaction_ref}\n` : '';
  const body =
    `✅ *Payout Dispatched!*\n\n` +
    `Hi ${profile.full_name || 'there'}, your payout of ${amountStr} has been successfully transferred to your destination (${destination}).\n\n` +
    `📋 *Payout ID:* ${payout.id}\n` +
    utrLine +
    `\nCheck your bank account or UPI app for the credit reflection.\n\n` +
    `— BookMyProfessional`;

  return await sendWhatsApp({ to: profile.phone, body });
}

/**
 * Send a 1-hour-before reminder WhatsApp.
 */
export async function sendBookingReminderWhatsApp(profile, booking, recipientType) {
  if (!hasWhatsAppConsent(profile)) return false;

  const slotLabel = toIST(booking.scheduled_at || (booking.date ? `${booking.date} ${booking.time_slot || ''}` : ''));
  const serviceTitle = booking.service_title || 'your service';

  let body;
  if (recipientType === 'customer') {
    body =
      `⏰ *Appointment Reminder*\n\n` +
      `Hi ${profile.full_name || 'there'}, your appointment is in 1 hour!\n\n` +
      `📋 *Booking ID:* ${booking.id}\n` +
      `🛠 *Service:* ${serviceTitle}\n` +
      `📅 *Time:* ${slotLabel || booking.date} (IST)\n\n` +
      `Please be ready. Need help? Call +${BMP_PHONE}.\n\n` +
      `— BookMyProfessional`;
  } else {
    body =
      `⏰ *Appointment Reminder*\n\n` +
      `Hi ${profile.full_name || 'there'}, you have a booking in 1 hour!\n\n` +
      `📋 *Booking ID:* ${booking.id}\n` +
      `🛠 *Service:* ${serviceTitle}\n` +
      `📅 *Time:* ${slotLabel || booking.date} (IST)\n\n` +
      `Please be on time. For support call +${BMP_PHONE}.\n\n` +
      `— BookMyProfessional`;
  }

  return await sendWhatsApp({ to: profile.phone, body });
}

/**
 * Fetch profiles helper.
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
 * Send confirmation WhatsApp to customer & professional.
 */
export async function notifyBookingConfirmed(booking, supabase) {
  if (!booking || !supabase) return;
  try {
    const profiles = await getProfiles(supabase, [booking.customer_id, booking.professional_id]);
    const customer = profiles.find((p) => p.id === booking.customer_id);
    const pro = profiles.find((p) => p.id === booking.professional_id);

    const tasks = [];
    if (customer) tasks.push(sendBookingConfirmationWhatsApp(customer, booking, 'customer'));
    if (pro) tasks.push(sendBookingConfirmationWhatsApp(pro, booking, 'professional'));
    await Promise.allSettled(tasks);
  } catch (err) {
    console.error('[WhatsApp] notifyBookingConfirmed error:', err?.message || err);
  }
}

/**
 * Send completed WhatsApp to customer.
 */
export async function notifyBookingCompleted(booking, supabase) {
  if (!booking || !supabase) return;
  try {
    const profiles = await getProfiles(supabase, [booking.customer_id]);
    const customer = profiles.find((p) => p.id === booking.customer_id);
    if (customer) {
      await sendBookingCompletedWhatsApp(customer, booking);
    }
  } catch (err) {
    console.error('[WhatsApp] notifyBookingCompleted error:', err?.message || err);
  }
}

/**
 * Send cancellation WhatsApp to customer and professional.
 */
export async function notifyBookingCancelled(booking, supabase) {
  if (!booking || !supabase) return;
  try {
    const profiles = await getProfiles(supabase, [booking.customer_id, booking.professional_id]);
    const customer = profiles.find((p) => p.id === booking.customer_id);
    const pro = profiles.find((p) => p.id === booking.professional_id);

    const tasks = [];
    if (customer) tasks.push(sendBookingCancellationWhatsApp(customer, booking, 'customer'));
    if (pro) tasks.push(sendBookingCancellationWhatsApp(pro, booking, 'professional'));
    await Promise.allSettled(tasks);
  } catch (err) {
    console.error('[WhatsApp] notifyBookingCancelled error:', err?.message || err);
  }
}

/**
 * Send refund processed WhatsApp to customer.
 */
export async function notifyRefundProcessed(booking, amount, supabase) {
  if (!booking || !supabase) return;
  try {
    const profiles = await getProfiles(supabase, [booking.customer_id]);
    const customer = profiles.find((p) => p.id === booking.customer_id);
    if (customer) {
      await sendRefundProcessedWhatsApp(customer, booking, amount);
    }
  } catch (err) {
    console.error('[WhatsApp] notifyRefundProcessed error:', err?.message || err);
  }
}

/**
 * Send payout requested WhatsApp to professional.
 */
export async function notifyPayoutRequested(payout, supabase) {
  if (!payout || !supabase) return;
  try {
    const profiles = await getProfiles(supabase, [payout.professional_id]);
    const pro = profiles.find((p) => p.id === payout.professional_id);
    if (pro) {
      await sendPayoutRequestedWhatsApp(pro, payout);
    }
  } catch (err) {
    console.error('[WhatsApp] notifyPayoutRequested error:', err?.message || err);
  }
}

/**
 * Send payout paid WhatsApp to professional.
 */
export async function notifyPayoutPaid(payout, supabase) {
  if (!payout || !supabase) return;
  try {
    const profiles = await getProfiles(supabase, [payout.professional_id]);
    const pro = profiles.find((p) => p.id === payout.professional_id);
    if (pro) {
      await sendPayoutPaidWhatsApp(pro, payout);
    }
  } catch (err) {
    console.error('[WhatsApp] notifyPayoutPaid error:', err?.message || err);
  }
}
