-- ============================================================
-- ADMIN PRODUCT CREATION
-- Creates a product and its initial stock movement atomically.
-- ============================================================

create or replace function public.admin_create_product(
  p_slug text,
  p_name text,
  p_description text,
  p_price_cents integer,
  p_currency text,
  p_category text,
  p_sizes text[],
  p_tag text,
  p_image_url text,
  p_alt_text text,
  p_allow_direct_checkout boolean,
  p_stock integer,
  p_sort_order integer,
  p_created_by uuid
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Product name is required.';
  end if;

  if p_slug is null or length(trim(p_slug)) = 0 then
    raise exception 'Product slug is required.';
  end if;

  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'Product price cannot be negative.';
  end if;

  if p_stock is null or p_stock < 0 then
    raise exception 'Product stock cannot be negative.';
  end if;

  if p_created_by is null then
    raise exception 'Creating admin is required.';
  end if;

  insert into public.products (
    slug,
    name,
    description,
    price_cents,
    currency,
    category,
    sizes,
    tag,
    image_url,
    alt_text,
    allow_direct_checkout,
    active,
    stock,
    reserved_stock,
    sort_order
  )
  values (
    trim(p_slug),
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    p_price_cents,
    coalesce(nullif(trim(p_currency), ''), 'USD'),
    nullif(trim(coalesce(p_category, '')), ''),
    coalesce(p_sizes, '{}'::text[]),
    nullif(trim(coalesce(p_tag, '')), ''),
    nullif(trim(coalesce(p_image_url, '')), ''),
    nullif(trim(coalesce(p_alt_text, '')), ''),
    coalesce(p_allow_direct_checkout, true),
    true,
    p_stock,
    0,
    coalesce(p_sort_order, 0)
  )
  returning *
  into v_product;

  if p_stock > 0 then
    insert into public.stock_movements (
      product_id,
      quantity_delta,
      stock_before,
      stock_after,
      reason,
      created_by
    )
    values (
      v_product.id,
      p_stock,
      0,
      p_stock,
      'initial_stock',
      p_created_by
    );
  end if;

  return v_product;
end;
$$;

revoke execute on function public.admin_create_product(
  text,
  text,
  text,
  integer,
  text,
  text,
  text[],
  text,
  text,
  text,
  boolean,
  integer,
  integer,
  uuid
) from public, anon, authenticated;

grant execute on function public.admin_create_product(
  text,
  text,
  text,
  integer,
  text,
  text,
  text[],
  text,
  text,
  text,
  boolean,
  integer,
  integer,
  uuid
) to service_role;
