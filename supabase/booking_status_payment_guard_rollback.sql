-- Rollback for supabase/booking_status_payment_guard.sql.
-- Restores the EXACT function definition currently deployed in production
-- (read live via pg_get_functiondef on 2026-11-20), which matches the body in
-- supabase/schema.sql. No table, trigger, or data changes are needed: the
-- bookings_status_guard trigger keeps pointing at this function.

create or replace function public.enforce_booking_status() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if old.status = new.status then return new; end if;
  if old.status = 'upcoming' and new.status in ('in_progress','cancelled') then return new; end if;
  if old.status = 'in_progress' and new.status in ('completed','cancelled') then return new; end if;
  raise exception 'invalid booking status transition % -> %', old.status, new.status;
end; $$;
