-- Require verified payment before a booking can start (in_progress).
-- Extends enforce_booking_status: transition shape rules are unchanged;
-- the only added rule is upcoming -> in_progress requires payment_status = 'paid'.
-- Cancellation of unpaid bookings and all paid-booking flows are unaffected.
-- Rollback: re-apply the original function body from supabase/schema.sql
-- (the version without the payment check); no table or data changes involved.

create or replace function public.enforce_booking_status() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if old.status = new.status then return new; end if;
  if old.status = 'upcoming' and new.status = 'in_progress' then
    if old.payment_status is distinct from 'paid' then
      raise exception 'booking % cannot start before payment is verified (payment_status=%)', old.id, old.payment_status;
    end if;
    return new;
  end if;
  if old.status = 'upcoming' and new.status = 'cancelled' then return new; end if;
  if old.status = 'in_progress' and new.status in ('completed','cancelled') then return new; end if;
  raise exception 'invalid booking status transition % -> %', old.status, new.status;
end; $$;

-- Trigger already exists from schema.sql (bookings_status_guard); the function
-- replacement above takes effect for it immediately. Re-create defensively:
drop trigger if exists bookings_status_guard on public.bookings;
create trigger bookings_status_guard
  before update of status on public.bookings
  for each row execute function public.enforce_booking_status();
