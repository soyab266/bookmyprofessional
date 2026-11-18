-- Draft migration for review - NOT applied to any environment.
-- Delivery tracking for Meta WhatsApp sends: stores the provider message id
-- (wamid) at acceptance time and the latest delivery status reported by the
-- Meta webhook (sent/delivered/read/failed, plus Meta's error on failure).
--
-- DEPENDENCY: the code that writes these columns treats them as required when
-- META_WHATSAPP_TRACKING_ENABLED=true. Tracking must stay disabled until this
-- migration is approved AND applied; a write against a missing column fails
-- loudly (logged) and never changes acceptance semantics - an accepted row
-- stays accepted and is never re-queued or resent by a tracking failure.

alter table public.notification_outbox
  add column if not exists meta_message_id text,
  add column if not exists delivery_status text,
  add column if not exists delivery_status_at timestamptz,
  add column if not exists delivery_error text;

-- Webhook status callbacks look rows up by the provider message id.
create index if not exists notification_outbox_meta_message_id
  on public.notification_outbox (meta_message_id);
