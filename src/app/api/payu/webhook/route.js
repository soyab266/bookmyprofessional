import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyPaymentHash, getPayuConfig, amountsMatch } from '@/lib/payu';
import { dispatchBookingConfirmedNotifications } from '@/lib/booking-notifications';
import { confirmVerifiedPaidBooking } from '@/lib/booking-alert-outbox';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function POST(req) {
  const { key, salt } = getPayuConfig();

  try {
    let data;
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      data = Object.fromEntries(formData);
    } else {
      data = await req.json();
    }

    const { txnid, status, hash, amount, productinfo, firstname, email, mihpayid, additionalCharges } = data;

    if (!txnid || !status) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const valid = verifyPaymentHash({
      salt, status, email, firstname, productinfo, amount, txnid, key, hash, additionalCharges,
    });

    if (!valid) {
      console.error('[PayU Webhook] Hash mismatch for txnid:', txnid);
      return NextResponse.json({ error: 'Invalid hash' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', txnid)
      .single();

    if (bookingError || !booking) {
      console.error('[PayU Webhook] Booking not found for txnid:', txnid);
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (!amountsMatch(booking.total_paid, amount)) {
      console.error('[PayU Webhook] Amount mismatch for txnid:', txnid, booking.total_paid, amount);
      return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
    }

    if (status === 'success') {
      // Existing hash and amount checks above remain mandatory.
      // Flag on: payment and minimal verified receipt commit, without queue/profile operations.
      const confirmedBooking = await confirmVerifiedPaidBooking(supabase, txnid, amount, mihpayid);

      // Only dispatch notifications if this webhook call was the one that updated to 'paid'
      if (confirmedBooking) {
        await dispatchBookingConfirmedNotifications(confirmedBooking, supabase);
      }
    } else if (status === 'failure') {
      await supabase
        .from('bookings')
        .update({ payment_status: 'failed', status: 'cancelled' })
        .eq('id', txnid);
      await supabase
        .from('payments')
        .update({ status: 'failed' })
        .eq('booking_id', txnid);
    }

    return NextResponse.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('[PayU Webhook] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
