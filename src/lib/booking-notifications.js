import { sendUserEmail } from './email.js';
import { notifyBookingConfirmed } from './whatsapp.js';
import { bookingAlertsEnabled } from './booking-alert-outbox.js';
import { formatMoney } from './money.js';

// Booking WhatsApp provider: the existing Brevo path stays active until the
// Meta Cloud API path is explicitly enabled via
// META_WHATSAPP_BOOKINGS_ENABLED=true. Any other value (or none) keeps Brevo.
export function bookingWhatsAppProvider(env = process.env) {
  return bookingAlertsEnabled(env) ? 'meta' : 'brevo';
}

// Best-effort process-local email-hook dedupe, not a durable delivery guarantee.
const recentlyNotifiedBookings = new Set();


/**
 * Notify customer and professional that a booking has been confirmed and paid.
 * Process-local suppression only. Durable WhatsApp dedupe lives in the booking queue.
 *
 * @param {object} booking  - Full booking row from Supabase
 * @param {object} supabase - Supabase service-role client
 */
export async function dispatchBookingConfirmedNotifications(booking, supabase, deps) {
  if (!booking?.id) return { success: false, reason: 'missing_booking_id' };

  // 1. In-memory deduplication check
  if (recentlyNotifiedBookings.has(booking.id)) {
    return { success: true, deduplicated: true };
  }
  recentlyNotifiedBookings.add(booking.id);

  // Expire after 10 minutes to free memory (unref timer so it does not keep test process alive)
  const timer = setTimeout(() => {
    recentlyNotifiedBookings.delete(booking.id);
  }, 10 * 60 * 1000);
  if (timer?.unref) timer.unref();

  const serviceTitle = booking.service_title || `Booking ${booking.id}`;
  const totalStr = formatMoney(booking.total_paid || booking.service_price || 0);

  try {
    // 2. Fetch customer and professional profiles for personalized emails
    let customerName = 'Customer';
    let customerPhone = '';
    let proName = 'Professional';

    if (supabase) {
      try {
        const profileIds = [booking.customer_id, booking.professional_id].filter(Boolean);
        if (profileIds.length) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, phone, email')
            .in('id', profileIds);

          if (profiles) {
            const cust = profiles.find((p) => p.id === booking.customer_id);
            const pro = profiles.find((p) => p.id === booking.professional_id);
            if (cust?.full_name) customerName = cust.full_name;
            if (cust?.phone) customerPhone = cust.phone;
            if (pro?.full_name) proName = pro.full_name;
          }
        }
      } catch (profileErr) {
        console.warn('[Notifications] Failed fetching profile details for email:', profileErr?.message);
      }
    }

    const tasks = [];

    // 3. Customer Email: "Booking Confirmed — Payment Received"
    if (booking.customer_id) {
      tasks.push(
        sendUserEmail(booking.customer_id, {
          subject: `Booking Confirmed — ${serviceTitle}`,
          kind: 'bookings',
          text:
            `Hi ${customerName},\n\n` +
            `Your payment for booking ${booking.id} (${serviceTitle}) has been received and your appointment is confirmed!\n\n` +
            `📅 Date & Time: ${booking.date || 'Scheduled slot'} at ${booking.time_slot || ''}\n` +
            `📍 Address: ${booking.address || 'Address on file'}\n` +
            `💳 Total Paid: ${totalStr}\n\n` +
            `Your professional will be with you on time. You can view your appointment anytime on your dashboard:\n` +
            `https://www.bookmyprofessional.com/dashboard\n\n` +
            `Thank you for choosing BookMyProfessional!`,
          html:
            `<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; rounded-lg;">` +
            `<h2 style="color: #0284c7; margin-top: 0;">✅ Booking Confirmed!</h2>` +
            `<p>Hi <strong>${customerName}</strong>,</p>` +
            `<p>Your payment has been received and your appointment is confirmed.</p>` +
            `<div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">` +
            `<p style="margin: 4px 0;"><strong>Booking ID:</strong> ${booking.id}</p>` +
            `<p style="margin: 4px 0;"><strong>Service:</strong> ${serviceTitle}</p>` +
            `<p style="margin: 4px 0;"><strong>Date & Time:</strong> ${booking.date || ''} at ${booking.time_slot || ''}</p>` +
            `<p style="margin: 4px 0;"><strong>Service Address:</strong> ${booking.address || 'Address on file'}</p>` +
            `<p style="margin: 4px 0;"><strong>Total Paid:</strong> ${totalStr}</p>` +
            `</div>` +
            `<p>Your professional will arrive on time. Access your booking details on your <a href="https://www.bookmyprofessional.com/dashboard" style="color: #0284c7; font-weight: bold;">Customer Dashboard</a>.</p>` +
            `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />` +
            `<p style="font-size: 12px; color: #64748b;">BookMyProfessional Team • Support: +918919328705</p>` +
            `</div>`,
        })
      );
    }

    // 4. Professional Email: "New Booking Received — #{booking.id}"
    if (booking.professional_id) {
      tasks.push(
        sendUserEmail(booking.professional_id, {
          subject: `New Booking Received — #${booking.id}`,
          kind: 'bookings',
          text:
            `Hi ${proName},\n\n` +
            `You have received a new booking on BookMyProfessional!\n\n` +
            `📋 Booking Details:\n` +
            `• Booking ID: ${booking.id}\n` +
            `• Service: ${serviceTitle}\n` +
            `• Customer: ${customerName}${customerPhone ? ` (${customerPhone})` : ''}\n` +
            `• Appointment Date & Time: ${booking.date || ''} at ${booking.time_slot || ''}\n` +
            `• Address: ${booking.address || 'Specified upon arrival'}\n` +
            `• Amount: ${totalStr}\n\n` +
            `Please ensure you are prepared and on time. Open your vendor portal for client contact and management:\n` +
            `https://www.bookmyprofessional.com/vendor\n\n` +
            `— BookMyProfessional`,
          html:
            `<div style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">` +
            `<h2 style="color: #0284c7; margin-top: 0;">🔔 New Booking Received!</h2>` +
            `<p>Hi <strong>${proName}</strong>,</p>` +
            `<p>You have received a new confirmed booking. Payment is securely held in escrow until service completion.</p>` +
            `<div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">` +
            `<p style="margin: 4px 0;"><strong>Booking ID:</strong> ${booking.id}</p>` +
            `<p style="margin: 4px 0;"><strong>Service:</strong> ${serviceTitle}</p>` +
            `<p style="margin: 4px 0;"><strong>Customer:</strong> ${customerName}${customerPhone ? ` (${customerPhone})` : ''}</p>` +
            `<p style="margin: 4px 0;"><strong>Appointment:</strong> ${booking.date || ''} at ${booking.time_slot || ''}</p>` +
            `<p style="margin: 4px 0;"><strong>Service Location:</strong> ${booking.address || 'Address on file'}</p>` +
            `<p style="margin: 4px 0;"><strong>Payout Net:</strong> ${totalStr}</p>` +
            `</div>` +
            `<p>Review your schedule and client notes in your <a href="https://www.bookmyprofessional.com/vendor" style="color: #0284c7; font-weight: bold;">Vendor Dashboard</a>.</p>` +
            `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />` +
            `<p style="font-size: 12px; color: #64748b;">BookMyProfessional Vendor Relations</p>` +
            `</div>`,
        })
      );
    }

    // Booking WhatsApp is durably queued in the verified PayU transaction
    // when the Meta flag is on. No direct Meta send or registration-queue write.
    // Flag off preserves the existing Brevo behavior, including its limitations.
    if (bookingWhatsAppProvider() === 'brevo') {
      tasks.push(notifyBookingConfirmed(booking, supabase));
    }
    await Promise.allSettled(tasks);

    return { success: true };
  } catch (err) {
    console.error('[Notifications] dispatchBookingConfirmedNotifications error:', err?.message || err);
    return { success: false, error: err?.message };
  }
}
