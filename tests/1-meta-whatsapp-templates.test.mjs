import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import {
  META_TEMPLATE,
  META_TEMPLATE_PARAM_COUNT,
  normaliseMetaRecipient,
  toISTDate,
  toISTTime,
  buildTemplateMessage,
  buildCustomerBookingReceived,
  buildProfessionalBookingRequest,
  buildCustomerRegistrationReceived,
  buildProfessionalRegistrationReceived,
} from '../src/lib/meta-whatsapp-templates.js';

test('normaliseMetaRecipient formats Indian mobile numbers correctly', () => {
  assert.equal(normaliseMetaRecipient('9876543210'), '919876543210');
  assert.equal(normaliseMetaRecipient('+919876543210'), '919876543210');
  assert.equal(normaliseMetaRecipient('919876543210'), '919876543210');
  assert.equal(normaliseMetaRecipient('+91 98765 43210'), '919876543210');
  assert.equal(normaliseMetaRecipient('12345'), '');
  assert.equal(normaliseMetaRecipient(null), '');
  assert.equal(normaliseMetaRecipient(undefined), '');
});

test('toISTDate renders an IST long-form date', () => {
  // 2026-11-20T15:00:00+05:30 is a Friday
  assert.equal(toISTDate('2026-11-20T15:00:00+05:30'), 'Friday, 20 November 2026');
  assert.equal(toISTDate(''), '');
  assert.equal(toISTDate('not-a-date'), 'not-a-date');
});

test('toISTTime renders an IST 12-hour time', () => {
  assert.equal(toISTTime('2026-11-20T15:00:00+05:30'), '03:00 pm');
  assert.equal(toISTTime(''), '');
});

test('buildTemplateMessage builds a Cloud API body for an approved template', () => {
  const body = buildTemplateMessage({
    to: '+91 99708 97799',
    templateName: META_TEMPLATE.CUSTOMER_REGISTRATION,
    bodyParams: ['Soyab'],
  });
  assert.deepEqual(body, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '919970897799',
    type: 'template',
    template: {
      name: 'bmp_customer_registration_received',
      language: { code: 'en' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: 'Soyab' }] },
      ],
    },
  });
});

test('buildTemplateMessage rejects an unapproved template name', () => {
  const body = buildTemplateMessage({
    to: '919970897799',
    templateName: 'hello_world',
    bodyParams: [],
  });
  assert.equal(body, null);
});

test('buildTemplateMessage rejects a wrong parameter count', () => {
  assert.equal(
    buildTemplateMessage({
      to: '919970897799',
      templateName: META_TEMPLATE.BOOKING_RECEIVED,
      bodyParams: ['only', 'four', 'params', 'here'],
    }),
    null
  );
  assert.equal(
    buildTemplateMessage({
      to: '919970897799',
      templateName: META_TEMPLATE.CUSTOMER_REGISTRATION,
      bodyParams: ['one', 'two'],
    }),
    null
  );
});

test('buildTemplateMessage rejects a missing or invalid recipient', () => {
  assert.equal(
    buildTemplateMessage({ to: '', templateName: META_TEMPLATE.CUSTOMER_REGISTRATION, bodyParams: ['A'] }),
    null
  );
  assert.equal(
    buildTemplateMessage({ to: '123', templateName: META_TEMPLATE.CUSTOMER_REGISTRATION, bodyParams: ['A'] }),
    null
  );
});

test('every approved template has a declared parameter count', () => {
  for (const name of Object.values(META_TEMPLATE)) {
    assert.equal(typeof META_TEMPLATE_PARAM_COUNT[name], 'number', `${name} has a param count`);
  }
});

test('buildCustomerBookingReceived maps booking fields into template order', () => {
  const body = buildCustomerBookingReceived({
    to: '9970897799',
    customerName: 'Soyab',
    booking: {
      id: 'BMP-79499',
      service_title: 'Home Cleaning',
      date: '2026-11-20',
      time_slot: '3 PM',
    },
  });
  assert.equal(body.template.name, 'bmp_booking_received');
  const params = body.template.components[0].parameters.map((p) => p.text);
  assert.deepEqual(params, ['Soyab', 'BMP-79499', 'Home Cleaning', 'Friday, 20 November 2026', '3 PM']);
});

test('buildCustomerBookingReceived falls back for missing fields', () => {
  const body = buildCustomerBookingReceived({
    to: '9970897799',
    customerName: '',
    booking: { id: 'BMP-1' },
  });
  const params = body.template.components[0].parameters.map((p) => p.text);
  assert.deepEqual(params, ['Customer', 'BMP-1', 'your service', '', '']);
  assert.equal(buildCustomerBookingReceived({ to: '9970897799', customerName: 'A', booking: null }), null);
});

test('buildProfessionalBookingRequest maps booking fields into template order', () => {
  const body = buildProfessionalBookingRequest({
    to: '8919328705',
    professionalName: 'Ravi',
    booking: {
      id: 'BMP-80001',
      service_title: 'Maths Tuition',
      date: '2026-11-21',
      time_slot: '10 AM',
    },
  });
  assert.equal(body.template.name, 'bmp_professional_booking_request');
  const params = body.template.components[0].parameters.map((p) => p.text);
  assert.deepEqual(params, ['Ravi', 'BMP-80001', 'Maths Tuition', 'Saturday, 21 November 2026', '10 AM']);
});

test('buildProfessionalBookingRequest uses scheduled_at when date/time_slot are absent', () => {
  const body = buildProfessionalBookingRequest({
    to: '8919328705',
    professionalName: 'Ravi',
    booking: { id: 'BMP-80002', scheduled_at: '2026-11-21T10:00:00+05:30' },
  });
  const params = body.template.components[0].parameters.map((p) => p.text);
  assert.deepEqual(params, ['Ravi', 'BMP-80002', 'a service', 'Saturday, 21 November 2026', '10:00 am']);
});

test('registration builders build one-parameter welcome messages', () => {
  const customer = buildCustomerRegistrationReceived({ to: '9970897799', customerName: 'Soyab' });
  assert.equal(customer.template.name, 'bmp_customer_registration_received');
  assert.deepEqual(customer.template.components[0].parameters, [{ type: 'text', text: 'Soyab' }]);

  const pro = buildProfessionalRegistrationReceived({ to: '9970897799', professionalName: 'Ravi' });
  assert.equal(pro.template.name, 'bmp_professional_registration_received');
  assert.deepEqual(pro.template.components[0].parameters, [{ type: 'text', text: 'Ravi' }]);

  // Fallback names
  assert.deepEqual(
    buildCustomerRegistrationReceived({ to: '9970897799', customerName: '' }).template.components[0].parameters,
    [{ type: 'text', text: 'Customer' }]
  );
  assert.deepEqual(
    buildProfessionalRegistrationReceived({ to: '9970897799', professionalName: '' }).template.components[0].parameters,
    [{ type: 'text', text: 'Professional' }]
  );
});

test('builders stringify non-string parameter values', () => {
  const body = buildTemplateMessage({
    to: '919970897799',
    templateName: META_TEMPLATE.BOOKING_RECEIVED,
    bodyParams: ['A', 12345, null, undefined, 'x'],
  });
  const params = body.template.components[0].parameters.map((p) => p.text);
  assert.deepEqual(params, ['A', '12345', '', '', 'x']);
});
