import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGoogleOAuthClient, getGoogleRedirectUri, verifyState } from '@/lib/google-oauth';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    console.warn('Google OAuth returned error:', errorParam);
    return NextResponse.redirect(`${origin}/login?error=GoogleOAuthCancelled`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${origin}/login?error=OAuthMissingCodeOrState`);
  }

  const cookieStore = await cookies();
  const savedStateCookie = cookieStore.get('bmp_google_oauth_state')?.value;

  // Validate state to prevent CSRF
  if (!savedStateCookie || savedStateCookie !== stateParam) {
    console.error('OAuth state mismatch or missing cookie');
    return NextResponse.redirect(`${origin}/login?error=OAuthStateMismatch`);
  }

  const stateData = verifyState(stateParam);
  if (!stateData) {
    console.error('OAuth state signature invalid or expired');
    return NextResponse.redirect(`${origin}/login?error=OAuthStateExpired`);
  }

  const requestedRole = stateData.role === 'professional' ? 'professional' : 'customer';
  const targetNext = stateData.next;
  // WhatsApp opt-in from the register form, carried through the signed state.
  const whatsappConsent = stateData.whatsapp_consent === true;

  let tokens;
  let googleUser;

  try {
    const redirectUri = getGoogleRedirectUri(request);
    const oauthClient = getGoogleOAuthClient(redirectUri);

    const tokenResponse = await oauthClient.getToken(code);
    tokens = tokenResponse.tokens;

    if (!tokens?.id_token) {
      throw new Error('No id_token received from Google.');
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    googleUser = ticket.getPayload();
  } catch (err) {
    console.error('Failed to exchange code or verify Google ID token:', err.message);
    return NextResponse.redirect(`${origin}/login?error=GoogleTokenExchangeFailed`);
  }

  if (!googleUser || !googleUser.email) {
    return NextResponse.redirect(`${origin}/login?error=GoogleUserEmailMissing`);
  }

  if (!googleUser.email_verified) {
    return NextResponse.redirect(`${origin}/login?error=GoogleEmailUnverified`);
  }

  const email = googleUser.email.toLowerCase().trim();
  const fullName = googleUser.name || googleUser.given_name || email.split('@')[0];
  const avatarUrl = googleUser.picture || null;

  try {
    const adminSupabase = createAdminClient();

    // 1. Check existing profile by email
    const { data: existingProfile } = await adminSupabase
      .from('profiles')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    // 2. Check if user already exists as a professional
    let hasProRecord = false;
    if (existingProfile?.id) {
      const { data: pro } = await adminSupabase
        .from('professionals')
        .select('id')
        .eq('id', existingProfile.id)
        .maybeSingle();
      if (pro) hasProRecord = true;
    }

    // 3. Determine resolved role (never demote an existing professional)
    let resolvedRole = 'customer';
    if (requestedRole === 'professional') {
      resolvedRole = 'professional';
    } else if (existingProfile?.role === 'professional' || hasProRecord) {
      resolvedRole = 'professional';
    } else if (requestedRole === 'customer') {
      resolvedRole = 'customer';
    } else if (existingProfile?.role) {
      resolvedRole = existingProfile.role;
    } else {
      resolvedRole = 'customer';
    }

    // 4. Generate Supabase Auth link & verify OTP on server to establish session cookies
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        data: {
          full_name: fullName,
          role: resolvedRole,
          avatar_url: avatarUrl,
          // New accounts only: handle_new_user copies this into profiles, so
          // the registrant's opt-in is stored at account creation. An
          // existing user's consent is never touched by a later sign-in -
          // a later opt-in flow for existing accounts is a separate change.
          ...(existingProfile ? {} : { whatsapp_consent: whatsappConsent }),
        },
      },
    });

    if (linkError || !linkData?.properties?.email_otp) {
      console.error('Failed to generate auth session link:', linkError);
      return NextResponse.redirect(`${origin}/login?error=SessionCreationFailed`);
    }

    const { email_otp, verification_type } = linkData.properties;
    const authUserId = linkData.user.id;

    // Verify OTP using server client to set the auth cookies on Next.js response
    const ssrSupabase = await createServerSupabase();
    const { error: verifyError } = await ssrSupabase.auth.verifyOtp({
      email,
      token: email_otp,
      type: verification_type || 'magiclink',
    });

    if (verifyError) {
      console.error('Failed to verify OTP into SSR session:', verifyError);
      return NextResponse.redirect(`${origin}/login?error=SessionVerifyFailed`);
    }

    // 5. Consolidate legacy profile ID if different
    if (existingProfile && existingProfile.id !== authUserId) {
      try {
        await adminSupabase.from('bookings').update({ customer_id: authUserId }).eq('customer_id', existingProfile.id);
      } catch {}
      try {
        await adminSupabase.from('bookings').update({ professional_id: authUserId }).eq('professional_id', existingProfile.id);
      } catch {}
      try {
        await adminSupabase.from('reviews').update({ customer_id: authUserId }).eq('customer_id', existingProfile.id);
      } catch {}
      try {
        await adminSupabase.from('wishlist').update({ user_id: authUserId }).eq('user_id', existingProfile.id);
      } catch {}
      if (resolvedRole === 'professional') {
        try {
          await adminSupabase.from('professionals').update({ id: authUserId }).eq('id', existingProfile.id);
        } catch {}
      }
    }

    // 6. Upsert the profile row
    await adminSupabase.from('profiles').upsert({
      id: authUserId,
      email,
      full_name: existingProfile?.full_name || fullName,
      avatar_url: avatarUrl || existingProfile?.avatar_url,
      role: resolvedRole,
      phone: existingProfile?.phone || '',
      city: existingProfile?.city || '',
      address: existingProfile?.address || '',
      // Existing accounts: preserve their stored consent exactly as-is
      // (never granted, never cleared by a later Google sign-in). Only
      // brand-new profiles take the opt-in captured on the register form.
      whatsapp_consent: existingProfile ? existingProfile.whatsapp_consent : whatsappConsent,
    });

    // 7. If professional, guarantee row in professionals table exists
    if (resolvedRole === 'professional') {
      const { data: pro } = await adminSupabase
        .from('professionals')
        .select('id')
        .eq('id', authUserId)
        .maybeSingle();

      if (!pro) {
        await adminSupabase.from('professionals').insert({
          id: authUserId,
          name: existingProfile?.full_name || fullName,
          role_title: 'Professional',
          category: 'Doctors',
          city: existingProfile?.city || 'Mumbai',
          image_url: avatarUrl || existingProfile?.avatar_url,
          verification_status: 'pending',
          is_active: true,
        });
      }
    }

    // 8. Update auth user metadata
    try {
      await adminSupabase.auth.admin.updateUserById(authUserId, {
        user_metadata: {
          full_name: existingProfile?.full_name || fullName,
          role: resolvedRole,
          avatar_url: avatarUrl || existingProfile?.avatar_url,
        },
      });
    } catch {}

    // 9. Redirect to proper destination
    const defaultTarget = resolvedRole === 'professional' ? '/vendor' : '/dashboard';
    const destination = (targetNext && targetNext !== '/' && targetNext !== '/login' && targetNext !== '/register')
      ? targetNext
      : defaultTarget;

    // Brand-new Google accounts have no phone (Google does not share one):
    // collect it immediately so the profile is complete and an opted-in
    // WhatsApp welcome can find its number. Existing users signing in again
    // keep their previous behavior and never see this step. Whether the step
    // REQUIRES the WhatsApp agreement is decided durably from the profile's
    // onboarding_completed_at marker, never from a URL parameter.
    const finalDestination = existingProfile
      ? destination
      : `/complete-profile?next=${encodeURIComponent(destination)}`;

    const response = NextResponse.redirect(`${origin}${finalDestination}`);

    // Clean up oauth state cookie
    response.cookies.set('bmp_google_oauth_state', '', {
      path: '/',
      httpOnly: true,
      maxAge: 0,
    });

    return response;
  } catch (err) {
    console.error('Google OAuth callback unexpected error:', err);
    return NextResponse.redirect(`${origin}/login?error=OAuthCallbackFailed`);
  }
}
