-- ============================================================
-- ADMIN PRODUCT UPDATE
-- Updates an existing product's fields, including publish state.
-- Does NOT touch stock directly — that stays the job of
-- admin_adjust_inventory, so every stock change keeps going
-- through the stock_movements audit trail.
-- ============================================================

create or replace function public.admin_update_product(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_price_cents integer,
  p_category text,
  p_sizes text[],
  p_tag text,
  p_image_url text,
  p_alt_text text,
  p_allow_direct_checkout boolean,
  p_active boolean
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
begin
  if p_product_id is null then
    raise exception 'Product ID is required.';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Product name is required.';
  end if;

  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'Product price cannot be negative.';
  end if;

  update public.products
  set
    name = trim(p_name),
    description = nullif(trim(coalesce(p_description, '')), ''),
    price_cents = p_price_cents,
    category = nullif(trim(coalesce(p_category, '')), ''),
    sizes = coalesce(p_sizes, '{}'::text[]),
    tag = nullif(trim(coalesce(p_tag, '')), ''),
    image_url = nullif(trim(coalesce(p_image_url, '')), ''),
    alt_text = nullif(trim(coalesce(p_alt_text, '')), ''),
    allow_direct_checkout = coalesce(p_allow_direct_checkout, true),
    active = coalesce(p_active, active),
    updated_at = now()
  where id = p_product_id
  returning *
  into v_product;

  if not found then
    raise exception 'Product not found.';
  end if;

  return v_product;
end;
$$;

revoke execute on function public.admin_update_product(
  uuid, text, text, integer, text, text[], text, text, text, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.admin_update_product(
  uuid, text, text, integer, text, text[], text, text, text, boolean, boolean
) to service_role;

comment on function public.admin_update_product(
  uuid, text, text, integer, text, text[], text, text, text, boolean, boolean
) is
  'Admin-only: updates a product''s fields including publish state (active). Stock changes go through admin_adjust_inventory instead.';
