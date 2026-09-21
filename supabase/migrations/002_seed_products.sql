-- ============================================================
-- PEACEMAGENTS PRODUCTION DATABASE
-- Migration 002: Initial product catalogue
-- Generated from js/products-data.js
-- ============================================================

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
  sort_order
) values
  ('worldwide-jersey', 'Worldwide No.10 Jersey', 'Football-cut jersey in black and bone, hand-tagged with the PeaceMagents crest and a raglan No.10 back print.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], 'New', 'assets/shop/worldwide-jersey.jpg', 'Black PeaceMagents Worldwide No.10 football-style jersey, front and back', true, true, 12, 0),
  ('sage-graphic-tee', 'Sage Wash Graphic Tee', 'Garment-washed heavyweight cotton with a hand-drawn back graphic and a quiet chest line: creativity reflects the nature of god.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], null, 'assets/shop/sage-graphic-tee.jpg', 'Sage green washed t-shirt with a brown and red PEACE MAGENTS hand-drawn print', true, true, 8, 1),
  ('camo-snapback', 'PM Camo Snapback', 'Structured camo snapback with an embroidered wordmark and the PM wing pin on the side panel.', 500, 'USD', 'caps', array['One size']::text[], null, 'assets/shop/camo-snapback.jpg', 'Camouflage snapback cap embroidered with the PeaceMagents wordmark and wing logo', true, true, 15, 2),
  ('orbit-logo-tee', 'Orbit Logo Tee — Black', 'Clean black tee, small chest hit up front, full-back Pm orbit mark for anyone who lets the logo do the talking.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], null, 'assets/shop/orbit-logo-tee.jpg', 'Black t-shirt with a small chest logo and large back print of the Pm orbit mark', true, true, 2, 3),
  ('orbit-logo-tee-bone', 'Orbit Logo Tee — Bone', 'Same Pm orbit mark front and back, in a warmer bone colorway for anyone who wants the logo tee without going full black.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], 'New', 'assets/shop/orbit-logo-tee-bone.jpg', 'Bone/cream t-shirt with a small chest logo and large back print of the Pm orbit mark', true, true, 6, 4),
  ('chrome-claw-tee', 'Chrome Claw Tee', 'Oversized black tee with a chrome PM mark reaching up from a red-clawed hand print, placed low on the back. Limited run — enquire to confirm sizing before it''s gone.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], 'Limited', 'assets/shop/chrome-claw-tee.jpg', 'Black t-shirt with a chrome PM logo and red clawed hand graphic on the lower back', false, true, 4, 5),
  ('camo-raglan', 'Camo Sleeve Raglan', 'White-body raglan with camo sleeves and a graffiti-tag logo up front — a target mark watching the whole thing.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], null, 'assets/shop/camo-raglan.jpg', 'White long-sleeve raglan with camouflage sleeves and a graffiti-style Magents logo', true, true, 0, 6),
  ('street-alert-tee-black', 'Street Alert Tee — Black', 'Black heavyweight tee, full-back comic-style print — a PeaceMagents character caught mid-reach next to a lit-up exclamation mark.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], 'New', 'assets/shop/street-alert-tee-black.jpg', 'Black t-shirt with a green PEACE MAGENTS back print of a character reaching toward a glowing rock with an exclamation mark', true, true, 6, 7),
  ('resilient-manifesto-tee-bone', 'Resilient Manifesto Tee — Bone', 'Stay resilient even through the dark times. Break through whatever comes in your path. We''re stronger when we rise above it — printed in full on the chest.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], 'New', 'assets/shop/resilient-manifesto-tee-bone.jpg', 'Bone colored t-shirt with green PEACEMAGENT wordmark and a short manifesto printed below it', true, true, 8, 8),
  ('resilient-manifesto-tee-charcoal', 'Resilient Manifesto Tee — Charcoal Wash', 'Same manifesto print as the Bone colorway, on a marbled charcoal wash for a heavier, worn-in look.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], 'New', 'assets/shop/resilient-manifesto-tee-charcoal.jpg', 'Charcoal acid-wash t-shirt with green PeaceMagents wordmark and a short manifesto printed below it', true, true, 5, 9),
  ('wanted-mugshot-tee', 'Wanted Mugshot Tee', 'Small 和平 Magents chest hit, full mugshot-poster back print — "Wanted by Police" height chart and all.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], 'New', 'assets/shop/wanted-mugshot-tee.jpg', 'White t-shirt with a small kanji and Magents chest logo, and a large Wanted By Police mugshot-style back print', true, true, 9, 10),
  ('go-crazy-tee', 'Go Crazy Tee', 'Black tee, purple smoke lettering, a character posted up against the car — for the ones who go crazy quietly.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], null, 'assets/shop/go-crazy-tee.jpg', 'Black t-shirt with a purple smoke Go Crazy graphic and a character leaning on a car', true, true, 7, 11),
  ('worldwide-mascot-tee', 'Worldwide Mascot Tee', 'Small 和平 Magents chest hit, big back print of the PeaceMagents mascot dabbing on top of the world — one mindset, no borders, worn on your back.', 1500, 'USD', 'tees', array['S', 'M', 'L', 'XL']::text[], 'New', 'assets/shop/worldwide-mascot-tee.jpg', 'White t-shirt with a small kanji and Magents chest logo, and a large back print of a mascot dabbing on top of the globe', true, true, 10, 12),
  ('wing-logo-fuzzy-cap', 'Wing Logo Fuzzy Cap', 'Fuzzy black cap with a winged side patch and embroidered 和平 Magents script across the front.', 500, 'USD', 'caps', array['One size']::text[], 'New', 'assets/shop/wing-logo-fuzzy-cap.jpg', 'Black fuzzy cap with a wing graphic and embroidered 和平 Magents logo', true, true, 10, 13)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  category = excluded.category,
  sizes = excluded.sizes,
  tag = excluded.tag,
  image_url = excluded.image_url,
  alt_text = excluded.alt_text,
  allow_direct_checkout = excluded.allow_direct_checkout,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();
