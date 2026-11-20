import { readProfessionalBookability } from '@/lib/professional-booking-eligibility';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generatePaymentHash, getPayuConfig, toPayuAmount } from '@/lib/payu';

export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to pay.' }, { status: 401 });
    }

    const body = await req.json();
    const { txnid, phone, surl, furl, firstname: bodyFirstname, email: bodyEmail } = body;

    if (!txnid) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: booking, error } = await admin
      .from('bookings')
      .select('*')
      .eq('id', txnid)
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.customer_id !== user.id) {
      return NextResponse.json({ error: 'You do not have access to this booking.' }, { status: 403 });
    }

    if (booking.payment_status === 'paid') {
      return NextResponse.json({ error: 'This booking is already paid.' }, { status: 409 });
    }

    if (booking.status !== 'upcoming' || !await readProfessionalBookability(admin, booking.professional_id)) {
      return NextResponse.json({ error: 'Payment is unavailable until this professional is verified and approved.' }, { status: 409 });
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email, phone')
      .eq('id', booking.customer_id)
      .maybeSingle();

    const { key, salt, paymentUrl } = getPayuConfig();
    const amountStr = toPayuAmount(booking.total_paid);
    const productinfo = booking.service_title || `Booking ${booking.id}`;
    const firstname = profile?.full_name || bodyFirstname || 'Customer';
    const email = profile?.email || user.email || bodyEmail;

    if (!email) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const hash = generatePaymentHash({ key, txnid, amount: amountStr, productinfo, firstname, email, salt });

    return NextResponse.json({
      hash,
      key,
      txnid,
      amount: amountStr,
      productinfo,
      firstname,
      email,
      phone: phone || profile?.phone || '',
      surl,
      furl,
      action: paymentUrl,
    });
  } catch (error) {
    console.error('Error generating PayU hash:', error);
    return NextResponse.json({ error: 'Failed to initiate payment' }, { status: 500 });
  }
}
