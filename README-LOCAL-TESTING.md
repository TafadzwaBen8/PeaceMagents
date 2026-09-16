# PeaceMagents (formerly PEACEMAGENTS WORLDWIDE) — local build

Same working prototype as before — no backend, no server, everything
runs in your browser via `localStorage` — but with three changes:

1. **Renamed** to PeaceMagents throughout (page titles, nav, footer, admin).
2. **8 new real products** added from your photos, each with a price and starting stock.
3. **Redesigned to feel like a bigger retail site** (JD Sports was the reference point) — denser product grid, a hero image carousel, category filter pills, a trust-signal strip, and a fuller footer.

---

## Run it locally

```bash
cd PeaceMagents
python3 -m http.server 5500
```

Open **http://localhost:5500**. (ES modules block `file://`, so it needs a local server — `npx serve .` works too.)

---

## About the JD Sports reference

I matched the *structure and polish* JD Sports uses — a sticky header,
a rotating hero banner, category filter pills above the product grid,
a denser multi-column grid, a trust-signal strip, and a multi-column
footer — because that's what makes a small shop feel like a serious
retail operation for a pitch.

I did **not** copy JD Sports' actual logo, colors, or copyrighted
photography — that would be their IP, not something to put in your
pitch deck. PeaceMagents keeps its own black/cream/green identity
throughout; only the layout patterns are borrowed.

---

## New products added (with placeholder prices — edit freely)

| Product | Price | Category |
|---|---|---|
| Orbit Logo Tee — Bone | $32 | Tees |
| Street Alert Tee — Black | $38 | Tees |
| Resilient Manifesto Tee — Bone | $34 | Tees |
| Resilient Manifesto Tee — Charcoal Wash | $34 | Tees |
| Wanted Mugshot Tee | $40 | Tees |
| Go Crazy Tee | $36 | Tees |
| Worldwide Mascot Tee | $40 | Tees |
| Wing Logo Fuzzy Cap | $30 | Caps |

That's 14 products total in the shop now (6 from before + these 8).
Change any price or starting stock in `js/products-data.js`, or after
the site is running, in `admin.html`.

### Three images from your upload aren't on the site

Out of your 25 photos, 22 are in use (11 were already part of the
previous build, and these new 8 products draw from the rest). Three
didn't make the cut:

- One was an unrelated screenshot (a trading app) that isn't product photography.
- One was behind-the-scenes photography for a different brand ("Guave"), not PeaceMagents.
- One t-shirt design's back print includes sexually suggestive text and imagery, which isn't something I put on a storefront. Everything else from that photo set is included — if you want that specific design on the site yourself, you can add it the same way any product gets added, through `js/products-data.js` or the admin panel.

---

## What's new in the design

- **Hero carousel** — 3 auto-advancing slides (campaign shot, pool
  shot, in-store rack), with dot navigation. Uses your campaign
  poster image as the opening slide.
- **Category filter pills** — All / New / Tees / Caps, generated
  automatically from whatever categories exist in your product data
  — add a "hoodies" product later and a Hoodies pill appears on its own.
- **Denser grid** — more columns on wide screens, a subtle image
  zoom on hover.
- **Trust strip** — "Order on WhatsApp / Pickup in Harare / Ships
  Worldwide" — swap this copy for whatever's actually true for you in
  `index.html`.
- **Utility strip** — a scrolling line above the header (worldwide
  shipping / WhatsApp orders / new drops), similar in spirit to a
  retailer's top banner.
- **Fuller footer** — shop links, brand links, contact links, and a
  bottom bar — instead of the single simple line from before.

Everything from the previous build still works exactly the same:
Add to Bag, the cart panel, mock checkout with live stock updates,
Enquire via WhatsApp/email/call, and the full `admin.html` dashboard
(passcode `peacemagents-admin`) for logging new stock, adding
products, and tracking sales/enquiries.

---

## Before you pitch or deploy

- Replace the placeholder `SELLER` contact details in `js/config.js`
  with the real WhatsApp number, email, and phone.
- Double check the 8 new prices — these are placeholders in the same
  range as your existing catalog, not confirmed pricing.
- Everything still runs on `localStorage` — fine for a local pitch
  demo on your own laptop, but the backend step (Supabase/Stripe, per
  `HYBRID-PROJECT-PLAN.md`) is still what makes stock and orders
  persist for real customers.
