import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchDailyRegistrationWelcome } from '@/lib/registration-welcome-daily';

/**
 * POST /api/notifications/registration-welcome
 *
 * Called by a cron job (or Supabase scheduled function) to dispatch queued
 * registration welcome WhatsApp messages through the Meta connector.
 *
 * Security: Requires X-Internal-Secret header matching INTERNAL_SECRET env var
 * (same convention as /api/notifications/whatsapp-reminder).
 */
export async function POST(req) {
  const secret = process.env.INTERNAL_SECRET;
  const authHeader = req.headers.get('x-internal-secret');
  // Fail closed: when INTERNAL_SECRET is not configured the route must deny,
  // never allow - an unset secret must not turn the dispatcher public.
  if (!secret || authHeader !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const result = await dispatchDailyRegistrationWelcome(supabase);
    // A queue read failure must look unhealthy to monitoring: 503, not a
    // healthy-looking 200 with zero counts.
    if (result?.error) {
      return NextResponse.json(result, { status: 503 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'dispatch_failed' }, { status: 500 });
  }
}
