import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getGoogleOAuthClient, getGoogleRedirectUri, signState } from '@/lib/google-oauth';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role') === 'professional' ? 'professional' : 'customer';
    // Optional WhatsApp opt-in captured on the register form; stored in the
    // signed state so the callback can trust it.
    const whatsappConsent = searchParams.get('wa') === '1';
    const defaultNext = role === 'professional' ? '/vendor' : '/dashboard';
    const nextParam = searchParams.get('next');
    const next = (nextParam && nextParam !== '/' && nextParam !== '/login' && nextParam !== '/register')
      ? nextParam
      : defaultNext;

    const redirectUri = getGoogleRedirectUri(request);
    let oauthClient;
    try {
      oauthClient = getGoogleOAuthClient(redirectUri);
    } catch (configError) {
      console.error('Google OAuth config error:', configError.message);
      const origin = new URL(request.url).origin;
      return NextResponse.redirect(`${origin}/login?error=GoogleOAuthConfigMissing`);
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const statePayload = {
      nonce,
      role,
      next,
      whatsapp_consent: whatsappConsent,
      iat: Date.now(),
    };
    const stateToken = signState(statePayload);

    const authUrl = oauthClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state: stateToken,
      prompt: 'select_account',
    });

    const response = NextResponse.redirect(authUrl);

    // Secure HTTP-only cookie storing the expected state
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookies.set('bmp_google_oauth_state', stateToken, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
    });

    return response;
  } catch (error) {
    console.error('Failed to initiate Google OAuth:', error);
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/login?error=OAuthInitFailed`);
  }
}
