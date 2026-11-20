// Classifies an auth validation failure as a DEFINITIVE loss of the account
// (the auth user was deleted or its tokens were revoked/rejected) versus a
// TRANSIENT failure (network down, Supabase 5xx, rate limited). Only a
// definitive loss may clear the local website session: signing out on a
// transient error would kick a healthy signed-in user off the site.

// auth-js error codes that mean the server rejected this user/token for good.
const DEFINITIVE_CODES = new Set([
  "bad_jwt",
  "no_authorization",
  "user_not_found",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
]);

export function isDefinitiveAuthLoss(error) {
  if (!error) return false;
  // No session at all: nothing valid to keep.
  if (error.name === "AuthSessionMissingError") return true;
  // auth-js marks network failures and 5xx/gateway statuses as retryable.
  if (error.name === "AuthRetryableFetchError") return false;
  const status = typeof error.status === "number" ? error.status : 0;
  // Rate limited: transient, never a reason to clear a session.
  if (status === 429 || error.code === "over_request_rate_limit") return false;
  // Any other server-side 5xx: transient.
  if (status >= 500) return false;
  // The server definitively rejected the presented token/user.
  if (status === 401 || status === 403) return true;
  if (DEFINITIVE_CODES.has(error.code)) return true;
  // Unknown shape: do not touch the session.
  return false;
}
