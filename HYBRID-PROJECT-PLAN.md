# PEACEMAGENTS WORLDWIDE — Hybrid Storefront Project Plan

## The idea

We now have two working directions:

1. **The e-commerce build** (what we did in this chat): real cart, Supabase
   Auth accounts, Paynow checkout, order history, admin dashboard.
2. **The storefront rebuild** : real product photography,
   a cleaner light/dark design, and a "no cart, message the seller"
   enquiry flow (WhatsApp / email / call), backed by a separate Express +
   lowdb API.

Neither fully beats the other — they serve different shoppers:

- Some people want to **tap, pay, done**. That's the cart/Paynow flow.
- Some people want to **ask a question first** — sizing, customization,
  bulk order, "is this still in stock" — before committing. That's chat
  commerce, and it's a normal, often *preferred* way to buy from a small
  streetwear brand, especially in markets where WhatsApp is the default
  way people already do business.

**The hybrid: every product gets two calls to action — "Add to Bag" and
"Enquire" — instead of forcing everyone down one path.** You keep the
self-serve sale AND the relationship-based sale, and you capture both as
leads/orders in one place instead of losing the WhatsApp conversations to
a channel you can't see.

This also simplifies our hosting story: instead of running two backends
(Supabase+Paynow on Vercel, and a separate Express/lowdb API on
Render/Railway), everything lives in Supabase + Vercel. One place to
deploy, one place to check on orders and enquiries.

---

## Architecture

```
Browser (single storefront, light/dark theme, real product photos)
│
├─ Products: read directly from Supabase (public anon key, read-only RLS)
│
├─ "Add to Bag" path
│   └─ Cart panel (localStorage) → /api/create-checkout-session
│       → Paynow Checkout → /api/webhook → orders + order_items tables
│
├─ "Enquire" path
│   └─ Modal opens WhatsApp / email / call links (prefilled with item + price)
│       AND fires a background POST to /api/enquiries
│       → enquiries table (so you have a record even if they only message you on WhatsApp)
│
├─ Account panel (Supabase Auth)
│   └─ Order History (paid orders) + Enquiry History (their own logged enquiries)
│
└─ Newsletter + Contact forms → /api/newsletter, /api/contact (unchanged from before)

/admin.html (password-gated)
└─ One dashboard: Orders tab + Enquiries tab, both sortable by date
```

**Dropped entirely:** the separate `peacemagents-api` (Express + lowdb).
Its only two jobs — serving products and logging enquiries — both move
into the Supabase/Vercel stack, so there's nothing left for it to do.
That also sidesteps its biggest limitation: lowdb writes to a local JSON
file, which doesn't survive on Vercel's serverless functions and would
have needed a separate always-on host (Render/Railway) just for that.

---

## Data model (Supabase / Postgres)

### `products` — extended with the richer fields

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  price_cents integer not null,
  currency text not null default 'usd',
  category text,                    -- 'tees' | 'hoodies' | 'caps' | etc, for filtering/admin defaults only
  sizes text[] not null default '{}',
  tag text,                         -- 'New' | 'Limited' | null
  image_url text not null,
  alt_text text,
  allow_direct_checkout boolean not null default true,  -- see "Open decisions" below
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table products enable row level security;
create policy "Public read active products" on products for select using (active = true);
```

Note: `price_cents` is the **authoritative, per-item price** — not
derived from category. The API priced by category ($15 flat for
every "tee"), which silently conflicts with `products-data.js`'s real
per-item prices (Jersey $15, Sage Tee $15, etc.). Category stays around
only as a label/filter and as a suggested default when adding a new
product in the admin — it should never override a price someone typed in.

### `orders` + `order_items` — unchanged from the checkout build

(See `STEP3-4-5-SETUP.md` from earlier — same schema.)

### `enquiries` — new

```sql
create table enquiries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id),
  product_name_snapshot text,
  channel text not null,            -- 'whatsapp' | 'email' | 'call'
  customer_name text,
  customer_contact text,            -- email or phone, whatever they gave
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table enquiries enable row level security;
create policy "Users can view their own enquiries" on enquiries
  for select using (auth.uid() = user_id);
```

Same pattern as orders: no public insert policy — only your serverless
function (service role key) writes rows.

### `newsletter_subscribers`, `contact_messages` — unchanged from Step 1

---

## Page / UI plan

**Shop grid** (adopt the zip's visual design — real photography, light/dark
toggle, product cards) — each card gets:
- Photo, name, price, size list, tag badge if present
- **Two buttons**: `Add to Bag` (primary) and `Enquire` (secondary/outline)

**Cart panel** — exactly what we built: quantities, remove, subtotal, Paynow
checkout. Unchanged.

**Enquire modal** — port thIS version as-is (WhatsApp/email/call links,
prefilled message) — just add one line to the button handlers: fire a
`POST /api/enquiries` alongside opening the link, so it's logged even if
the shopper only ever clicks through to WhatsApp.

**Account panel** — sign in/up (already built) — add a second list below
Order History: **Enquiry History**, pulled from the `enquiries` table.

**Admin dashboard** — extend `admin.html`/`admin-orders.js` into two tabs
or a combined, filterable table: Orders | Enquiries.

---

## API endpoints (all Vercel serverless functions)

| Endpoint | Status | Notes |
|---|---|---|
| Products | — | Read directly from Supabase client-side (no endpoint needed) |
| `POST /api/newsletter` | Reuse as-is | From Step 1 |
| `POST /api/contact` | Reuse as-is | From Step 1 |
| `POST /api/enquiries` | **New** | Logs product id, channel, optional name/contact, optional user_id |
| `POST /api/create-checkout-session` | Reuse as-is | From Step 4 |
| `POST /api/webhook` | Reuse as-is | From Step 5 |
| `GET /api/admin-data` | **Extend** `admin-orders.js` | Return `{ orders, enquiries }` together |

---

## Config

`js/config.js` (keep the zip's pattern):
```js
export const SELLER = {
  whatsappNumber: "…",   // real number, digits only
  email: "…",
  phone: "…",
  instagram: "…",
};
```

Vercel environment variables (all from the previous setup guides, nothing new):
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYNOW_INTEGRATION_KEY`,
`PAYNOW_RESULT_URL`, `ADMIN_SECRET`

---

## Build order

1. **Design migration** — bring in the `css/styles.css`, light/dark
   theme toggle, and `assets/` photography. Retire the 3-way Editorial/
   Raw/Futuristic switcher.
2. **Products table** — create it with the extended schema above; seed it
   with the 6 real products from `products-data.js` (real prices, not
   category defaults).
3. **Product cards** — rebuild with the dual `Add to Bag` / `Enquire`
   buttons.
4. **Enquire modal** — port from the zip; wire the extra logging call.
5. **`enquiries` table + `/api/enquiries`** — new, small, same shape as
   `contact.js`.
6. **Cart, checkout, webhook, orders** — carry over unchanged from Steps
   3–5.
7. **Account panel** — add Enquiry History alongside Order History.
8. **Admin dashboard** — extend to show both orders and enquiries.
9. **Retire `peacemagents-api`** — nothing left for it to do once
   enquiries live in Supabase.

---

## What to reuse verbatim from each source

**From the zip:**
- `css/styles.css` and the light/dark theme
- `assets/` — all real product photography
- The Enquire modal's HTML/JS pattern (link-building for WhatsApp/email/call)
- `config.js`'s `SELLER` pattern
- `products-data.js` content — as seed data for the Supabase table, not as the live source

**From the checkout build:**
- Cart panel, `create-checkout-session.js`, `webhook.js`
- Admin secret-gate pattern
- `newsletter.js`, `contact.js`
- Supabase Auth account panel

**Drop entirely:**
- `peacemagents-api` (Express/lowdb) — folded into Supabase
- The 3-theme switcher — replaced by light/dark
- Category-based pricing as an override — keep it as a suggestion only

---

## Open decisions — confirm before/while building

1. **Sizes**: free-text list shown on the card, or a required selector
   before either `Add to Bag` or `Enquire` can be used? (Needed for real
   fulfillment either way.)
2. **Enquiry friction**: should clicking `Enquire` ask for name/contact in
   a small form first (better lead capture for your `enquiries` table), or
   stay frictionless like the zip today (straight to WhatsApp/email/call,
   nothing captured unless they message you)?
3. **Per-product checkout toggle**: do you want some products — one-offs,
   custom pieces, made-to-order — to hide `Add to Bag` entirely and force
   `Enquire`? (`allow_direct_checkout` in the schema above is there for
   this if you want it.)
