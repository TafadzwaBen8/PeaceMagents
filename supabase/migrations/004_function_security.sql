-- ============================================================
-- FUNCTION SECURITY HARDENING
--
-- SECURITY DEFINER functions must never be callable by PUBLIC
-- unless that access is explicitly intended.
-- ============================================================

-- Privileged order/payment functions:
revoke all on function public.create_pending_order(
  jsonb,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated;

revoke all on function public.confirm_order_paid(
  uuid,
  text,
  integer,
  jsonb
) from public, anon, authenticated;

revoke all on function public.release_order_reservation(
  uuid,
  text
) from public, anon, authenticated;

revoke all on function public.get_expired_pending_orders(
  integer
) from public, anon, authenticated;

-- These are deliberately callable only by the server.
grant execute on function public.create_pending_order(
  jsonb,
  text,
  text,
  text,
  uuid
) to service_role;

grant execute on function public.confirm_order_paid(
  uuid,
  text,
  integer,
  jsonb
) to service_role;

grant execute on function public.release_order_reservation(
  uuid,
  text
) to service_role;

grant execute on function public.get_expired_pending_orders(
  integer
) to service_role;


-- available_stock is intentionally public because it is a
-- read-only helper used to expose availability.
revoke all on function public.available_stock(
  uuid
) from public, anon, authenticated;

grant execute on function public.available_stock(
  uuid
) to anon, authenticated, service_role;


-- is_admin is used by authenticated RLS policies.
-- It reads only the caller's own profile.
revoke all on function public.is_admin()
  from public, anon;

grant execute on function public.is_admin()
  to authenticated, service_role;


-- The auth trigger owns the handle_new_user call.
-- It does not need to be exposed to API clients.
revoke all on function public.handle_new_user()
  from public, anon, authenticated;


comment on function public.create_pending_order(
  jsonb,
  text,
  text,
  text,
  uuid
) is
  'Server-only atomic order creation and inventory reservation.';

comment on function public.confirm_order_paid(
  uuid,
  text,
  integer,
  jsonb
) is
  'Server-only idempotent Paynow payment confirmation and stock conversion.';

comment on function public.release_order_reservation(
  uuid,
  text
) is
  'Server-only idempotent release of a pending order inventory reservation.';

comment on function public.get_expired_pending_orders(
  integer
) is
  'Server-only lookup of expired pending orders for Paynow reconciliation.';

comment on function public.available_stock(
  uuid
) is
  'Read-only available inventory calculation: physical stock minus reserved stock.';

comment on function public.is_admin()
  is
  'Returns whether the authenticated caller has the admin role.';

