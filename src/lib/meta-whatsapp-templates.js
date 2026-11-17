// Server-only Meta Cloud API WhatsApp template message builders.
// Never import from a client component.
//
// These pure builders prepare the exact message payloads for the four
// Utility templates approved on the Bookmyprofessional WABA (16 Nov 2026):
//   - bmp_booking_received                  (customer, booking confirmation)
//   - bmp_professional_booking_request      (professional, new booking alert)
//   - bmp_customer_registration_received    (customer welcome)
//   - bmp_professional_registration_received(professional welcome)
//
// No network calls happen here; use meta-whatsapp.js to send.

export const META_TEMPLATE = Object.freeze({
  BOOKING_RECEIVED: 'bmp_booking_received',
  PRO_BOOKING_REQUEST: 'bmp_professional_booking_request',
  CUSTOMER_REGISTRATION: 'bmp_customer_registration_received',
  PRO_REGISTRATION: 'bmp_professional_registration_received',
});

// Number of body text parameters each approved template expects.
export const META_TEMPLATE_PARAM_COUNT = Object.freeze({
  [META_TEMPLATE.BOOKING_RECEIVED]: 5,
  [META_TEMPLATE.PRO_BOOKING_REQUEST]: 5,
  [META_TEMPLATE.CUSTOMER_REGISTRATION]: 1,
  [META_TEMPLATE.PRO_REGISTRATION]: 1,
});

export const META_TEMPLATE_LANGUAGE = 'en';

/**
 * Format a Date (or ISO string) date part in IST for template variables.
 */
export function toISTDate(dt) {
  try {
    const d = typeof dt === 'string' ? new Date(dt) : dt;
    if (Number.isNaN(d?.getTime?.())) return String(dt || '');
    return d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return String(dt || '');
  }
}

/**
 * Format a Date (or ISO string) time part in IST for template variables.
 */
export function toISTTime(dt) {
  try {
    const d = typeof dt === 'string' ? new Date(dt) : dt;
    if (Number.isNaN(d?.getTime?.())) return String(dt || '');
    return d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(dt || '');
  }
}

/**
 * Normalise a phone number to international digits without plus/spaces
 * (e.g. 919876543210), the format the Cloud API `to` field expects.
 */
export function normaliseMetaRecipient(to) {
  if (!to) return '';
  const digits = String(to).replace(/\D/g, '');
  if (digits.length < 10) return '';
  if (digits.startsWith('91') && digits.length === 12) {
    return digits;
  }
  if (digits.length === 10) {
    return `91${digits}`;
  }
  return digits;
}

/**
 * Build the Cloud API request body for a template message.
 *
 * @param {object} opts
 * @param {string} opts.to           - Recipient phone (any common Indian format)
 * @param {string} opts.templateName - One of META_TEMPLATE values
 * @param {string[]} opts.bodyParams - Body text parameters in template order
 * @param {string} [opts.languageCode]
 * @returns {object|null} Request body, or null when inputs are unusable.
 */
export function buildTemplateMessage({ to, templateName, bodyParams, languageCode = META_TEMPLATE_LANGUAGE }) {
  const recipient = normaliseMetaRecipient(to);
  if (!recipient || !templateName || !Array.isArray(bodyParams)) {
    return null;
  }

  const expected = META_TEMPLATE_PARAM_COUNT[templateName];
  if (expected === undefined) {
    return null; // unknown / unapproved template - refuse to build
  }
  if (bodyParams.length !== expected) {
    return null;
  }

  const parameters = bodyParams.map((text) => ({ type: 'text', text: String(text ?? '') }));

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: 'body',
          parameters,
        },
      ],
    },
  };
}

/**
 * Customer booking confirmation (bmp_booking_received).
 * Template: "Hi {{1}}, we've received your BookMyProfessional booking {{2}}
 * for {{3}}, scheduled for {{4}} at {{5}}. ..."
 */
export function buildCustomerBookingReceived({ to, customerName, booking }) {
  if (!booking) return null;
  return buildTemplateMessage({
    to,
    templateName: META_TEMPLATE.BOOKING_RECEIVED,
    bodyParams: [
      customerName || 'Customer',
      String(booking.id ?? ''),
      booking.service_title || 'your service',
      toISTDate(booking.scheduled_at || booking.date || ''),
      booking.time_slot || toISTTime(booking.scheduled_at || ''),
    ],
  });
}

/**
 * Professional new-booking alert (bmp_professional_booking_request).
 * Template: "Hi {{1}}, you've received a new BookMyProfessional booking
 * request {{2}} for {{3}}, requested for {{4}} at {{5}}. ..."
 */
export function buildProfessionalBookingRequest({ to, professionalName, booking }) {
  if (!booking) return null;
  return buildTemplateMessage({
    to,
    templateName: META_TEMPLATE.PRO_BOOKING_REQUEST,
    bodyParams: [
      professionalName || 'Professional',
      String(booking.id ?? ''),
      booking.service_title || 'a service',
      toISTDate(booking.scheduled_at || booking.date || ''),
      booking.time_slot || toISTTime(booking.scheduled_at || ''),
    ],
  });
}

/**
 * Customer welcome on first registration (bmp_customer_registration_received).
 */
export function buildCustomerRegistrationReceived({ to, customerName }) {
  return buildTemplateMessage({
    to,
    templateName: META_TEMPLATE.CUSTOMER_REGISTRATION,
    bodyParams: [customerName || 'Customer'],
  });
}

/**
 * Professional welcome on first registration (bmp_professional_registration_received).
 */
export function buildProfessionalRegistrationReceived({ to, professionalName }) {
  return buildTemplateMessage({
    to,
    templateName: META_TEMPLATE.PRO_REGISTRATION,
    bodyParams: [professionalName || 'Professional'],
  });
}
