import { ADMIN_LOCAL_PASSCODE, LOW_STOCK_THRESHOLD } from "./config.js";
import * as store from "./store.js";

/* ============================================================
   LOCAL PASSCODE GATE
   (Temporary — see the note in config.js. Replaced by a real
   server-side check in the backend step.)
============================================================ */
const GATE_KEY = "pm_admin_unlocked";
const gate = document.querySelector("[data-admin-gate]");
const dashboard = document.querySelector("[data-admin-dashboard]");

function unlock() {
  sessionStorage.setItem(GATE_KEY, "1");
  gate.style.display = "none";
  dashboard.style.display = "block";
  renderAll();
}

document.querySelector("[data-gate-submit]")?.addEventListener("click", () => {
  const input = document.querySelector("[data-gate-input]");
  const errorEl = document.querySelector("[data-gate-error]");

  if (input.value === ADMIN_LOCAL_PASSCODE) {
    unlock();
  } else {
    errorEl.textContent = "Incorrect passcode.";
  }
});

document.querySelector("[data-gate-input]")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.querySelector("[data-gate-submit]").click();
});

if (sessionStorage.getItem(GATE_KEY) === "1") {
  unlock();
}

/* ============================================================
   TABS
============================================================ */
document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-admin-tab]").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll("[data-admin-panel]").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`[data-admin-panel="${tab.dataset.adminTab}"]`).classList.add("active");
  });
});

/* ============================================================
   INVENTORY TABLE
============================================================ */
function renderInventory() {
  const tbody = document.querySelector("[data-inventory-body]");
  const products = store.getProducts();

  tbody.innerHTML = products
    .map((p) => {
      const stock = p.stock ?? 0;
      let pill = `<span class="pill pill--ok">${stock} in stock</span>`;
      if (stock === 0) pill = `<span class="pill pill--out">Sold out</span>`;
      else if (stock <= LOW_STOCK_THRESHOLD) pill = `<span class="pill pill--low">${stock} left</span>`;

      return `
        <tr>
          <td><strong>${p.name}</strong><br><span style="color:var(--ink-soft);font-size:0.8em;">${p.id}</span></td>
          <td>${p.category || "—"}</td>
          <td>$${p.price}</td>
          <td>${pill}</td>
          <td>
            <button type="button" data-stock-minus="${p.id}">−1</button>
            <button type="button" data-stock-plus="${p.id}">+1</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll("[data-stock-plus]").forEach((btn) =>
    btn.addEventListener("click", () => {
      store.adjustStock(btn.dataset.stockPlus, 1, "restock");
      renderInventory();
      populateProductSelect();
    })
  );

  tbody.querySelectorAll("[data-stock-minus]").forEach((btn) =>
    btn.addEventListener("click", () => {
      store.adjustStock(btn.dataset.stockMinus, -1, "adjustment");
      renderInventory();
      populateProductSelect();
    })
  );
}

/* ============================================================
   ADD STOCK FORM (log newly arrived stock)
============================================================ */
function populateProductSelect() {
  const select = document.querySelector("[data-restock-product]");
  if (!select) return;
  const current = select.value;
  select.innerHTML = store
    .getProducts()
    .map((p) => `<option value="${p.id}">${p.name} — ${p.stock ?? 0} in stock</option>`)
    .join("");
  if (current) select.value = current;
}

document.querySelector("[data-restock-form]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const productId = form.elements.namedItem("product").value;
  const qty = parseInt(form.elements.namedItem("quantity").value, 10);
  const statusEl = document.querySelector("[data-restock-status]");

  if (!productId || !qty || qty <= 0) {
    statusEl.textContent = "Enter a valid quantity.";
    statusEl.className = "form-status form-status--error";
    return;
  }

  const product = store.adjustStock(productId, qty, "restock");
  statusEl.textContent = `Logged: +${qty} for "${product.name}" — now ${product.stock} in stock.`;
  statusEl.className = "form-status form-status--success";

  form.reset();
  renderInventory();
  populateProductSelect();
});

/* ============================================================
   ADD NEW PRODUCT FORM
============================================================ */
document.querySelector("[data-new-product-form]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const statusEl = document.querySelector("[data-new-product-status]");
  const fd = new FormData(form);

  const name = fd.get("name").trim();
  const id = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const price = parseFloat(fd.get("price"));
  const stock = parseInt(fd.get("stock"), 10) || 0;
  const sizes = fd
    .get("sizes")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!name || !price || !fd.get("image")) {
    statusEl.textContent = "Name, price, and image path are required.";
    statusEl.className = "form-status form-status--error";
    return;
  }

  try {
    store.addProduct({
      id,
      name,
      price,
      currency: "USD",
      category: fd.get("category") || null,
      sizes: sizes.length ? sizes : ["One size"],
      tag: fd.get("tag") || null,
      stock,
      allowDirectCheckout: fd.get("allowDirectCheckout") === "on",
      image: fd.get("image"),
      alt: name,
      description: fd.get("description") || "",
    });

    statusEl.textContent = `Added "${name}" with ${stock} in stock.`;
    statusEl.className = "form-status form-status--success";
    form.reset();
    renderInventory();
    populateProductSelect();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "form-status form-status--error";
  }
});

/* ============================================================
   SALES LOG
============================================================ */
function renderSales() {
  const tbody = document.querySelector("[data-sales-body]");
  const sales = store.getSales();

  if (!sales.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--ink-soft);">No sales recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = sales
    .map(
      (s) => `
        <tr>
          <td>${new Date(s.at).toLocaleString()}</td>
          <td>${s.productName}</td>
          <td>${s.quantity}</td>
          <td>$${s.total}</td>
          <td>${s.source}${s.channel ? ` (${s.channel})` : ""}</td>
        </tr>
      `
    )
    .join("");
}

/* ============================================================
   ENQUIRIES — mark as sold when a chat closes a deal
============================================================ */
function renderEnquiries() {
  const tbody = document.querySelector("[data-enquiries-body]");
  const enquiries = store.getEnquiries();

  if (!enquiries.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--ink-soft);">No enquiries logged yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = enquiries
    .map(
      (e) => `
        <tr>
          <td>${new Date(e.at).toLocaleString()}</td>
          <td>${e.productName}</td>
          <td>${e.channel}</td>
          <td>${e.status === "sold" ? `<span class="pill pill--sold">Sold</span>` : `<span class="pill pill--open">Open</span>`}</td>
          <td>${e.status === "open" ? `<button type="button" data-mark-sold="${e.id}">Mark as sold</button>` : "—"}</td>
        </tr>
      `
    )
    .join("");

  tbody.querySelectorAll("[data-mark-sold]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const sale = store.markEnquirySold(btn.dataset.markSold, 1);
      if (!sale) return;
      renderEnquiries();
      renderSales();
      renderInventory();
      populateProductSelect();
    })
  );
}

/* ============================================================
   RESET DEMO DATA
============================================================ */
document.querySelector("[data-reset-demo]")?.addEventListener("click", () => {
  if (!confirm("Reset all local data (products, stock, sales, enquiries) back to the starting demo state?")) return;
  store.resetDemoData();
  renderAll();
});

/* ============================================================
   INIT
============================================================ */
function renderAll() {
  renderInventory();
  populateProductSelect();
  renderSales();
  renderEnquiries();
}
