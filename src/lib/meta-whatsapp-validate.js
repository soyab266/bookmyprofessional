// Server-only validation for Meta Cloud API WhatsApp template payloads.
// Never import from a client component.
//
// Meta rejects template text parameters that contain newlines, tabs or
// more than four consecutive spaces, and rejects sends to malformed
// recipients. These helpers catch those problems before a send is attempted.

import { META_TEMPLATE_PARAM_COUNT, normaliseMetaRecipient } from './meta-whatsapp-templates.js';

/**
 * Meta's documented restrictions for template text parameters.
 * Returns the cleaned text, or null when it cannot be made valid.
 */
export function sanitiseTemplateParam(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Newlines and tabs are not allowed inside template parameters.
  text = text.replace(/[\r\n\t]+/g, ' ');
  // More than 4 consecutive spaces are not allowed.
  text = text.replace(/ {5,}/g, '    ');
  return text.trim();
}

/**
 * Validate a single template text parameter.
 * @returns {{ ok: boolean, text: string, error?: string }}
 */
export function validateTemplateParam(value) {
  const text = sanitiseTemplateParam(value);
  if (text === '') {
    return { ok: false, text, error: 'empty_parameter' };
  }
  if (text.length > 1024) {
    return { ok: false, text, error: 'parameter_too_long' };
  }
  return { ok: true, text };
}

/**
 * Validate a recipient phone number for the Cloud API.
 * @returns {{ ok: boolean, to: string, error?: string }}
 */
export function validateRecipient(to) {
  const normalised = normaliseMetaRecipient(to);
  if (!normalised) {
    return { ok: false, to: '', error: 'invalid_recipient' };
  }
  if (normalised.length < 12 || normalised.length > 15) {
    return { ok: false, to: normalised, error: 'invalid_recipient_length' };
  }
  return { ok: true, to: normalised };
}

/**
 * Validate a full template message payload built by meta-whatsapp-templates.js.
 * Returns { ok, errors[], sanitised } where sanitised is a cleaned copy of the
 * payload (parameters sanitised) that is safe to send when ok is true.
 *
 * @param {object} payload
 * @returns {{ ok: boolean, errors: string[], sanitised?: object }}
 */
export function validateTemplateMessage(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: ['missing_payload'] };
  }
  if (payload.messaging_product !== 'whatsapp') {
    errors.push('bad_messaging_product');
  }
  if (payload.type !== 'template') {
    errors.push('bad_message_type');
  }

  const recipient = validateRecipient(payload.to);
  if (!recipient.ok) {
    errors.push(recipient.error);
  }

  const template = payload.template;
  if (!template || typeof template !== 'object') {
    errors.push('missing_template');
    return { ok: false, errors };
  }
  if (!template.name || META_TEMPLATE_PARAM_COUNT[template.name] === undefined) {
    errors.push('unapproved_template');
  }
  if (template.language?.code !== 'en') {
    errors.push('bad_language_code');
  }

  const components = Array.isArray(template.components) ? template.components : [];
  const body = components.find((c) => c?.type === 'body');
  if (!body || !Array.isArray(body.parameters)) {
    errors.push('missing_body_parameters');
    return { ok: false, errors };
  }

  const expected = META_TEMPLATE_PARAM_COUNT[template.name];
  if (expected !== undefined && body.parameters.length !== expected) {
    errors.push('wrong_parameter_count');
  }

  const sanitisedParams = [];
  for (const param of body.parameters) {
    if (param?.type !== 'text') {
      errors.push('non_text_parameter');
      continue;
    }
    const check = validateTemplateParam(param.text);
    if (!check.ok) {
      errors.push(check.error);
    }
    sanitisedParams.push({ type: 'text', text: check.text });
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    sanitised: {
      ...payload,
      to: recipient.to,
      template: {
        ...template,
        components: [{ type: 'body', parameters: sanitisedParams }],
      },
    },
  };
}
