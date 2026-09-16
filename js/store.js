/**
 * LOCAL DATA STORE
 * ============================================================
 * Everything here is backed by the browser's localStorage, so the
 * whole site — products, stock levels, cart, sales log, enquiries —
 * works fully offline with zero backend, for local testing.
 *
 * WHEN THE BACKEND IS READY: swap the inside of each function for a
 * fetch() call to your API (see HYBRID-PROJECT-PLAN.md). Don't
 * change the function names or what they return — main.js and
 * admin.js only ever call these functions, never localStorage
 * directly, so the swap happens in exactly one file.
 */

import { PRODUCTS as SEED_PRODUCTS } from "./products-data.js";

const PRODUCTS_KEY = "pm_products";
const CART_KEY = "pm_cart";
const SALES_KEY = "pm_sales_log";
const ENQUIRIES_KEY = "pm_enquiries_log";
const STOCK_LOG_KEY = "pm_stock_log";

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
    // Storage unavailable (private browsing, quota, etc) — the site
    // still works, changes just won't persist across a reload.
    return false;
  }
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ============================================================
   PRODUCTS / STOCK
============================================================ */

function ensureSeeded() {
  if (read(PRODUCTS_KEY, null) === null) {
    write(PRODUCTS_KEY, SEED_PRODUCTS);
  }
}

export function getProducts() {
  ensureSeeded();
  return read(PRODUCTS_KEY, SEED_PRODUCTS);
}

export function getProduct(id) {
  return getProducts().find((p) => p.id === id) || null;
}

export function saveProducts(products) {
  return write(PRODUCTS_KEY, products);
}

export function addProduct(product) {
  const products = getProducts();

  if (products.some((p) => p.id === product.id)) {
    throw new Error(`A product with id "${product.id}" already exists.`);
  }

  products.push(product);
  saveProducts(products);
  return product;
}

export function updateProduct(id, changes) {
  const products = getProducts();
  const product = products.find((p) => p.id === id);
  if (!product) return null;
  Object.assign(product, changes);
  saveProducts(products);
  return product;
}

/**
 * Adjust stock by a positive (restock) or negative (sale/correction)
 * amount. Never lets stock go below zero. Every change is written to
 * the stock log so you have a paper trail of what came in and went out.
 */
export function adjustStock(productId, delta, reason = "adjustment") {
  const products = getProducts();
  const product = products.find((p) => p.id === productId);
  if (!product) return null;

  const before = product.stock ?? 0;
  product.stock = Math.max(0, before + delta);
  saveProducts(products);

  const log = read(STOCK_LOG_KEY, []);
  log.unshift({
    id: newId("stock"),
    productId,
    productName: product.name,
    delta,
    before,
    after: product.stock,
    reason, // 'restock' | 'sale-checkout' | 'sale-enquiry' | 'adjustment'
    at: new Date().toISOString(),
  });
  write(STOCK_LOG_KEY, log.slice(0, 500));

  return product;
}

export function getStockLog() {
  return read(STOCK_LOG_KEY, []);
}

export function resetDemoData() {
  write(PRODUCTS_KEY, SEED_PRODUCTS);
  write(CART_KEY, {});
  write(SALES_KEY, []);
  write(ENQUIRIES_KEY, []);
  write(STOCK_LOG_KEY, []);
}

/* ============================================================
   SALES
============================================================ */

/**
 * Records a sale AND decrements stock in one step. `source` is
 * 'checkout' (self-serve bag) or 'enquiry' (seller closed a deal
 * that started as a WhatsApp/email/call enquiry).
 */
export function recordSale({ productId, quantity, source, channel = null }) {
  const product = getProduct(productId);
  if (!product) return null;

  adjustStock(productId, -quantity, source === "checkout" ? "sale-checkout" : "sale-enquiry");

  const sales = read(SALES_KEY, []);
  const sale = {
    id: newId("sale"),
    productId,
    productName: product.name,
    quantity,
    unitPrice: product.price,
    total: product.price * quantity,
    source,
    channel,
    at: new Date().toISOString(),
  };
  sales.unshift(sale);
  write(SALES_KEY, sales);
  return sale;
}

export function getSales() {
  return read(SALES_KEY, []);
}

/* ============================================================
   ENQUIRIES
============================================================ */

export function recordEnquiry({ productId, productName, channel }) {
  const enquiries = read(ENQUIRIES_KEY, []);
  const enquiry = {
    id: newId("enq"),
    productId,
    productName,
    channel, // 'whatsapp' | 'email' | 'call'
    status: "open", // 'open' | 'sold'
    at: new Date().toISOString(),
  };
  enquiries.unshift(enquiry);
  write(ENQUIRIES_KEY, enquiries);
  return enquiry;
}

export function getEnquiries() {
  return read(ENQUIRIES_KEY, []);
}

/** Called from the admin page once a WhatsApp/email/call conversation turns into an actual sale. */
export function markEnquirySold(enquiryId, quantity = 1) {
  const enquiries = read(ENQUIRIES_KEY, []);
  const enquiry = enquiries.find((e) => e.id === enquiryId);
  if (!enquiry) return null;

  const sale = recordSale({
    productId: enquiry.productId,
    quantity,
    source: "enquiry",
    channel: enquiry.channel,
  });

  if (sale) {
    enquiry.status = "sold";
    write(ENQUIRIES_KEY, enquiries);
  }

  return sale;
}

/* ============================================================
   CART
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

/**
 * Stands in for real Stripe checkout until the backend step. Checks
 * stock is actually available, records a sale per line item (which
 * decrements stock), and empties the cart. Returns { ok, error } or
 * { ok, sales }.
 */
export function completeMockCheckout() {
  const cart = getCart();
  const entries = Object.entries(cart);

  if (!entries.length) {
    return { ok: false, error: "Your bag is empty." };
  }

  for (const [productId, qty] of entries) {
    const product = getProduct(productId);
    if (!product) {
      return { ok: false, error: "One of the items in your bag no longer exists." };
    }
    if ((product.stock ?? 0) < qty) {
      return {
        ok: false,
        error: `Only ${product.stock} of "${product.name}" left — lower the quantity in your bag.`,
      };
    }
  }

  const sales = entries.map(([productId, qty]) =>
    recordSale({ productId, quantity: qty, source: "checkout" })
  );

  clearCart();
  return { ok: true, sales };
}
