const eligibleClient = { from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { verified: true, verification_status: 'approved' } }; } }; } };
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set test environment simulation
process.env.NODE_ENV = 'test';
process.env.BREVO_SIMULATE = 'true';

import {
  normalisePhoneNumber,
  hasWhatsAppConsent,
  sendBookingConfirmationWhatsApp,
  sendBookingCompletedWhatsApp,
  sendBookingCancellationWhatsApp,
  sendRefundProcessedWhatsApp,
  sendPayoutRequestedWhatsApp,
  sendPayoutPaidWhatsApp,
} from '../src/lib/whatsapp.js';
import { dispatchBookingConfirmedNotifications } from '../src/lib/booking-notifications.js';

test('normalisePhoneNumber formats Indian mobile numbers correctly', () => {
  assert.equal(normalisePhoneNumber('9876543210'), '919876543210');
  assert.equal(normalisePhoneNumber('+919876543210'), '919876543210');
  assert.equal(normalisePhoneNumber('919876543210'), '919876543210');
  assert.equal(normalisePhoneNumber('+91 98765 43210'), '919876543210');
  assert.equal(normalisePhoneNumber('12345'), '');
  assert.equal(normalisePhoneNumber(null), '');
});

test('hasWhatsAppConsent respects consent flag, phone presence, and notification prefs', () => {
  // Missing profile
  assert.equal(hasWhatsAppConsent(null), false);

  // Missing phone
  assert.equal(hasWhatsAppConsent({ whatsapp_consent: true, phone: '' }), false);

  // Consent false
  assert.equal(hasWhatsAppConsent({ whatsapp_consent: false, phone: '9876543210' }), false);

  // Valid consent with phone
  assert.equal(hasWhatsAppConsent({ whatsapp_consent: true, phone: '9876543210' }), true);

  // Explicit opt-out in notification_prefs takes precedence
  assert.equal(
    hasWhatsAppConsent({
      whatsapp_consent: true,
      phone: '9876543210',
      notification_prefs: { whatsapp: false },
    }),
    false
  );

  // Explicit opt-in in notification_prefs
  assert.equal(
    hasWhatsAppConsent({
      whatsapp_consent: true,
      phone: '9876543210',
      notification_prefs: { whatsapp: true },
    }),
    true
  );
});

test('WhatsApp notification senders respect consent gates', async () => {
  const noConsentProfile = { full_name: 'Test User', phone: '9876543210', whatsapp_consent: false };
  const mockBooking = { id: 'BMP-1001', service_title: 'Deep House Cleaning', date: '2026-11-01', time_slot: '10:00 AM' };
  const mockPayout = { id: 'PAY-2001', amount: 3500, method: 'Bank Account (•••• 1234)' };

  // Should all return false when consent is not granted
  assert.equal(await sendBookingConfirmationWhatsApp(noConsentProfile, mockBooking, 'customer'), false);
  assert.equal(await sendBookingConfirmationWhatsApp(noConsentProfile, mockBooking, 'professional'), false);
  assert.equal(await sendBookingCompletedWhatsApp(noConsentProfile, mockBooking), false);
  assert.equal(await sendBookingCancellationWhatsApp(noConsentProfile, mockBooking, 'customer'), false);
  assert.equal(await sendBookingCancellationWhatsApp(noConsentProfile, mockBooking, 'professional'), false);
  assert.equal(await sendRefundProcessedWhatsApp(noConsentProfile, mockBooking, 1500), false);
  assert.equal(await sendPayoutRequestedWhatsApp(noConsentProfile, mockPayout), false);
  assert.equal(await sendPayoutPaidWhatsApp(noConsentProfile, mockPayout), false);
});

test('WhatsApp notification senders succeed in test environment when consented', async () => {
  const consentedProfile = { full_name: 'Suresh Kumar', phone: '9876543210', whatsapp_consent: true };
  const mockBooking = { id: 'BMP-1002', service_title: 'Full Plumbing Inspection', date: '2026-11-02', time_slot: '02:00 PM' };
  const mockPayout = { id: 'PAY-2002', amount: 5000, method: 'UPI (9876543210@upi)' };

  assert.equal(await sendBookingConfirmationWhatsApp(consentedProfile, mockBooking, 'customer'), true);
  assert.equal(await sendBookingConfirmationWhatsApp(consentedProfile, mockBooking, 'professional'), true);
  assert.equal(await sendBookingCompletedWhatsApp(consentedProfile, mockBooking), true);
  assert.equal(await sendBookingCancellationWhatsApp(consentedProfile, mockBooking, 'customer'), true);
  assert.equal(await sendRefundProcessedWhatsApp(consentedProfile, mockBooking, 2500), true);
  assert.equal(await sendPayoutRequestedWhatsApp(consentedProfile, mockPayout), true);
  assert.equal(await sendPayoutPaidWhatsApp(consentedProfile, mockPayout), true);
});

test('dispatchBookingConfirmedNotifications prevents duplicate confirmation dispatches', async () => {
  const uniqueBookingId = `BMP-TEST-DEDUPE-${Date.now()}`;
  const mockBooking = {
    id: uniqueBookingId,
    professional_id: "pro",
    service_title: 'AC Servicing',
    total_paid: 1299,
    date: '2026-11-05',
    time_slot: '11:00 AM',
    address: 'Flat 402, Sunshine Heights, Mumbai',
  };

  // First call should process
  const firstResult = await dispatchBookingConfirmedNotifications(mockBooking, eligibleClient);
  assert.equal(firstResult.success, true);
  assert.equal(firstResult.deduplicated, undefined);

  // Immediate second call for the same booking ID MUST be deduplicated
  const secondResult = await dispatchBookingConfirmedNotifications(mockBooking, eligibleClient);
  assert.equal(secondResult.success, true);
  assert.equal(secondResult.deduplicated, true);
});
