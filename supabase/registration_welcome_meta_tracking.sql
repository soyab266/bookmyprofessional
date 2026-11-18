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

-- Staging for status events that arrive before the outbox row holds their
-- wamid (webhook/acceptance race) or for messages accepted before tracking
-- existed. Rows are deleted when reconciled at acceptance time; rows whose
-- wamid never gets an outbox row linger for manual review/cleanup.
create table if not exists public.meta_status_events (
  id uuid primary key default gen_random_uuid(),
  meta_message_id text not null,
  status text not null,
  status_at timestamptz,
  error text,
  received_at timestamptz not null default now()
);

create index if not exists meta_status_events_meta_message_id
  on public.meta_status_events (meta_message_id);
