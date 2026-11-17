# Meta WhatsApp Cloud API integration - consolidated review notes (draft)

Status: DRAFT FOR REVIEW. Nothing in the broader remediation is live, merged,
or uploaded. The live website is unchanged. No real WhatsApp message can be
sent until the live prerequisites at the end are met and separately approved.

This document has two clearly separated parts:
- PART A: what draft PR #24 contains TODAY (remote head 8cb2103, preview checks passing).
- PART B: the broader remediation, prepared as local commits awaiting review and fresh approval before any upload.

## PART A - draft PR #24 (remote head 8cb2103)

Base: main @ 53548a1. 24 commits, 14 files. Still a draft; title/body
unchanged; Vercel preview checks passing. Content:

1. Template payload builders (src/lib/meta-whatsapp-templates.js) for the four
   Active Utility templates on the Bookmyprofessional WABA:
   bmp_booking_received, bmp_professional_booking_request,
   bmp_customer_registration_received, bmp_professional_registration_received.
   Unknown template names and wrong parameter counts are refused.
2. Pre-send validation (src/lib/meta-whatsapp-validate.js): Meta rejects
   newlines, tabs and >4 consecutive spaces in template params; recipient and
   envelope checks.
3. Cloud API connector (src/lib/meta-whatsapp.js): posts to
   graph.facebook.com/{version}/{phone-number-id}/messages. Consent-gated via
   the existing hasWhatsAppConsent. Never throws. Simulates only under
   NODE_ENV=test or META_WHATSAPP_SIMULATE=true; without credentials outside
   test mode it returns a missing-credentials skip (a failure, not a send).
4. Registration outbox (src/lib/registration-outbox.js + DRAFT migration
   supabase/registration_welcome_outbox.sql, NOT applied to any database):
   consent-only welcome queue with dedupe and a dispatcher with attempt
   tracking; signup connection via a draft DB trigger; dispatcher route
   /api/notifications/registration-welcome.
5. Booking flow wiring: Meta path active only when
   META_WHATSAPP_BOOKINGS_ENABLED=true; Brevo remains the default.

The three safety fixes uploaded to this PR on 18 Nov ~03:00 IST (user-approved
"Same draft" upload):
- Dispatcher route is fail-closed: without INTERNAL_SECRET configured, or
  with a wrong or missing header, it answers 401; a queue read failure
  answers 503 so monitoring sees an unhealthy route.
- The booking Meta path requires the explicit provider gate; no silent
  fallback changes.
- Consent is re-checked at dispatch time: consent withdrawn while a message
  waits blocks that message; if consent cannot be read, the row stays pending
  and nothing is sent.

## PART B - broader remediation (prepared locally)

Local commits on prep/whatsapp-meta-integration-review: the remediation
series f77d339 onward, on top of 8be8676 (which is byte-identical to the
remote PR head 8cb2103).

Delivery-outcome model (the honest version):
- A successful POST that returns a wamid means Meta ACCEPTED the message. It
  is NOT proof of delivery: without status webhooks the final disposition is
  unknowable, so the terminal state is 'accepted' and nothing claims delivery.
- classifySendOutcome() sorts every result into delivered (accepted),
  simulated, not_attempted, or uncertain. Only failures BEFORE the request
  left the process (validation, missing credentials) provably never reached
  Meta.
- An answered 4xx/429/5xx does NOT prove non-acceptance (Meta may queue a
  message and then fail the response). A no-response network error is
  inherently ambiguous: the request may have been accepted before the
  connection died. Both classes are 'uncertain'.
- Uncertain outcomes are HELD for reconciliation and are never automatically
  resent:
  - no immediate retry (removed - it could duplicate an accepted request);
  - no queued automatic retry of an ambiguous outcome;
  - a stale claimed row (worker silent >10 minutes, e.g. crashed) moves to
    'uncertain' with last_error stale_claim_uncertain, NOT back to pending:
    the crashed worker may have delivered before dying;
  - booking-flow failures are recorded in the outbox as 'uncertain' with the
    exact payload preserved for reconciliation; they are recorded as 'pending'
    only when the send provably never happened (missing credentials).
- If saving the 'accepted' state fails after Meta accepted a message, the row
  stays 'sending' and the stale sweep later holds it as 'uncertain'. It can
  never return to pending and be resent automatically.
- What this does NOT guarantee: exactly-once or zero duplicates. The narrower
  guarantee is that automation never resends an outcome it cannot prove was
  not accepted.

PRODUCT TRADEOFF (needs the user's decision): this safety has a real cost.
Some genuinely failed deliveries will sit held as 'uncertain' until someone
reconciles them (manually, or later via Meta status webhooks where a wamid
exists). Avoiding automatic resends of uncertain outcomes means accepting
that some failed messages wait for review instead of being retried
automatically.

## Scheduling the dispatcher (draft guidance only - nothing set up)

Public Supabase documentation establishes FEASIBILITY ONLY. Whether the
existing project actually has these extensions available, on what plan, and
at what cost is UNVERIFIED until a read-only check of the project itself.

- Supabase Cron (pg_cron): built-in scheduler; jobs run SQL or make HTTP
  requests. Source: https://supabase.com/docs/guides/cron
- pg_net: asynchronous HTTP from SQL, usable in triggers.
  Source: https://supabase.com/docs/guides/database/extensions/pg_net
- Database Webhooks: trigger to HTTP POST with configurable headers.
  Source: https://supabase.com/docs/guides/database/webhooks
- Edge Function secrets: standard secret storage if dispatch ever moves into
  an Edge Function. Source: https://supabase.com/docs/guides/functions/secrets

Smallest-change draft option: a pg_cron job every ~5 minutes calling
pg_net HTTP POST to the existing secret-gated dispatcher route, with the
secret stored database-side (Supabase Vault), so nothing is disclosed
externally. Event-driven alternative: a Database Webhook on outbox INSERT.
Both require explicit approval (extension enablement plus secret storage)
before any live change.

## Tests and harness evidence (18 Nov 2026 ~03:35 IST)

- Suite: 271 total, 264 pass, 7 pre-existing skips, 0 fail
  (node --env-file-if-exists=.env --test tests/*.test.mjs).
- Key behavior tests: single attempt on an answered 5xx; no retry on a
  network error; ambiguous failure held as 'uncertain'; stale claim held with
  zero sends; accepted-send persistence failure keeps the row claimed (never
  pending); booking uncertain outcomes recorded with exact payload.
- Harness (real Next.js route + real Postgres + PostgREST shim that honors
  the claim's conditional filters; no Meta contact):
  - route answers 401 with no header and with a wrong secret;
  - consent withdrawn while queued: skipped/consent_withdrawn, never sent;
  - stale claim (20 minutes old): held 'uncertain', not resent;
  - parallel dispatchers with a bounded fake-Meta ACCEPT response: the two
    workers split the queue, each row accepted exactly once (attempts=1,
    terminal), and a second parallel run processed zero rows;
  - fake answered-500: rows held 'uncertain'; a rerun reprocessed nothing.

## Verified live-side prerequisites (checked 18 Nov 2026 ~00:40 IST)

- Business verification: Verified (16 Nov 2026)
- Phone +91 89193 28705: Connected on the production WABA
- All 4 templates: Active - Quality pending; bodies re-read from Meta
  template detail pages on 18 Nov ~01:17 IST and matched to the builders
- Payment method: MISSING on the production WABA - no business-initiated
  message can be sent from the production number until added

## Template bodies (verified 18 Nov 2026 ~01:17 IST, Meta template detail pages)

- bmp_booking_received: "Hi {{1}}, we've received your BookMyProfessional booking {{2}} for {{3}}, scheduled for {{4}} at {{5}}. You can view its status in your BookMyProfessional account."
- bmp_professional_booking_request: "Hi {{1}}, you've received a new BookMyProfessional booking request {{2}} for {{3}}, requested for {{4}} at {{5}}. Sign in to your BookMyProfessional account to review the request."
- bmp_customer_registration_received: "Hi {{1}}, welcome to BookMyProfessional! We've received your customer registration."
- bmp_professional_registration_received: "Hi {{1}}, welcome to BookMyProfessional! We've received your professional registration."

## Server environment needed to go live (secrets stay out of the repo)

- META_WHATSAPP_ACCESS_TOKEN - system-user token, generated in Meta by the owner
- META_WHATSAPP_PHONE_NUMBER_ID - production phone number ID
- META_WHATSAPP_GRAPH_VERSION - optional, default v21.0
- META_WHATSAPP_SIMULATE - set true anywhere sends must stay mocked
- INTERNAL_SECRET - protects the dispatcher route (required; route fails closed without it)
