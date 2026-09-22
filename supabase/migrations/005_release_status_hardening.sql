-- ============================================================
-- RELEASE STATUS HARDENING
-- ============================================================

create or replace function public.release_order_reservation(
  p_order_id uuid,
  p_reason text default 'payment-cancelled'
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_product public.products%rowtype;
  v_final_status public.order_status;
  v_final_payment_status public.payment_status;
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if v_order.status in ('cancelled', 'payment_failed') then
    return v_order;
  end if;

  if v_order.status <> 'pending_payment' then
    raise exception
      'Only pending orders can release reservations.';
  end if;

  if lower(coalesce(p_reason, '')) in (
    'payment-failed',
    'failed',
    'payment_failed'
  ) then
    v_final_status := 'payment_failed';
    v_final_payment_status := 'failed';
  else
    v_final_status := 'cancelled';
    v_final_payment_status := 'cancelled';
  end if;

  for v_item in
    select
      oi.product_id,
      sum(oi.quantity)::integer as quantity
    from public.order_items oi
    where oi.order_id = v_order.id
    group by oi.product_id
    order by oi.product_id
  loop

    select *
    into v_product
    from public.products
    where id = v_item.product_id
    for update;

    if v_product.reserved_stock < v_item.quantity then
      raise exception
        'Reservation inconsistency for product %.',
        v_product.name;
    end if;

    update public.products
    set reserved_stock = reserved_stock - v_item.quantity
    where id = v_product.id;

  end loop;

  update public.orders
  set
    status = v_final_status,
    payment_status = v_final_payment_status,
    payment_raw_response =
      coalesce(payment_raw_response, '{}'::jsonb)
      || jsonb_build_object(
        'release_reason', coalesce(p_reason, 'payment-cancelled'),
        'released_at', now()
      )
  where id = v_order.id
  returning *
  into v_order;

  return v_order;
end;
$$;

revoke all on function public.release_order_reservation(
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.release_order_reservation(
  uuid,
  text
) to service_role;

comment on function public.release_order_reservation(
  uuid,
  text
) is
  'Server-only idempotent release of a pending order reservation with cancellation/failure state preservation.';
