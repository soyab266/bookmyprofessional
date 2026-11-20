import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBookingReminderWhatsApp } from '@/lib/whatsapp';

/**
 * POST /api/notifications/whatsapp-reminder
 * 
 * Called by a cron job (or Supabase scheduled function) to send 1-hour-before
 * appointment reminders via WhatsApp.
 * 
 * Body: { booking_id: string } — optional; omit to process all upcoming bookings
 *       that are 50–70 minutes away (allowing for ±10 min cron drift).
 * 
 * Security: Requires X-Internal-Secret header matching INTERNAL_SECRET env var.
 */
export async function POST(req) {
  // Simple bearer auth for internal calls
  const secret = process.env.INTERNAL_SECRET;
  const authHeader = req.headers.get('x-internal-secret');
  if (secret && authHeader !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    let bookingIds = [];
    let body = {};
    try { body = await req.json(); } catch { /* no body */ }

    if (body.booking_id) {
      bookingIds = [body.booking_id];
    } else {
      // Find all upcoming bookings whose scheduled_at is 50-70 min from now (IST)
      const now = new Date();
      const from = new Date(now.getTime() + 50 * 60 * 1000).toISOString();
      const to   = new Date(now.getTime() + 70 * 60 * 1000).toISOString();

      const { data: upcoming, error: qErr } = await supabase
        .from('bookings')
        .select('id')
        .eq('status', 'upcoming')
        .eq('payment_status', 'paid')
        .gte('scheduled_at', from)
        .lte('scheduled_at', to);

      if (qErr) throw qErr;
      bookingIds = (upcoming || []).map((b) => b.id);
    }

    if (!bookingIds.length) {
      return NextResponse.json({ sent: 0, message: 'No bookings in the reminder window.' });
    }

    const { data: bookings, error: bErr } = await supabase
      .from('bookings')
      .select('*')
      .in('id', bookingIds)
      .eq('status', 'upcoming')
      .eq('payment_status', 'paid');

    if (bErr) throw bErr;

    let sent = 0;
    let skipped = 0;

    for (const booking of bookings || []) {
      const profileIds = [booking.customer_id, booking.professional_id].filter(Boolean);
      if (!profileIds.length) { skipped++; continue; }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone, whatsapp_consent')
        .in('id', profileIds);

      if (!profiles?.length) { skipped++; continue; }

      const customerProfile = profiles.find((p) => p.id === booking.customer_id);
      const proProfile = profiles.find((p) => p.id === booking.professional_id);

      const tasks = [];
      if (customerProfile?.whatsapp_consent && customerProfile?.phone) {
        tasks.push(sendBookingReminderWhatsApp(customerProfile, booking, 'customer'));
      }
      if (proProfile?.whatsapp_consent && proProfile?.phone) {
        tasks.push(sendBookingReminderWhatsApp(proProfile, booking, 'professional'));
      }

      if (tasks.length) {
        const results = await Promise.allSettled(tasks);
        const success = results.some((r) => r.status === 'fulfilled' && r.value === true);
        if (success) sent++;
        else skipped++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      sent,
      skipped,
      total: bookingIds.length,
      message: `Reminders sent: ${sent}, skipped (no consent/phone): ${skipped}`,
    });
  } catch (err) {
    console.error('[WhatsApp Reminder API] Error:', err?.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
