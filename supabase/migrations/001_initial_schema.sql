-- ============================================================
-- PEACEMAGENTS PRODUCTION DATABASE
-- Migration 001: Core commerce schema
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

do $$
begin
  create type public.user_role as enum ('customer', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.order_status as enum (
    'pending_payment',
    'paid',
    'payment_failed',
    'cancelled',
    'fulfilled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_status as enum (
    'pending',
    'paid',
    'failed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.enquiry_status as enum (
    'open',
    'contacted',
    'sold',
    'closed'
  );
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- PROFILES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PRODUCTS
-- ============================================================

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),

  slug text not null unique,
  name text not null,
  description text,

  price_cents integer not null
    check (price_cents >= 0),

  currency text not null default 'USD'
    check (length(currency) between 3 and 3),

  category text,
  sizes text[] not null default '{}',
  tag text,

  image_url text,
  alt_text text,

  allow_direct_checkout boolean not null default true,
  active boolean not null default true,

  stock integer not null default 0
    check (stock >= 0),

  reserved_stock integer not null default 0
    check (reserved_stock >= 0),
    
  check (reserved_stock <= stock),

  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_active_sort_idx
  on public.products(active, sort_order);

create index if not exists products_category_idx
  on public.products(category);

-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null
    references public.products(id)
    on delete restrict,

  quantity_delta integer not null,
  stock_before integer not null
    check (stock_before >= 0),

  stock_after integer not null
    check (stock_after >= 0),

  reason text not null,

  order_id uuid,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists stock_movements_product_idx
  on public.stock_movements(product_id, created_at desc);

create index if not exists stock_movements_order_idx
  on public.stock_movements(order_id);

-- ============================================================
-- ORDERS
-- ============================================================

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),

  user_id uuid
    references auth.users(id)
    on delete set null,

  order_number text not null unique,

  status public.order_status not null default 'pending_payment',
  payment_status public.payment_status not null default 'pending',

  currency text not null default 'USD'
    check (length(currency) between 3 and 3),

  subtotal_cents integer not null
    check (subtotal_cents >= 0),

  total_cents integer not null
    check (total_cents >= 0),

  customer_name text,
  customer_email text,
  customer_phone text,

  payment_provider text,
  payment_reference text,
  payment_poll_url text,

  payment_raw_response jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_idx
  on public.orders(user_id, created_at desc);

create index if not exists orders_status_idx
  on public.orders(status, created_at desc);

create index if not exists orders_payment_reference_idx
  on public.orders(payment_reference);

-- ============================================================
-- ORDER ITEMS
-- ============================================================

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null
    references public.orders(id)
    on delete cascade,

  product_id uuid
    references public.products(id)
    on delete set null,

  product_name text not null,
  product_slug text,

  quantity integer not null
    check (quantity > 0),

  unit_price_cents integer not null
    check (unit_price_cents >= 0),

  line_total_cents integer not null
    check (line_total_cents >= 0),

  size text,

  created_at timestamptz not null default now()
);

create index if not exists order_items_order_idx
  on public.order_items(order_id);

create index if not exists order_items_product_idx
  on public.order_items(product_id);

-- ============================================================
-- ENQUIRIES
-- ============================================================

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),

  product_id uuid
    references public.products(id)
    on delete set null,

  product_name_snapshot text not null,

  channel text not null
    check (channel in ('whatsapp', 'email', 'phone')),

  customer_name text,
  customer_contact text,
  message text,

  user_id uuid
    references auth.users(id)
    on delete set null,

  status public.enquiry_status not null default 'open',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enquiries_status_idx
  on public.enquiries(status, created_at desc);

create index if not exists enquiries_user_idx
  on public.enquiries(user_id, created_at desc);

create index if not exists enquiries_product_idx
  on public.enquiries(product_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;

create trigger profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists products_updated_at on public.products;

create trigger products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

drop trigger if exists orders_updated_at on public.orders;

create trigger orders_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

drop trigger if exists enquiries_updated_at on public.enquiries;

create trigger enquiries_updated_at
before update on public.enquiries
for each row
execute function public.set_updated_at();

-- ============================================================
-- PROFILE CREATION
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- ============================================================
-- ROLE HELPER
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.enquiries enable row level security;

-- ============================================================
-- PROFILE POLICIES
-- ============================================================

drop policy if exists "Users can view their own profile"
  on public.profiles;

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
);

drop policy if exists "Users can update their own profile"
  on public.profiles;

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
)
with check (
  (select auth.uid()) = id
);

drop policy if exists "Admins can manage profiles"
  on public.profiles;

create policy "Admins can manage profiles"
on public.profiles
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- ============================================================
-- PRODUCT POLICIES
-- ============================================================

drop policy if exists "Anyone can view active products"
  on public.products;

create policy "Anyone can view active products"
on public.products
for select
to anon, authenticated
using (
  active = true
);

drop policy if exists "Admins can manage products"
  on public.products;

create policy "Admins can manage products"
on public.products
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- ============================================================
-- STOCK POLICIES
-- ============================================================

drop policy if exists "Admins can view stock movements"
  on public.stock_movements;

create policy "Admins can view stock movements"
on public.stock_movements
for select
to authenticated
using (
  public.is_admin()
);

drop policy if exists "Admins can create stock movements"
  on public.stock_movements;

create policy "Admins can create stock movements"
on public.stock_movements
for insert
to authenticated
with check (
  public.is_admin()
);

-- ============================================================
-- ORDER POLICIES
-- ============================================================

drop policy if exists "Users can view their own orders"
  on public.orders;

create policy "Users can view their own orders"
on public.orders
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists "Admins can manage orders"
  on public.orders;

create policy "Admins can manage orders"
on public.orders
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- ============================================================
-- ORDER ITEM POLICIES
-- ============================================================

drop policy if exists "Users can view their own order items"
  on public.order_items;

create policy "Users can view their own order items"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can manage order items"
  on public.order_items;

create policy "Admins can manage order items"
on public.order_items
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- ============================================================
-- ENQUIRY POLICIES
-- ============================================================

drop policy if exists "Users can view their own enquiries"
  on public.enquiries;

create policy "Users can view their own enquiries"
on public.enquiries
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

drop policy if exists "Users can create enquiries"
  on public.enquiries;

create policy "Users can create enquiries"
on public.enquiries
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

drop policy if exists "Admins can manage enquiries"
  on public.enquiries;

create policy "Admins can manage enquiries"
on public.enquiries
for all
to authenticated
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

-- ============================================================
-- PUBLIC ACCESS GRANTS
-- ============================================================

revoke all on table public.profiles from anon;
revoke all on table public.stock_movements from anon;
revoke all on table public.orders from anon;
revoke all on table public.order_items from anon;
revoke all on table public.enquiries from anon;

grant select on table public.products
to anon, authenticated;

grant select, update on table public.profiles
to authenticated;

grant select on table public.stock_movements
to authenticated;

grant select on table public.orders
to authenticated;

grant select on table public.order_items
to authenticated;

grant select, insert on table public.enquiries
to authenticated;

-- ============================================================
-- SERVICE ROLE
-- ============================================================

grant all on table public.profiles to service_role;
grant all on table public.products to service_role;
grant all on table public.stock_movements to service_role;
grant all on table public.orders to service_role;
grant all on table public.order_items to service_role;
grant all on table public.enquiries to service_role;

-- ============================================================
-- COMMENTS
-- ============================================================

comment on table public.products is
  'Authoritative PeaceMagents product catalogue and current stock.';

comment on table public.stock_movements is
  'Immutable inventory movement history.';

comment on table public.orders is
  'Customer orders and Paynow payment state.';

comment on table public.order_items is
  'Immutable product snapshots belonging to orders.';

comment on table public.enquiries is
  'Customer product enquiries from WhatsApp, email or phone.';

