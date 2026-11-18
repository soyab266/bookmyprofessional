import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchBookingAlerts } from '@/lib/booking-alert-outbox';

// No scheduler is installed by this change. Explicit later approval required.
export async function POST(req) {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret || req.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const result = await dispatchBookingAlerts(supabase);
    return NextResponse.json(result, { status: result.error ? 503 : 200 });
  } catch {
    return NextResponse.json({ error: 'booking_dispatch_failed' }, { status: 503 });
  }
}
