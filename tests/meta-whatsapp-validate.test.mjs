import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

import {
  sanitiseTemplateParam,
  validateTemplateParam,
  validateRecipient,
  validateTemplateMessage,
} from '../src/lib/meta-whatsapp-validate.js';
import {
  META_TEMPLATE,
  buildCustomerBookingReceived,
  buildCustomerRegistrationReceived,
} from '../src/lib/meta-whatsapp-templates.js';

test('sanitiseTemplateParam strips newlines, tabs and long space runs', () => {
  assert.equal(sanitiseTemplateParam('line1\nline2'), 'line1 line2');
  assert.equal(sanitiseTemplateParam('a\tb'), 'a b');
  assert.equal(sanitiseTemplateParam('a      b'), 'a    b'); // 6 spaces -> 4
  assert.equal(sanitiseTemplateParam('  padded  '), 'padded');
  assert.equal(sanitiseTemplateParam(null), '');
  assert.equal(sanitiseTemplateParam(undefined), '');
  assert.equal(sanitiseTemplateParam(42), '42');
});

test('validateTemplateParam rejects empty and over-long values', () => {
  assert.equal(validateTemplateParam('').ok, false);
  assert.equal(validateTemplateParam('').error, 'empty_parameter');
  assert.equal(validateTemplateParam(null).ok, false);
  assert.equal(validateTemplateParam('x'.repeat(1024)).ok, true);
  assert.equal(validateTemplateParam('x'.repeat(1025)).ok, false);
  assert.equal(validateTemplateParam('x'.repeat(1025)).error, 'parameter_too_long');
  assert.deepEqual(validateTemplateParam('Booking BMP-1'), { ok: true, text: 'Booking BMP-1' });
});

test('validateRecipient accepts Indian numbers and rejects bad ones', () => {
  assert.deepEqual(validateRecipient('+91 99708 97799'), { ok: true, to: '919970897799' });
  assert.equal(validateRecipient('9970897799').ok, true);
  assert.equal(validateRecipient('123').ok, false);
  assert.equal(validateRecipient('').ok, false);
  assert.equal(validateRecipient(null).ok, false);
});

test('validateTemplateMessage accepts a builder-produced payload', () => {
  const payload = buildCustomerRegistrationReceived({ to: '+91 99708 97799', customerName: 'Soyab' });
  const result = validateTemplateMessage(payload);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.sanitised.to, '919970897799');
});

test('validateTemplateMessage rejects a missing payload', () => {
  assert.deepEqual(validateTemplateMessage(null), { ok: false, errors: ['missing_payload'] });
  assert.deepEqual(validateTemplateMessage(undefined), { ok: false, errors: ['missing_payload'] });
});

test('validateTemplateMessage rejects wrong envelope fields', () => {
  const payload = buildCustomerRegistrationReceived({ to: '919970897799', customerName: 'Soyab' });
  const bad1 = { ...payload, messaging_product: 'sms' };
  assert.ok(validateTemplateMessage(bad1).errors.includes('bad_messaging_product'));
  const bad2 = { ...payload, type: 'text' };
  assert.ok(validateTemplateMessage(bad2).errors.includes('bad_message_type'));
});

test('validateTemplateMessage rejects unapproved templates and bad language', () => {
  const payload = buildCustomerRegistrationReceived({ to: '919970897799', customerName: 'Soyab' });
  const badTemplate = { ...payload, template: { ...payload.template, name: 'hello_world' } };
  assert.ok(validateTemplateMessage(badTemplate).errors.includes('unapproved_template'));
  const badLang = { ...payload, template: { ...payload.template, language: { code: 'hi' } } };
  assert.ok(validateTemplateMessage(badLang).errors.includes('bad_language_code'));
});

test('validateTemplateMessage rejects wrong parameter count', () => {
  const payload = buildCustomerRegistrationReceived({ to: '919970897799', customerName: 'Soyab' });
  const bad = {
    ...payload,
    template: {
      ...payload.template,
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] }],
    },
  };
  assert.ok(validateTemplateMessage(bad).errors.includes('wrong_parameter_count'));
});

test('validateTemplateMessage rejects empty and non-text parameters', () => {
  const payload = buildCustomerRegistrationReceived({ to: '919970897799', customerName: 'Soyab' });
  const empty = {
    ...payload,
    template: { ...payload.template, components: [{ type: 'body', parameters: [{ type: 'text', text: '' }] }] },
  };
  assert.ok(validateTemplateMessage(empty).errors.includes('empty_parameter'));
  const nonText = {
    ...payload,
    template: { ...payload.template, components: [{ type: 'body', parameters: [{ type: 'image' }] }] },
  };
  assert.ok(validateTemplateMessage(nonText).errors.includes('non_text_parameter'));
});

test('validateTemplateMessage sanitises newlines inside parameters', () => {
  const payload = buildCustomerBookingReceived({
    to: '919970897799',
    customerName: 'Soyab\nShekh',
    booking: { id: 'BMP-1', service_title: 'Cleaning', date: '2026-11-20', time_slot: '3 PM' },
  });
  const result = validateTemplateMessage(payload);
  assert.equal(result.ok, true);
  assert.equal(result.sanitised.template.components[0].parameters[0].text, 'Soyab Shekh');
});

test('validateTemplateMessage rejects a bad recipient inside the payload', () => {
  const payload = buildCustomerRegistrationReceived({ to: '919970897799', customerName: 'Soyab' });
  const bad = { ...payload, to: 'not-a-number' };
  const result = validateTemplateMessage(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('invalid_recipient'));
});

test('validateTemplateMessage flags missing template section', () => {
  const result = validateTemplateMessage({ messaging_product: 'whatsapp', type: 'template', to: '919970897799' });
  assert.ok(result.errors.includes('missing_template'));
});

test('validateTemplateMessage flags missing body parameters', () => {
  const result = validateTemplateMessage({
    messaging_product: 'whatsapp',
    type: 'template',
    to: '919970897799',
    template: { name: META_TEMPLATE.CUSTOMER_REGISTRATION, language: { code: 'en' }, components: [] },
  });
  assert.ok(result.errors.includes('missing_body_parameters'));
});
