/**
 * DATA STORE
 * ============================================================
 * Products are read live from Supabase (public anon key, RLS-scoped
 * to active products only). Checkout and enquiries hit the real
 * backend (/api/checkout, /api/enquiries). The cart itself stays in
 * localStorage — that's pre-checkout client state, not the order of
 * record, so it doesn't need a server round trip to manage.
 *
 * main.js and admin.js never touch localStorage or Supabase
 * directly for products/orders — only this file does.
 */

const CART_KEY = "pm_cart";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ============================================================
   SUPABASE CLIENT (lazy, cached)
============================================================ */

let supabaseClientPromise = null;

async function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = (async () => {
      const response = await fetch("/api/config");
      const config = await response.json();

      if (!response.ok || !config.ok) {
        throw new Error(config.error || "Unable to load app configuration.");
      }

      const { createClient } = await import(
        "https://esm.sh/@supabase/supabase-js@2.116.0"
      );

      return createClient(config.supabaseUrl, config.supabaseAnonKey);
    })();
  }

  return supabaseClientPromise;
}

/* ============================================================
   PRODUCTS — live from Supabase, cached in memory per page load
============================================================ */

let productsCache = [];

function mapProductRow(row) {
  return {
    id: row.slug,
    slug: row.slug,
    name: row.name,
    description: row.description,
    price: row.price_cents / 100,
    currency: row.currency,
    category: row.category,
    sizes: row.sizes || [],
    tag: row.tag,
    image: row.image_url,
    alt: row.alt_text,
    allowDirectCheckout: row.allow_direct_checkout,
    active: row.active,
    // Available stock, not gross stock — mirrors what the checkout
    // RPC actually enforces (stock minus other pending reservations).
    stock: Math.max((row.stock ?? 0) - (row.reserved_stock ?? 0), 0),
  };
}

export async function loadProducts() {
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from("products")
    .select(
      "slug, name, description, price_cents, currency, category, sizes, tag, image_url, alt_text, allow_direct_checkout, active, stock, reserved_stock, sort_order"
    )
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  productsCache = (data || []).map(mapProductRow);
  return productsCache;
}

export function getProducts() {
  return productsCache;
}

export function getProduct(id) {
  return productsCache.find((p) => p.id === id) || null;
}

/* ============================================================
   CART — local, pre-checkout only
============================================================ */

export function getCart() {
  return read(CART_KEY, {});
}

export function saveCart(cart) {
  write(CART_KEY, cart);
}

export function addToCart(productId, qty = 1) {
  const cart = getCart();
  cart[productId] = (cart[productId] || 0) + qty;
  saveCart(cart);
  return cart;
}

export function setCartQty(productId, qty) {
  const cart = getCart();
  if (qty <= 0) {
    delete cart[productId];
  } else {
    cart[productId] = qty;
  }
  saveCart(cart);
  return cart;
}

export function removeFromCart(productId) {
  return setCartQty(productId, 0);
}

export function clearCart() {
  saveCart({});
}

export function cartItemCount() {
  return Object.values(getCart()).reduce((sum, qty) => sum + qty, 0);
}

/* ============================================================
   CHECKOUT — real Paynow flow via /api/checkout
============================================================ */

/**
 * Creates a pending order + Paynow transaction on the server, then
 * returns the Paynow browserUrl to redirect the shopper to. Does
 * NOT redirect itself — main.js decides when/how to navigate.
 */
export async function checkout({ customerName, customerEmail, customerPhone }) {
  const cart = getCart();
  const items = Object.entries(cart).map(([slug, quantity]) => ({
    slug,
    quantity: Number(quantity),
    size: null,
  }));

  if (!items.length) {
    return { ok: false, error: "Your bag is empty." };
  }

  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, customerName, customerEmail, customerPhone }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || "Checkout could not be completed." };
    }

    clearCart();
    return { ok: true, browserUrl: data.browserUrl, orderNumber: data.orderNumber };
  } catch (error) {
    console.error("Checkout request failed:", error);
    return { ok: false, error: "Could not reach checkout — check your connection and try again." };
  }
}

/* ============================================================
   ENQUIRIES — logged server-side via /api/enquiries
============================================================ */

export async function recordEnquiry({ productId, productName, channel }) {
  try {
    const response = await fetch("/api/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productSlug: productId,
        productName,
        channel: channel === "call" ? "phone" : channel,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error("Enquiry logging failed:", data.error);
    }

    return data;
  } catch (error) {
    console.error("Enquiry request failed:", error);
    return { ok: false, error: "Could not log the enquiry." };
  }
}
