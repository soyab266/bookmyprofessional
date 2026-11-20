-- Bookings may only be created for verified, approved professionals.
-- Apply to every booking insert and professional reassignment, including service-role writes.
create or replace function public.enforce_booking_verified_professional() returns trigger
language plpgsql as $$
declare
  pro_verified boolean;
  pro_status text;
begin
  select verified, verification_status into pro_verified, pro_status
    from public.professionals where id = new.professional_id;
  if not found or pro_verified is not true or pro_status is distinct from 'approved' then
    raise exception 'bookings require a verified professional';
  end if;
  return new;
end; $$;

drop trigger if exists bookings_verified_professional_guard on public.bookings;
create trigger bookings_verified_professional_guard
  before insert or update of professional_id on public.bookings
  for each row execute function public.enforce_booking_verified_professional();
