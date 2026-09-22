-- ============================================================
-- ADMIN INVENTORY ADJUSTMENT
-- ============================================================

create or replace function public.admin_adjust_inventory(
  p_product_id uuid,
  p_quantity_delta integer,
  p_reason text,
  p_created_by uuid
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_new_stock integer;
begin
  if p_product_id is null then
    raise exception 'Product ID is required.';
  end if;

  if p_quantity_delta = 0 then
    raise exception 'Inventory quantity cannot be zero.';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Inventory adjustment reason is required.';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  v_new_stock := v_product.stock + p_quantity_delta;

  if v_new_stock < 0 then
    raise exception 'Stock cannot become negative.';
  end if;

  if v_new_stock < v_product.reserved_stock then
    raise exception
      'Stock cannot fall below currently reserved stock (%).',
      v_product.reserved_stock;
  end if;

  update public.products
  set stock = v_new_stock,
      updated_at = now()
  where id = p_product_id
  returning *
  into v_product;

  insert into public.stock_movements (
    product_id,
    quantity_delta,
    stock_before,
    stock_after,
    reason,
    created_by
  )
  values (
    p_product_id,
    p_quantity_delta,
    v_new_stock - p_quantity_delta,
    v_new_stock,
    trim(p_reason),
    p_created_by
  );

  return v_product;
end;
$$;

revoke execute on function public.admin_adjust_inventory(
  uuid,
  integer,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.admin_adjust_inventory(
  uuid,
  integer,
  text,
  uuid
) to service_role;
