-- Bookings may only be created for verified, approved professionals.
-- Same bypass convention as enforce_booking_status: service role / SQL (auth.uid() null) bypasses.
create or replace function public.enforce_booking_verified_professional() returns trigger
language plpgsql as $$
declare
  pro_verified boolean;
  pro_status text;
begin
  if auth.uid() is null then return new; end if;
  select verified, verification_status into pro_verified, pro_status
    from public.professionals where id = new.professional_id;
  if not found or pro_verified is not true or pro_status <> 'approved' then
    raise exception 'bookings require a verified professional';
  end if;
  return new;
end; $$;

drop trigger if exists bookings_verified_professional_guard on public.bookings;
create trigger bookings_verified_professional_guard
  before insert on public.bookings
  for each row execute function public.enforce_booking_verified_professional();
