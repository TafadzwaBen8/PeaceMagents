# PeaceMagents (formerly PEACEMAGENTS WORLDWIDE)

Same storefront as before, now with a real backend: products, stock,
orders and enquiries persist in Supabase, and checkout runs real
Paynow transactions instead of a localStorage mock.

1. **Renamed** to PeaceMagents throughout (page titles, nav, footer, admin).
2. **14 real products** in the catalogue, each with a price and live stock.
3. **Redesigned to feel like a bigger retail site** (JD Sports was the reference point) — denser product grid, a hero image carousel, category filter pills, a trust-signal strip, and a fuller footer.
4. **Real backend** — Supabase (database, auth, storage) + Paynow (checkout) + a full admin dashboard for managing products, orders and enquiries.

---

## Run it locally

This now has a real backend (Supabase + Paynow via serverless functions), so a plain static file server no longer works — `/api/*` routes need to actually execute, not just be served as files.

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Paynow keys — see below
npx vercel dev

Open http://localhost:3000.
Environment variables
Fill in .env.local with:
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — from your Supabase project's Settings → API
PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY — from your Paynow merchant account's Advanced Integration settings
CRON_SECRET — any random string, used to authenticate the reconciliation cron job
Database setup
Run every file in supabase/migrations/, in numeric order (001 through 008), in your Supabase project's SQL Editor.
Known limitation of local testing
Paynow's payment-confirmation callback (api/paynow/callback.js) needs a public URL — it can't reach localhost. Order creation and the Paynow redirect can be fully tested locally; confirming a payment actually completes end-to-end requires a real deployment (Vercel).
About the JD Sports reference
I matched the structure and polish JD Sports uses — a sticky header,
a rotating hero banner, category filter pills above the product grid,
a denser multi-column grid, a trust-signal strip, and a multi-column
footer — because that's what makes a small shop feel like a serious
retail operation for a pitch.
I did not copy JD Sports' actual logo, colors, or copyrighted
photography — that would be their IP, not something to put in your
pitch deck. PeaceMagents keeps its own black/cream/green identity
throughout; only the layout patterns are borrowed.
Managing products
Products are managed entirely through admin.html now — add, edit,
publish/unpublish, upload images and adjust stock, all live against
Supabase. See "Run it locally" above to get an admin session set up
(you'll need a user in Supabase Auth with role = 'admin' in the
profiles table).
What's new in the design
Hero carousel — 3 auto-advancing slides (campaign shot, pool
shot, in-store rack), with dot navigation. Uses your campaign
poster image as the opening slide.
Category filter pills — All / New / Tees / Caps, generated
automatically from whatever categories exist in the live product data
— add a "hoodies" product later and a Hoodies pill appears on its own.
Denser grid — more columns on wide screens, a subtle image
zoom on hover.
Trust strip — "Order on WhatsApp / Pickup in Harare / Ships
Worldwide" — swap this copy for whatever's actually true for you in
index.html.
Utility strip — a scrolling line above the header (worldwide
shipping / WhatsApp orders / new drops), similar in spirit to a
retailer's top banner.
Fuller footer — shop links, brand links, contact links, and a
bottom bar — instead of the single simple line from before.
Add to Bag, the cart panel, real Paynow checkout, Enquire via
WhatsApp/email/call, and the full admin.html dashboard (production
admin access uses Supabase Auth — no local passcode) all work against
the live backend.
Before you deploy
Replace the placeholder SELLER contact details in js/config.js
with the real WhatsApp number, email, and phone.
Double check product prices — some are placeholders in the same
range as the original catalogue, not confirmed pricing.
The backend step is done — products, orders, stock and enquiries
now persist in Supabase, and checkout goes through real Paynow
transactions. See "Run it locally" above for setup.

Save, then:

git diff --stat README-LOCAL-TESTING.md
git add README-LOCAL-TESTING.md
git commit -m "Update local testing docs for the Supabase/Paynow backend"
git push

