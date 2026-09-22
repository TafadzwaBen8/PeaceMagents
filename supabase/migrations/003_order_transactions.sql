-- ============================================================
-- PEACEMAGENTS PRODUCTION DATABASE
-- Migration 003: Atomic orders, reservations and payment state
-- ============================================================

-- ============================================================
-- ORDER EXPIRY / PAYMENT REFERENCE
-- ============================================================

alter table public.orders
  add column if not exists expires_at timestamptz
    not null default (now() + interval '20 minutes');

create unique index if not exists orders_payment_reference_unique
  on public.orders (payment_reference)
  where payment_reference is not null;

create index if not exists orders_pending_expiry_idx
  on public.orders (status, expires_at)
  where status = 'pending_payment';

create index if not exists products_available_stock_idx
  on public.products (active, stock, reserved_stock);

-- ============================================================
-- CREATE PENDING ORDER
--
-- The browser supplies only:
--   slug
--   quantity
--   size
--
-- Product names and prices come from the database.
-- Stock is reserved atomically.
-- ============================================================

create or replace function public.create_pending_order(
  p_items jsonb,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_user_id uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_item record;
  v_requested_count integer;
  v_valid_count integer;
  v_subtotal integer := 0;
  v_order_number text;
begin
  -- ----------------------------------------------------------
  -- Basic validation
  -- ----------------------------------------------------------

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must contain at least one item.';
  end if;

  if p_customer_name is null
     or length(trim(p_customer_name)) < 2 then
    raise exception 'Customer name is required.';
  end if;

  if p_customer_email is null
     or position('@' in p_customer_email) < 2 then
    raise exception 'Valid customer email is required.';
  end if;

  -- ----------------------------------------------------------
  -- User identity
  --
  -- A service-role API may explicitly provide the authenticated
  -- user's UUID. A normal caller must never be able to submit
  -- another user's UUID.
  -- ----------------------------------------------------------

  if p_user_id is not null
     and auth.uid() is not null
     and p_user_id <> auth.uid() then
    raise exception 'User identity mismatch.';
  end if;

  -- ----------------------------------------------------------
  -- Temporary normalized cart
  -- ----------------------------------------------------------

  create temporary table _pm_requested_items (
    slug text not null,
    quantity integer not null,
    size text,
    product_id uuid
  ) on commit drop;

  insert into _pm_requested_items (
    slug,
    quantity,
    size,
    product_id
  )
  select
    x.slug,
    x.quantity,
    nullif(trim(x.size), ''),
    p.id
  from jsonb_to_recordset(p_items)
    as x(
      slug text,
      quantity integer,
      size text
    )
  left join public.products p
    on p.slug = x.slug;

  select count(*)
  into v_requested_count
  from _pm_requested_items;

  select count(*)
  into v_valid_count
  from _pm_requested_items
  where product_id is not null;

  if v_requested_count <> v_valid_count then
    raise exception 'One or more requested products do not exist.';
  end if;

  if exists (
    select 1
    from _pm_requested_items
    where slug is null
       or trim(slug) = ''
       or quantity is null
       or quantity <= 0
  ) then
    raise exception 'Each order item must contain a valid product slug and positive quantity.';
  end if;

  if exists (
    select 1
    from _pm_requested_items
    where product_id is null
  ) then
    raise exception 'One or more requested products do not exist.';
  end if;

  -- ----------------------------------------------------------
  -- Lock every requested product in deterministic UUID order.
  --
  -- This is what prevents concurrent checkouts from both
  -- successfully reserving the same final unit.
  -- ----------------------------------------------------------

  for v_product in
    select p.*
    from public.products p
    where p.id in (
      select distinct product_id
      from _pm_requested_items
    )
    order by p.id
    for update
  loop
    if not v_product.active then
      raise exception 'Product "%" is no longer available.',
        v_product.name;
    end if;

    if not v_product.allow_direct_checkout then
      raise exception 'Product "%" requires an enquiry.',
        v_product.name;
    end if;
  end loop;

  -- ----------------------------------------------------------
  -- Validate aggregate requested quantity against available
  -- stock AFTER the product rows have been locked.
  -- ----------------------------------------------------------

  for v_item in
    select
      p.id,
      p.name,
      p.stock,
      p.reserved_stock,
      sum(r.quantity)::integer as requested_quantity
    from _pm_requested_items r
    join public.products p
      on p.id = r.product_id
    group by
      p.id,
      p.name,
      p.stock,
      p.reserved_stock
    order by p.id
  loop
    if (v_item.stock - v_item.reserved_stock)
       < v_item.requested_quantity then

      raise exception
        'Insufficient available stock for "%". Available: %, requested: %.',
        v_item.name,
        greatest(v_item.stock - v_item.reserved_stock, 0),
        v_item.requested_quantity;
    end if;
  end loop;

  -- ----------------------------------------------------------
  -- Generate merchant order number.
  -- ----------------------------------------------------------

  v_order_number :=
    'PM-' ||
    to_char(now(), 'YYYYMMDD') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  -- ----------------------------------------------------------
  -- Create pending order.
  -- Amount is filled after database pricing is calculated.
  -- ----------------------------------------------------------

  insert into public.orders (
    user_id,
    order_number,
    status,
    payment_status,
    currency,
    subtotal_cents,
    total_cents,
    customer_name,
    customer_email,
    customer_phone,
    payment_provider,
    expires_at
  )
  values (
    p_user_id,
    v_order_number,
    'pending_payment',
    'pending',
    'USD',
    0,
    0,
    trim(p_customer_name),
    lower(trim(p_customer_email)),
    nullif(trim(p_customer_phone), ''),
    'paynow',
    now() + interval '20 minutes'
  )
  returning *
  into v_order;

  -- ----------------------------------------------------------
  -- Insert immutable order item snapshots.
  -- Prices come from public.products, NEVER from the browser.
  -- ----------------------------------------------------------

  for v_item in
    select
      r.slug,
      r.quantity,
      r.size,
      p.id as product_id,
      p.name,
      p.price_cents,
      p.currency,
      p.sizes
    from _pm_requested_items r
    join public.products p
      on p.id = r.product_id
    order by p.id, r.slug, r.size nulls first
  loop

    if v_item.size is not null
       and not (v_item.size = any(v_item.sizes)) then
      raise exception
        'Invalid size "%" for product "%".',
        v_item.size,
        v_item.name;
    end if;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      product_slug,
      quantity,
      unit_price_cents,
      line_total_cents,
      size
    )
    values (
      v_order.id,
      v_item.product_id,
      v_item.name,
      v_item.slug,
      v_item.quantity,
      v_item.price_cents,
      v_item.quantity * v_item.price_cents,
      v_item.size
    );

    v_subtotal :=
      v_subtotal +
      (v_item.quantity * v_item.price_cents);
  end loop;

  -- ----------------------------------------------------------
  -- Final order total.
  -- Shipping/tax can be added later without trusting the client.
  -- ----------------------------------------------------------

  update public.orders
  set
    subtotal_cents = v_subtotal,
    total_cents = v_subtotal
  where id = v_order.id
  returning *
  into v_order;

  -- ----------------------------------------------------------
  -- Reserve inventory.
  -- Physical stock does NOT decrease here.
  -- reserved_stock increases instead.
  -- ----------------------------------------------------------

  for v_item in
    select
      p.id,
      p.name,
      p.stock,
      p.reserved_stock,
      sum(r.quantity)::integer as requested_quantity
    from _pm_requested_items r
    join public.products p
      on p.id = r.product_id
    group by
      p.id,
      p.name,
      p.stock,
      p.reserved_stock
    order by p.id
  loop

    update public.products
    set reserved_stock =
      reserved_stock + v_item.requested_quantity
    where id = v_item.id;

  end loop;

  return v_order;
end;
$$;

-- ============================================================
-- CONFIRM PAID ORDER
--
-- Called only after the Paynow result has been authenticated.
-- Converts reservation into an actual stock reduction.
--
-- Idempotent:
-- calling this again for an already-paid order does nothing.
-- ============================================================

create or replace function public.confirm_order_paid(
  p_order_id uuid,
  p_paynow_reference text,
  p_paynow_amount_cents integer,
  p_raw_response jsonb default '{}'::jsonb
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
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  -- Already paid: idempotent success.
  if v_order.status = 'paid'
     and v_order.payment_status = 'paid' then
    return v_order;
  end if;

  if v_order.status <> 'pending_payment' then
    raise exception
      'Order cannot be paid from status "%".',
      v_order.status;
  end if;

  if p_paynow_amount_cents is null
     or p_paynow_amount_cents <> v_order.total_cents then
    raise exception
      'Paynow amount does not match order total.';
  end if;

  if p_paynow_reference is null
     or length(trim(p_paynow_reference)) = 0 then
    raise exception 'Paynow reference is required.';
  end if;

  if exists (
    select 1
    from public.orders
    where payment_reference = trim(p_paynow_reference)
      and id <> v_order.id
  ) then
    raise exception 'Paynow reference is already attached to another order.';
  end if;

  -- ----------------------------------------------------------
  -- Lock affected products before converting reservation.
  -- ----------------------------------------------------------

  for v_product in
    select p.*
    from public.products p
    join (
      select distinct product_id
      from public.order_items
      where order_id = v_order.id
    ) oi
      on oi.product_id = p.id
    order by p.id
    for update
  loop
    null;
  end loop;

  -- ----------------------------------------------------------
  -- Convert reservation into physical stock movement.
  -- ----------------------------------------------------------

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

    if v_product.stock < v_item.quantity then
      raise exception
        'Physical stock inconsistency for product %.',
        v_product.name;
    end if;

    insert into public.stock_movements (
      product_id,
      quantity_delta,
      stock_before,
      stock_after,
      reason,
      order_id
    )
    values (
      v_product.id,
      -v_item.quantity,
      v_product.stock,
      v_product.stock - v_item.quantity,
      'sale-paynow',
      v_order.id
    );

    update public.products
    set
      stock = stock - v_item.quantity,
      reserved_stock = reserved_stock - v_item.quantity
    where id = v_product.id;

  end loop;

  -- ----------------------------------------------------------
  -- Mark order paid.
  -- ----------------------------------------------------------

  update public.orders
  set
    status = 'paid',
    payment_status = 'paid',
    payment_provider = 'paynow',
    payment_reference = trim(p_paynow_reference),
    payment_raw_response = coalesce(p_raw_response, '{}'::jsonb)
  where id = v_order.id
  returning *
  into v_order;

  return v_order;
end;
$$;

-- ============================================================
-- RELEASE ORDER RESERVATION
--
-- Called after Paynow has confirmed that a pending transaction
-- is cancelled/failed/expired.
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
begin
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  -- Idempotent release.
  if v_order.status in ('cancelled', 'payment_failed') then
    return v_order;
  end if;

  if v_order.status <> 'pending_payment' then
    raise exception
      'Only pending orders can release reservations.';
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
    set reserved_stock =
      reserved_stock - v_item.quantity
    where id = v_product.id;

  end loop;

  update public.orders
  set
    status = 'cancelled',
    payment_status = 'cancelled',
    payment_raw_response =
      coalesce(payment_raw_response, '{}'::jsonb)
      || jsonb_build_object(
        'release_reason', p_reason,
        'released_at', now()
      )
  where id = v_order.id
  returning *
  into v_order;

  return v_order;
end;
$$;

-- ============================================================
-- EXPIRED PENDING ORDERS
--
-- This function intentionally does NOT automatically release
-- orders merely because expires_at has passed.
--
-- Paynow documentation recommends polling Paynow first before
-- deleting/releasing old unpaid transactions.
-- The Vercel cleanup endpoint will perform that verification.
-- ============================================================

create or replace function public.get_expired_pending_orders(
  p_limit integer default 50
)
returns table (
  id uuid,
  order_number text,
  payment_poll_url text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.order_number,
    o.payment_poll_url,
    o.expires_at
  from public.orders o
  where o.status = 'pending_payment'
    and o.expires_at <= now()
  order by o.expires_at
  limit greatest(least(p_limit, 200), 1);
$$;

-- ============================================================
-- AVAILABLE STOCK HELPER
-- ============================================================

create or replace function public.available_stock(
  p_product_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(stock - reserved_stock, 0)
  from public.products
  where id = p_product_id;
$$;

-- ============================================================
-- SECURITY
-- ============================================================

revoke all on function public.create_pending_order(
  jsonb,
  text,
  text,
  text,
  uuid
) from public;

revoke all on function public.confirm_order_paid(
  uuid,
  text,
  integer,
  jsonb
) from public;

revoke all on function public.release_order_reservation(
  uuid,
  text
) from public;

revoke all on function public.get_expired_pending_orders(
  integer
) from public;

revoke all on function public.available_stock(
  uuid
) from public;

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

grant execute on function public.available_stock(
  uuid
) to anon, authenticated, service_role;

-- ============================================================
-- COMMENTS
-- ============================================================

comment on column public.products.reserved_stock is
  'Units reserved by pending payment orders. Available stock equals stock minus reserved_stock.';

comment on column public.orders.expires_at is
  'Reservation expiry target. Paynow must be checked before releasing an expired reservation.';

comment on function public.create_pending_order(jsonb,text,text,text,uuid) is
  'Atomically validates cart prices and availability, creates a pending order and reserves stock.';

comment on function public.confirm_order_paid(uuid,text,integer,jsonb) is
  'Atomically converts reserved inventory to a completed Paynow sale.';

comment on function public.release_order_reservation(uuid,text) is
  'Atomically releases reserved inventory after payment cancellation/failure verification.';
