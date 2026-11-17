# Meta WhatsApp Cloud API integration - preparation notes (draft for review)

Status: OFFLINE PREPARATION ONLY. Nothing here is deployed, pushed, or wired into
the live site. All sends are simulated in tests. No real messages can be sent
from this code without server-side credentials that do not exist in the repo.

## What this adds (4 stages, one commit each, on top of main @ 53548a1)

1. `src/lib/meta-whatsapp-templates.js` - payload builders for the four
   Utility templates approved on the Bookmyprofessional WABA on 16 Nov 2026:
   - `bmp_booking_received` (customer booking confirmation; 5 params)
   - `bmp_professional_booking_request` (professional new-booking alert; 5 params)
   - `bmp_customer_registration_received` (customer welcome; 1 param)
   - `bmp_professional_registration_received` (professional welcome; 1 param)
   Unknown template names and wrong parameter counts are refused.
2. `src/lib/meta-whatsapp-validate.js` - pre-send validation/sanitisation
   (Meta rejects newlines, tabs and >4 consecutive spaces in template params;
   recipient and envelope checks).
3. `src/lib/meta-whatsapp.js` - the Cloud API connector. Posts to
   `graph.facebook.com/<version>/<phone-number-id>/messages`. Consent-gated
   (reuses `hasWhatsAppConsent`), never throws, simulates in test mode or when
   credentials are absent.
4. `src/lib/registration-outbox.js` + `supabase/registration_welcome_outbox.sql`
   (DRAFT migration, not applied) - consent-only welcome queue with dedupe and
   a dispatcher with attempt tracking.

## Server environment needed to go live (secrets stay out of the repo)

- `META_WHATSAPP_ACCESS_TOKEN` - system-user token, generated in Meta by the owner
- `META_WHATSAPP_PHONE_NUMBER_ID` - production phone number ID
- `META_WHATSAPP_GRAPH_VERSION` - optional, default `v21.0`
- `META_WHATSAPP_SIMULATE` - set `true` anywhere sends must stay mocked

## Not done here (needs separate approval)

- No call-site wiring: `booking-notifications.js` still calls the Brevo path.
  Switching it to `notifyBookingConfirmedMeta` is one small change, proposed
  for review separately.
- No registration hook: `queueRegistrationWelcome` is not called from
  `AuthContext.jsx` yet; the registration flow is client-side, so the safest
  hook point (server route or DB trigger) is a review decision.
- The outbox migration has NOT been applied to any database.
- Webhook/receive handling, delivery logs, and the known notification-route
  access-check concern are untouched on purpose.

## Verified live-side prerequisites (checked 18 Nov 2026 ~00:40 IST)

- Business verification: Verified (16 Nov 2026)
- Phone +91 89193 28705: Connected on the production WABA
- All 4 templates: Active - Quality pending; full bodies re-read from each
  template's detail page on 18 Nov ~01:17 IST and matched to the builders
- Payment method: MISSING on the production WABA - no business-initiated
  message can be sent from the production number until added
- App: unpublished - publish required for production delivery and webhooks

## Template bodies (verified 18 Nov 2026 ~01:17 IST, Meta template detail pages)

- bmp_booking_received: "Hi {{1}}, we've received your BookMyProfessional booking {{2}} for {{3}}, scheduled for {{4}} at {{5}}. You can view its status in your BookMyProfessional account."
- bmp_professional_booking_request: "Hi {{1}}, you've received a new BookMyProfessional booking request {{2}} for {{3}}, requested for {{4}} at {{5}}. Sign in to your BookMyProfessional account to review the request."
- bmp_customer_registration_received: "Hi {{1}}, welcome to BookMyProfessional! We've received your customer registration."
- bmp_professional_registration_received: "Hi {{1}}, welcome to BookMyProfessional! We've received your professional registration."

## Send simulation and outbox safety

- The connector simulates only under NODE_ENV=test or META_WHATSAPP_SIMULATE=true.
- Without credentials in a non-test environment it returns skipped: missing_credentials
  (a failure, not a success).
- The outbox dispatcher marks a row sent only after a real, non-simulated success;
  simulated results leave the row pending without burning an attempt.
