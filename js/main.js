import { SELLER, LOW_STOCK_THRESHOLD } from "./config.js";
import * as store from "./store.js";

/* ============================================================
   THEME — light / dark, remembered per visitor
============================================================ */
const THEME_KEY = "peacemagents-theme";
const root = document.documentElement;
const themeToggle = document.querySelector("[data-theme-toggle]");

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  if (themeToggle) themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* not fatal — theme just won't persist */
  }
}

function initTheme() {
  const stored = getStoredTheme();
  if (stored === "light" || stored === "dark") {
    applyTheme(stored);
    return;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

themeToggle?.addEventListener("click", () => {
  const current = root.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});

initTheme();

/* ============================================================
   HERO CAROUSEL — auto-advancing, with dot navigation
============================================================ */
const carousel = document.querySelector("[data-hero-carousel]");
const slides = Array.from(document.querySelectorAll("[data-hero-slide]"));
const dotsWrap = document.querySelector("[data-hero-dots]");
let activeSlide = 0;
let carouselTimer = null;

function goToSlide(index) {
  slides[activeSlide]?.classList.remove("active");
  dotsWrap?.children[activeSlide]?.classList.remove("active");
  activeSlide = (index + slides.length) % slides.length;
  slides[activeSlide]?.classList.add("active");
  dotsWrap?.children[activeSlide]?.classList.add("active");
}

function startCarousel() {
  clearInterval(carouselTimer);
  carouselTimer = setInterval(() => goToSlide(activeSlide + 1), 6000);
}

if (carousel && slides.length > 1) {
  slides.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "hero-carousel__dot" + (i === 0 ? " active" : "");
    dot.setAttribute("aria-label", `Show slide ${i + 1}`);
    dot.addEventListener("click", () => {
      goToSlide(i);
      startCarousel();
    });
    dotsWrap?.appendChild(dot);
  });
  startCarousel();
}

/* ============================================================
   PRODUCT RENDERING — from the local store (stock-aware)
============================================================ */
const grid = document.querySelector("[data-shop-grid]");
const shopStatus = document.querySelector("[data-shop-status]");
const filtersWrap = document.querySelector("[data-category-filters]");
let activeCategory = "all";

const CATEGORY_LABELS = {
  all: "All",
  new: "New",
  tees: "Tees",
  hoodies: "Hoodies",
  bottoms: "Bottoms",
  tracksuits: "Tracksuits",
  caps: "Caps",
  windbreakers: "Windbreaker Jackets",
};

function formatPrice(product) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency || "USD",
    maximumFractionDigits: 0,
  }).format(product.price);
}

function stockBadge(product) {
  const stock = product.stock ?? 0;
  if (stock <= 0) return `<span class="stock-badge stock-badge--out">Sold out</span>`;
  if (stock <= LOW_STOCK_THRESHOLD) {
    return `<span class="stock-badge stock-badge--low">Only ${stock} left</span>`;
  }
  return "";
}

function productCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";

  const soldOut = (product.stock ?? 0) <= 0;
  const canCheckout = product.allowDirectCheckout !== false;

  card.innerHTML = `
    <div class="product-card__frame ${soldOut ? "is-sold-out" : ""}">
      <img src="${product.image}" alt="${product.alt}" loading="lazy" />
      ${product.tag ? `<span class="product-card__tag">${product.tag}</span>` : ""}
      ${stockBadge(product)}
    </div>
    <div class="product-card__body">
      <div class="product-card__row">
        <h3>${product.name}</h3>
        <span class="product-card__price">${formatPrice(product)}</span>
      </div>
      <p class="product-card__sizes">${product.sizes.join(" · ")}</p>
      <div class="product-card__actions">
        ${
          canCheckout
            ? `<button type="button" class="btn btn--bag" data-add-to-bag="${product.id}" ${soldOut ? "disabled" : ""}>
                ${soldOut ? "Sold out" : "Add to bag"}
              </button>`
            : ""
        }
        <button type="button" class="btn btn--enquire" data-enquire="${product.id}">
          Enquire ${canCheckout ? "instead" : "to buy"}
        </button>
      </div>
    </div>
  `;

  return card;
}

function renderFilters(products) {
  if (!filtersWrap) return;

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
  const options = ["all", "new", ...categories];

  filtersWrap.innerHTML = options
    .map((key) => {
      const label = CATEGORY_LABELS[key] || key;
      return `<button type="button" class="category-filter ${key === activeCategory ? "active" : ""}" data-filter="${key}">${label}</button>`;
    })
    .join("");

  filtersWrap.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.filter;
      renderShop();
    });
  });
}

function renderShop() {
  if (!grid) return;

  try {
    const allProducts = store.getProducts().filter((p) => p.active !== false);
    renderFilters(allProducts);

    const visible = allProducts.filter((p) => {
      if (activeCategory === "all") return true;
      if (activeCategory === "new") return p.tag === "New";
      return p.category === activeCategory;
    });

    grid.innerHTML = "";

    if (!visible.length) {
      grid.innerHTML = `<p class="muted">Nothing in this category right now — check back soon.</p>`;
    } else {
      visible.forEach((product) => grid.appendChild(productCard(product)));
    }

    if (shopStatus) shopStatus.textContent = "";

    grid.querySelectorAll("[data-add-to-bag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        store.addToCart(btn.dataset.addToBag, 1);
        updateBagCount();
      });
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Something went wrong loading the shop.";
    if (shopStatus) shopStatus.textContent = `${reason} — reach us on WhatsApp in the meantime.`;
    console.error("Shop render failed:", reason);
  }
}

renderShop();

/* ============================================================
   ENQUIRE MODAL — WhatsApp / email / call, and logs the enquiry
============================================================ */
const modal = document.querySelector("[data-enquire-modal]");
const modalBody = document.querySelector("[data-enquire-body]");
const modalClose = document.querySelector("[data-enquire-close]");
let lastFocused = null;

function buildLinks(product) {
  const message = `Hi PeaceMagents, I'd like to order the ${product.name} (${formatPrice(product)}).`;
  const whatsappUrl = `https://wa.me/${SELLER.whatsappNumber}?text=${encodeURIComponent(message)}`;
  const mailUrl = `mailto:${SELLER.email}?subject=${encodeURIComponent(
    `Order enquiry: ${product.name}`
  )}&body=${encodeURIComponent(message)}`;
  const telUrl = `tel:${SELLER.phone}`;
  return { whatsappUrl, mailUrl, telUrl };
}

function openEnquireModal(productId) {
  const product = store.getProduct(productId) ?? { id: productId, name: productId, price: 0, currency: "USD" };
  const { whatsappUrl, mailUrl, telUrl } = buildLinks(product);

  modalBody.innerHTML = `
    <p class="modal__eyebrow">${product.name}</p>
    <h3>How should we reach you?</h3>
    <p class="modal__hint">Pick a channel — we'll carry the item and price across for you. It's logged here too, so nothing gets lost if you only message on WhatsApp.</p>
    <div class="modal__actions">
      <a class="btn btn--whatsapp" href="${whatsappUrl}" target="_blank" rel="noopener" data-enquire-channel="whatsapp">
        Message on WhatsApp
      </a>
      <a class="btn btn--outline" href="${mailUrl}" data-enquire-channel="email">Send an email</a>
      <a class="btn btn--outline" href="${telUrl}" data-enquire-channel="call">Call the seller</a>
    </div>
  `;

  modalBody.querySelectorAll("[data-enquire-channel]").forEach((link) => {
    link.addEventListener("click", () => {
      store.recordEnquiry({
        productId: product.id,
        productName: product.name,
        channel: link.dataset.enquireChannel,
      });
    });
  });

  lastFocused = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  modalClose?.focus();
}

function closeEnquireModal() {
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  if (lastFocused instanceof HTMLElement) lastFocused.focus();
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-enquire]");
  if (trigger) openEnquireModal(trigger.getAttribute("data-enquire"));
});

modalClose?.addEventListener("click", closeEnquireModal);
modal?.addEventListener("click", (event) => {
  if (event.target === modal) closeEnquireModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal && !modal.hidden) closeEnquireModal();
});

/* ============================================================
   CART PANEL — quantities, subtotal, mock checkout
============================================================ */
const cartPanel = document.querySelector("[data-cart-panel]");
const panelBackdrop = document.querySelector("[data-panel-backdrop]");
const bagCountEl = document.querySelector("[data-bag-count]");

function updateBagCount() {
  if (bagCountEl) bagCountEl.textContent = `(${store.cartItemCount()})`;
}

function openPanel(panel) {
  panel.classList.add("open");
  panelBackdrop.classList.add("open");
}

function closeAllPanels() {
  document.querySelectorAll(".side-panel").forEach((p) => p.classList.remove("open"));
  panelBackdrop.classList.remove("open");
}

panelBackdrop?.addEventListener("click", closeAllPanels);
document.querySelectorAll("[data-close-panel]").forEach((btn) => btn.addEventListener("click", closeAllPanels));

document.querySelector("[data-bag-link]")?.addEventListener("click", (event) => {
  event.preventDefault();
  renderCartPanel();
  openPanel(cartPanel);
});

function renderCartPanel() {
  const cart = store.getCart();
  const ids = Object.keys(cart);
  const linesEl = document.querySelector("[data-cart-lines]");
  const summaryEl = document.querySelector("[data-cart-summary]");

  if (!ids.length) {
    linesEl.innerHTML = `<p>Your bag is empty.</p>`;
    summaryEl.style.display = "none";
    return;
  }

  let subtotal = 0;
  linesEl.innerHTML = "";

  ids.forEach((id) => {
    const product = store.getProduct(id);
    if (!product) return;

    const qty = cart[id];
    const lineTotal = product.price * qty;
    subtotal += lineTotal;

    const line = document.createElement("div");
    line.className = "cart-line";
    line.innerHTML = `
      <div>
        <div class="cart-line__name">${product.name}</div>
        <div class="cart-line__meta">${formatPrice(product)} each · ${product.stock} in stock</div>
        <div class="qty-controls">
          <button type="button" data-qty-decrease="${id}">−</button>
          <span>${qty}</span>
          <button type="button" data-qty-increase="${id}">+</button>
        </div>
      </div>
      <div style="text-align:right;">
        <div class="cart-line__meta">${formatPrice({ price: lineTotal, currency: product.currency })}</div>
        <button type="button" class="cart-remove" data-remove="${id}">Remove</button>
      </div>
    `;
    linesEl.appendChild(line);
  });

  document.querySelector("[data-cart-subtotal]").textContent = formatPrice({
    price: subtotal,
    currency: "USD",
  });
  summaryEl.style.display = "block";

  linesEl.querySelectorAll("[data-qty-increase]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.qtyIncrease;
      const product = store.getProduct(id);
      const current = store.getCart()[id] || 0;
      if (product && current + 1 > product.stock) return;
      store.addToCart(id, 1);
      updateBagCount();
      renderCartPanel();
    })
  );

  linesEl.querySelectorAll("[data-qty-decrease]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.dataset.qtyDecrease;
      const current = store.getCart()[id] || 0;
      store.setCartQty(id, current - 1);
      updateBagCount();
      renderCartPanel();
    })
  );

  linesEl.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", () => {
      store.removeFromCart(btn.dataset.remove);
      updateBagCount();
      renderCartPanel();
    })
  );
}

document.querySelector("[data-checkout-button]")?.addEventListener("click", () => {
  const statusEl = document.querySelector("[data-checkout-status]");
  const result = store.completeMockCheckout();

  if (!result.ok) {
    statusEl.textContent = result.error;
    statusEl.className = "form-status form-status--error";
    return;
  }

  statusEl.textContent = "Test order placed — stock updated. (Real payment arrives with the backend step.)";
  statusEl.className = "form-status form-status--success";
  updateBagCount();
  renderCartPanel();
  renderShop();
});

updateBagCount();

/* ============================================================
   GENERAL CONTACT LINKS (footer / nav) built from config
============================================================ */
document.querySelectorAll("[data-contact='whatsapp']").forEach((el) => {
  el.href = `https://wa.me/${SELLER.whatsappNumber}`;
});
document.querySelectorAll("[data-contact='email']").forEach((el) => {
  el.href = `mailto:${SELLER.email}`;
});
document.querySelectorAll("[data-contact='call']").forEach((el) => {
  el.href = `tel:${SELLER.phone}`;
});
document.querySelectorAll("[data-contact='instagram']").forEach((el) => {
  el.href = SELLER.instagram;
});

/* Mobile nav toggle */
const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
navToggle?.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

/* Current year in footer */
const yearEl = document.querySelector("[data-year]");
if (yearEl) yearEl.textContent = new Date().getFullYear();
