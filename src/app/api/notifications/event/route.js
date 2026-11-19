// Retired legacy event dispatcher. The previous endpoint accepted unauthenticated
// client events and used server credentials to request chargeable WhatsApps.
// Fail closed BEFORE reading the request, creating a DB client or sending.
// Existing browser callers are fire-and-forget. Financial/booking operations,
// emails and the separate authenticated Meta outboxes are not handled here.
export async function POST() {
  return Response.json(
    { error: 'notification_event_disabled' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
