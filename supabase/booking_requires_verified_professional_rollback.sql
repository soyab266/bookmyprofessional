-- Rollback for booking_requires_verified_professional.sql.
-- The trigger and function are introduced by that migration (nothing prior to restore),
-- so rollback is a clean drop. No table or data changes need reverting.
drop trigger if exists bookings_verified_professional_guard on public.bookings;
drop function if exists public.enforce_booking_verified_professional();
