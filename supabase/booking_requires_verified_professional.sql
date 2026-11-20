-- Bookings may only be created for verified, approved professionals.
-- Apply to every booking insert and professional reassignment, including service-role writes.
create or replace function public.enforce_booking_verified_professional() returns trigger
language plpgsql as $$
declare
  pro_verified boolean;
  pro_status text;
begin
  if TG_OP = 'UPDATE' then
    -- Receipt reconciliation, cancellations, refunds and history stay writable.
    -- Starting service, reassignment and a new slot require current approval.
    if new.professional_id is not distinct from old.professional_id
      and not (new.status = 'in_progress' and old.status is distinct from 'in_progress')
      and not (new.status = 'upcoming' and old.status is distinct from 'upcoming')
      and (to_jsonb(new)->'date') is not distinct from (to_jsonb(old)->'date')
      and (to_jsonb(new)->'time_slot') is not distinct from (to_jsonb(old)->'time_slot')
      and (to_jsonb(new)->'starts_at') is not distinct from (to_jsonb(old)->'starts_at') then
      return new;
    end if;
  end if;
  select verified, verification_status into pro_verified, pro_status
    from public.professionals where id = new.professional_id for share;
  if not found or pro_verified is not true or pro_status is distinct from 'approved' then
    raise exception 'bookings require a verified professional';
  end if;
  return new;
end; $$;

drop trigger if exists bookings_verified_professional_guard on public.bookings;
create trigger bookings_verified_professional_guard
  before insert or update on public.bookings
  for each row execute function public.enforce_booking_verified_professional();
