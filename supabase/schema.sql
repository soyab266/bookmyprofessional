-- BookMyProfessional — Supabase schema
-- Paste this whole file into: Supabase Dashboard -> SQL Editor -> Run.
-- Idempotent: safe to re-run.
-- Admin is env-based (see .env ADMIN_ID/ADMIN_PASSWORD/ADMIN_SESSION_SECRET) and uses the
-- service-role client, so there is no DB admin role or is_admin() function.

create extension if not exists pgcrypto;

-- ---------- profiles (extends auth.users) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer','professional','admin')),
  full_name text,
  email text,
  phone text,
  city text,
  address text,
  avatar_url text,
  whatsapp_consent boolean not null default false,
  created_at timestamptz not null default now()
);

-- Ensure whatsapp_consent column exists if profiles table already existed
alter table public.profiles add column if not exists whatsapp_consent boolean not null default false;

-- auto-create a profile row on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, phone, city, whatsapp_consent)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'customer'),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'city',
    coalesce((new.raw_user_meta_data->>'whatsapp_consent')::boolean, false)
  )
  on conflict (id) do update set
    whatsapp_consent = coalesce(excluded.whatsapp_consent, public.profiles.whatsapp_consent);
  return new;
exception when others then
  -- Fallback to essential columns so user registration never fails
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill profiles for accounts created before this schema was applied
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  coalesce(u.raw_user_meta_data->>'role', 'customer')
from auth.users u
on conflict (id) do nothing;

-- ---------- locations ----------
create table if not exists public.locations (
  id serial primary key,
  city text not null,
  region text,
  country text not null default 'India',
  latitude double precision,
  longitude double precision,
  unique (city, country)
);

insert into public.locations (city, region, country, latitude, longitude) values
  ('Mumbai', 'Maharashtra', 'India', 19.0760, 72.8777),
  ('Delhi', 'Delhi', 'India', 28.6139, 77.2090),
  ('Bangalore', 'Karnataka', 'India', 12.9716, 77.5946),
  ('Hyderabad', 'Telangana', 'India', 17.3850, 78.4867),
  ('Pune', 'Maharashtra', 'India', 18.5204, 73.8567)
on conflict (city, country) do nothing;

-- ---------- professionals ----------
create table if not exists public.professionals (
  id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  role_title text,
  category text not null,
  specialty text,
  bio text,
  about text,
  city text,
  latitude double precision,
  longitude double precision,
  experience_years int not null default 0,
  hourly_rate numeric(10,2) not null default 0,
  unit text not null default 'hour',
  response_time text,
  image_url text,
  verified boolean not null default false,
  verification_status text not null default 'not_submitted'
    check (verification_status in ('not_submitted', 'documents_requested', 'pending', 'approved', 'rejected')),
  rating numeric(2,1) not null default 0,
  review_count int not null default 0,
  availability jsonb not null default '{}'::jsonb,
  -- cities the professional declares they accept bookings from ("Areas served");
  -- matching is by this explicit declaration, never by assumed district geography
  service_areas text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ensure service_areas exists if the professionals table already existed
alter table public.professionals add column if not exists service_areas text[] not null default '{}';

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  title text not null,
  description text,
  price numeric(10,2) not null default 0,
  duration text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.credentials (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  title text not null,
  issuer text,
  year text
);

-- ---------- verification documents ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  file_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- bookings ----------
create table if not exists public.bookings (
  id text primary key,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_title text,
  service_price numeric(10,2) not null default 0,
  platform_fee numeric(10,2) not null default 0,
  total_paid numeric(10,2) not null default 0,
  date date not null,
  time_slot text not null,
  address text,
  notes text,
  status text not null default 'upcoming'
    check (status in ('upcoming','in_progress','completed','cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid','paid','refunded','failed','refund_pending','refund_failed')),
  payment_method text,
  created_at timestamptz not null default now()
);

-- ---------- reviews ----------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id text unique references public.bookings(id) on delete set null,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  breakdown jsonb,
  status text not null default 'pending' check (status in ('pending','approved','hidden')),
  created_at timestamptz not null default now()
);

-- keep professionals.rating in sync with approved reviews
create or replace function public.refresh_pro_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  pid := coalesce(new.professional_id, old.professional_id);
  update public.professionals p set
    rating = coalesce((select round(avg(rating)::numeric, 1) from public.reviews
                       where professional_id = pid and status = 'approved'), 0),
    review_count = (select count(*) from public.reviews
                    where professional_id = pid and status = 'approved')
  where p.id = pid;
  return null;
end; $$;

drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_pro_rating();

-- ================= ROW LEVEL SECURITY =================
alter table public.profiles      enable row level security;
alter table public.locations     enable row level security;
alter table public.professionals enable row level security;
alter table public.services      enable row level security;
alter table public.credentials   enable row level security;
alter table public.documents     enable row level security;
alter table public.bookings      enable row level security;
alter table public.reviews       enable row level security;

-- profiles: own row only
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select
  using (auth.uid() = id);
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update
  using (auth.uid() = id);
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles for insert
  with check (auth.uid() = id);

-- locations: public read
drop policy if exists locations_public_read on public.locations;
create policy locations_public_read on public.locations for select using (true);

-- professionals: public sees all active pros (badge shows real verification status); owner sees own
drop policy if exists pros_public_read on public.professionals;
create policy pros_public_read on public.professionals for select
  using (is_active or auth.uid() = id);
drop policy if exists pros_owner_write on public.professionals;
create policy pros_owner_write on public.professionals for insert
  with check (auth.uid() = id);
drop policy if exists pros_owner_update on public.professionals;
create policy pros_owner_update on public.professionals for update
  using (auth.uid() = id);

-- services + credentials: public read, owner write
drop policy if exists services_public_read on public.services;
create policy services_public_read on public.services for select using (true);
drop policy if exists services_owner_write on public.services;
create policy services_owner_write on public.services for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);

drop policy if exists creds_public_read on public.credentials;
create policy creds_public_read on public.credentials for select using (true);
drop policy if exists creds_owner_write on public.credentials;
create policy creds_owner_write on public.credentials for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);

-- documents: owner only (status changes are admin/service-role only)
drop policy if exists docs_owner_read on public.documents;
create policy docs_owner_read on public.documents for select
  using (auth.uid() = professional_id);
drop policy if exists docs_owner_insert on public.documents;
create policy docs_owner_insert on public.documents for insert
  with check (auth.uid() = professional_id);
-- remove the old admin-only policy if it exists from a previous run
drop policy if exists docs_admin_update on public.documents;

-- bookings: involved parties
drop policy if exists bookings_read on public.bookings;
create policy bookings_read on public.bookings for select
  using (auth.uid() = customer_id or auth.uid() = professional_id);
drop policy if exists bookings_customer_insert on public.bookings;
create policy bookings_customer_insert on public.bookings for insert
  with check (auth.uid() = customer_id);
drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings for update
  using (auth.uid() = customer_id or auth.uid() = professional_id);

-- reviews: approved are public; author sees own (moderation is admin/service-role only)
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select
  using (status = 'approved' or auth.uid() = customer_id);
drop policy if exists reviews_customer_insert on public.reviews;
create policy reviews_customer_insert on public.reviews for insert
  with check (auth.uid() = customer_id);
-- remove the old admin-only policy if it exists from a previous run
drop policy if exists reviews_admin_update on public.reviews;

-- ================= STORAGE (private verification docs) =================
insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

drop policy if exists docs_upload_own on storage.objects;
create policy docs_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists docs_read_own on storage.objects;
create policy docs_read_own on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
-- remove the old admin-only storage policy if it exists from a previous run
drop policy if exists docs_read_admin on storage.objects;

-- ================= PHASES 6-10 =================

-- ---------- platform settings ----------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);
insert into public.settings (key, value) values ('commission', '{"rate": 0.10}'::jsonb)
on conflict (key) do nothing;

-- ---------- payments (escrow) ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  commission numeric(10,2) not null default 0,
  pro_payout numeric(10,2) not null default 0,
  status text not null default 'held'
    check (status in ('pending','held','released','refunded','failed','refund_pending','refund_failed')),
  provider text,
  provider_ref text,
  created_at timestamptz not null default now()
);

-- ---------- professional payouts ----------
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  status text not null default 'requested'
    check (status in ('requested','processing','paid','rejected')),
  method text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------- notifications ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'info',
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- admin audit log (service-role only) ----------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id),
  action text not null,
  entity text,
  entity_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- notify on booking create + status change (native, no app code needed)
create or replace function public.notify_booking_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, title, body, type, link)
    values (new.professional_id, 'New booking ' || new.id,
            coalesce(new.service_title, 'Service') || ' on ' || new.date || ' at ' || new.time_slot,
            'booking', '/vendor');
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.notifications (user_id, title, body, type, link)
    values (new.customer_id, 'Booking ' || new.id || ' is now ' || replace(new.status, '_', ' '),
            coalesce(new.service_title, 'Service'), 'booking', '/dashboard');
  end if;
  return null;
end; $$;

drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify
  after insert or update on public.bookings
  for each row execute function public.notify_booking_event();

-- ================= RLS (Phases 6-10) =================
alter table public.settings      enable row level security;
alter table public.payments      enable row level security;
alter table public.payouts       enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log     enable row level security;

-- settings: public read (writes are service-role only)
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select using (true);
-- remove the old admin-only policy if it exists from a previous run
drop policy if exists settings_admin_write on public.settings;

-- payments: booking's customer/professional
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select
  using (exists (
    select 1 from public.bookings b
    where b.id = payments.booking_id
      and (b.customer_id = auth.uid() or b.professional_id = auth.uid())));
drop policy if exists payments_booking_owner_insert on public.payments;
create policy payments_booking_owner_insert on public.payments for insert
  with check (exists (
    select 1 from public.bookings b
    where b.id = payments.booking_id and b.customer_id = auth.uid()));
-- remove the old admin-only policy if it exists from a previous run
drop policy if exists payments_admin_write on public.payments;
-- ponytail: lets the involved customer/professional update escrow status (release/refund).
-- Ceiling: it does not enforce which transition each role may make — add a trigger if that matters.
drop policy if exists payments_involved_update on public.payments;
create policy payments_involved_update on public.payments for update
  using (exists (
    select 1 from public.bookings b
    where b.id = payments.booking_id
      and (b.customer_id = auth.uid() or b.professional_id = auth.uid())));

-- payouts: owning professional only (processing is admin/service-role only)
drop policy if exists payouts_read on public.payouts;
create policy payouts_read on public.payouts for select
  using (auth.uid() = professional_id);
drop policy if exists payouts_pro_insert on public.payouts;
create policy payouts_pro_insert on public.payouts for insert
  with check (auth.uid() = professional_id);
-- remove the old admin-only policy if it exists from a previous run
drop policy if exists payouts_admin_update on public.payouts;

-- notifications: own rows only
drop policy if exists notif_own_read on public.notifications;
create policy notif_own_read on public.notifications for select
  using (auth.uid() = user_id);
drop policy if exists notif_own_update on public.notifications;
create policy notif_own_update on public.notifications for update
  using (auth.uid() = user_id);

-- audit_log: no policies -> service-role only (remove the old admin-only policy)
drop policy if exists audit_admin on public.audit_log;

-- ================= cleanup: drop the old admin helper =================
-- must run AFTER every policy above no longer references it
drop function if exists public.is_admin();

-- ================= EXTRA: marketplace features =================

-- review reporting (ceiling: anyone can report repeatedly — add a per-user table if abused)
alter table public.reviews add column if not exists report_count int not null default 0;

create or replace function public.report_review(rid uuid) returns void
language sql security definer set search_path = public as $$
  update public.reviews set report_count = report_count + 1 where id = rid;
$$;

-- messaging: one thread per booking
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_booking_idx on public.messages (booking_id, created_at);

-- direct messages: no booking required (chat started from a professional's profile)
alter table public.messages alter column booking_id drop not null;

alter table public.messages enable row level security;
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert
  with check (auth.uid() = sender_id);
drop policy if exists messages_mark_read on public.messages;
create policy messages_mark_read on public.messages for update
  using (auth.uid() = recipient_id);

-- notify the recipient when a message arrives (native, no app code needed)
create or replace function public.notify_message_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sender_name text;
begin
  if new.recipient_id = new.sender_id then
    return null;
  end if;
  select full_name into sender_name from public.profiles where id = new.sender_id;
  insert into public.notifications (user_id, title, body, type, link)
  values (new.recipient_id,
          'New message from ' || coalesce(sender_name, 'a user'),
          left(new.body, 140),
          'message',
          case when new.booking_id is null
               then '/messages?dm=' || new.sender_id::text
               else '/messages?booking=' || new.booking_id
          end);
  return null;
end; $$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_message_event();

-- profile extras
alter table public.profiles add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists suspended boolean not null default false;
alter table public.profiles add column if not exists pincode text;

-- professional timezone (used to build the UTC instant)
alter table public.professionals add column if not exists timezone text not null default 'Asia/Kolkata';

-- booking UTC instant (date + time_slot remain the display/unique values)
alter table public.bookings add column if not exists starts_at timestamptz;

-- free a slot when its booking is cancelled (failed payment / cancellation) so it can be rebooked.
-- Replaces the old full unique constraint that blocked the slot even after cancellation.
alter table public.bookings drop constraint if exists bookings_professional_id_date_time_slot_key;
create unique index if not exists bookings_active_slot
  on public.bookings (professional_id, date, time_slot)
  where status <> 'cancelled';

-- booking status transitions (server-enforced; service role / SQL bypasses)
create or replace function public.enforce_booking_status() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if old.status = new.status then return new; end if;
  if old.status = 'upcoming' and new.status in ('in_progress','cancelled') then return new; end if;
  if old.status = 'in_progress' and new.status in ('completed','cancelled') then return new; end if;
  raise exception 'invalid booking status transition % -> %', old.status, new.status;
end; $$;

drop trigger if exists bookings_status_guard on public.bookings;
create trigger bookings_status_guard
  before update of status on public.bookings
  for each row execute function public.enforce_booking_status();

-- categories (admin-managed)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.categories (name, sort) values
  ('Doctors', 1), ('Tutors', 2), ('IT Professionals', 3), ('Electricians', 4),
  ('Plumbers', 5), ('Beauticians', 6), ('Cleaners', 7), ('Consultants', 8)
on conflict (name) do nothing;

alter table public.categories enable row level security;
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select using (true);

-- cancellation policy
insert into public.settings (key, value) values ('cancellation', '{"window_hours": 24}'::jsonb)
on conflict (key) do nothing;

-- realtime for live notifications
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_number text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  topic text NOT NULL,
  subject text,
  message text NOT NULL,
  status text DEFAULT 'open'::text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

drop policy if exists "Allow public insert to contacts" on public.contacts;
CREATE POLICY "Allow public insert to contacts"
  ON public.contacts
  FOR INSERT
  WITH CHECK (true);

drop policy if exists "Allow admin to read contacts" on public.contacts;
CREATE POLICY "Allow admin to read contacts"
  ON public.contacts
  FOR SELECT
  USING (true);

-- ---------- wishlists ----------
create table if not exists public.wishlists (
  user_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, professional_id)
);
alter table public.wishlists enable row level security;
drop policy if exists wishlists_select_own on public.wishlists;
create policy wishlists_select_own on public.wishlists for select using (user_id = auth.uid());
drop policy if exists wishlists_insert_own on public.wishlists;
create policy wishlists_insert_own on public.wishlists for insert with check (user_id = auth.uid());
drop policy if exists wishlists_delete_own on public.wishlists;
create policy wishlists_delete_own on public.wishlists for delete using (user_id = auth.uid());

-- ---------- subcategories (hierarchical categories: parent category -> subcategory) ----------
-- A category with parent_id set is a subcategory (e.g. Tutors -> Dance Tutor).
-- Top-level categories have parent_id null and stay the only ones shown as homepage tiles.
alter table public.categories add column if not exists parent_id uuid references public.categories(id) on delete cascade;
alter table public.categories add column if not exists show_on_home boolean not null default true;


alter table public.categories add column if not exists inclusions jsonb not null default '[]'::jsonb;
alter table public.categories add column if not exists exclusions jsonb not null default '[]'::jsonb;

-- Drop obsolete global name unique constraint if present so subcategories under different parents can share names
alter table public.categories drop constraint if exists categories_name_key;

-- Uniqueness: Top-level category names are unique among top-level categories
create unique index if not exists categories_top_level_unique_idx on public.categories (lower(name)) where parent_id is null;

-- Uniqueness: Subcategory names are unique under the same parent category
create unique index if not exists categories_sub_unique_idx on public.categories (parent_id, lower(name)) where parent_id is not null;

-- professional's subcategory (optional text from the chosen category's children)
alter table public.professionals add column if not exists subcategory text;

-- professional's role title fallback
alter table public.professionals add column if not exists role_title text;

-- professional's service-area pincode (optional)
alter table public.professionals add column if not exists pincode text;

-- ---------- keep professionals.name in sync with the account name ----------
create or replace function public.sync_professional_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.professionals set name = new.full_name where id = new.id;
  return new;
end;
$$;
drop trigger if exists profiles_sync_pro_name on public.profiles;
create trigger profiles_sync_pro_name
  after update of full_name on public.profiles
  for each row
  when (new.full_name is distinct from old.full_name)
  execute function public.sync_professional_name();

-- ---------- service inclusions (display-only: what a price covers) ----------
-- Admin sets per-category defaults; professionals customise per service.
-- Both are text arrays rendered as bullet lists on the profile / booking screens.
alter table public.categories add column if not exists inclusions jsonb not null default '[]'::jsonb;
alter table public.categories add column if not exists exclusions jsonb not null default '[]'::jsonb;
alter table public.services add column if not exists inclusions jsonb not null default '[]'::jsonb;
alter table public.services add column if not exists exclusions jsonb not null default '[]'::jsonb;

-- ---------- homepage category tiles (admin-controlled) ----------
-- Admin ticks a top-level category in Admin -> Categories to show it in the homepage
-- "Explore Our Top Categories" grid. Unticked categories stay in the directory only.
alter table public.categories add column if not exists show_on_home boolean not null default true;


-- ---------- professional payout details (bank account / UPI destination) ----------
alter table public.professionals add column if not exists payout_details jsonb not null default '{}'::jsonb;
alter table public.payouts add column if not exists payout_details jsonb;
