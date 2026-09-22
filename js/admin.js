import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const gate = document.querySelector("[data-admin-gate]");
const dashboard = document.querySelector("[data-admin-dashboard]");

let supabase = null;
let accessToken = null;
let products = [];
let editingProductId = null;

const LOW_STOCK_THRESHOLD = 3;


/* ============================================================
   BASIC UI HELPERS
============================================================ */

function showGate() {
  gate.style.display = "block";
  dashboard.style.display = "none";
}

function showDashboard(user) {
  gate.style.display = "none";
  dashboard.style.display = "block";

  const userEl = document.querySelector("[data-admin-user]");

  if (userEl) {
    userEl.textContent = user?.email
      ? `Signed in as ${user.email}`
      : "";
  }
}

function setStatus(selector, message, type = "") {
  const element = document.querySelector(selector);

  if (!element) return;

  element.textContent = message;
  element.className = `form-status${type ? ` form-status--${type}` : ""}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* ============================================================
   API
============================================================ */

async function api(path, options = {}) {
  if (!accessToken) {
    throw new Error("Your admin session has expired.");
  }

  const headers = new Headers(options.headers || {});

  headers.set(
    "Authorization",
    `Bearer ${accessToken}`
  );

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(
      body?.error ||
      `Request failed with HTTP ${response.status}.`
    );
  }

  return body;
}


/* ============================================================
   AUTH
============================================================ */

async function loadRuntimeConfig() {
  const response = await fetch("/api/config", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load application configuration.");
  }

  const config = await response.json();

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Supabase public configuration is missing.");
  }

  supabase = createClient(
    config.supabaseUrl,
    config.supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    }
  );
}


async function verifyAdminSession(session) {
  if (!session?.access_token) {
    return false;
  }

  accessToken = session.access_token;

  try {
    await api("/api/admin/session");

    return true;
  } catch {
    accessToken = null;
    return false;
  }
}


async function initialiseAuth() {
  try {
    await loadRuntimeConfig();

    const {
      data: {
        session,
      },
    } = await supabase.auth.getSession();

    if (await verifyAdminSession(session)) {
      showDashboard(session.user);
      await renderAll();
      return;
    }

    showGate();

  } catch (error) {
    showGate();

    setStatus(
      "[data-login-error]",
      error.message,
      "error"
    );
  }
}


/* ============================================================
   LOGIN
============================================================ */

document
  .querySelector("[data-login-form]")
  ?.addEventListener("submit", async (event) => {

    event.preventDefault();

    const form = event.currentTarget;

    const email = String(
      form.elements.email.value
    ).trim();

    const password = String(
      form.elements.password.value
    );

    setStatus(
      "[data-login-error]",
      "Signing in…"
    );

    try {

      const {
        data,
        error,
      } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      const valid = await verifyAdminSession(
        data.session
      );

      if (!valid) {
        await supabase.auth.signOut();

        throw new Error(
          "This account is not authorized as a PeaceMagents administrator."
        );
      }

      setStatus(
        "[data-login-error]",
        ""
      );

      showDashboard(data.user);

      form.reset();

      await renderAll();

    } catch (error) {

      accessToken = null;

      setStatus(
        "[data-login-error]",
        error.message || "Unable to sign in.",
        "error"
      );
    }
  });


/* ============================================================
   SIGN OUT
============================================================ */

document
  .querySelector("[data-admin-signout]")
  ?.addEventListener("click", async () => {

    try {
      await supabase.auth.signOut();
    } finally {
      accessToken = null;
      showGate();
    }
  });


/* ============================================================
   AUTH STATE
============================================================ */

async function attachAuthListener() {

  supabase.auth.onAuthStateChange(
    async (_event, session) => {

      if (!session) {
        accessToken = null;
        showGate();
        return;
      }

      const valid = await verifyAdminSession(session);

      if (!valid) {
        await supabase.auth.signOut();
        return;
      }

      showDashboard(session.user);
      await renderAll();
    }
  );
}


/* ============================================================
   TABS
============================================================ */

document
  .querySelectorAll("[data-admin-tab]")
  .forEach((tab) => {

    tab.addEventListener("click", () => {

      document
        .querySelectorAll("[data-admin-tab]")
        .forEach((item) => {
          item.classList.remove("active");
        });

      document
        .querySelectorAll("[data-admin-panel]")
        .forEach((panel) => {
          panel.classList.remove("active");
        });

      tab.classList.add("active");

      const panel = document.querySelector(
        `[data-admin-panel="${tab.dataset.adminTab}"]`
      );

      panel?.classList.add("active");
    });

  });


/* ============================================================
   INVENTORY
============================================================ */

async function loadProducts() {

  const result = await api(
    "/api/admin/products"
  );

  products = Array.isArray(result.products)
    ? result.products
    : [];

  return products;
}


function renderInventory() {

  const tbody = document.querySelector(
    "[data-inventory-body]"
  );

  if (!tbody) return;

  if (!products.length) {

    tbody.innerHTML = `
      <tr>
        <td
          colspan="5"
          style="color:var(--ink-soft);"
        >
          No products found.
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML = products
    .map((product) => {

      const stock = Number(
        product.stock ?? 0
      );

      let pill = `
        <span class="pill pill--ok">
          ${stock} in stock
        </span>
      `;

      if (stock === 0) {

        pill = `
          <span class="pill pill--out">
            Sold out
          </span>
        `;

      } else if (stock <= LOW_STOCK_THRESHOLD) {

        pill = `
          <span class="pill pill--low">
            ${stock} left
          </span>
        `;
      }

      return `
        <tr>

          <td>
            <strong>
              ${escapeHtml(product.name)}
            </strong>

            <br>

            <span
              style="
                color:var(--ink-soft);
                font-size:0.8em;
              "
            >
              ${escapeHtml(
                product.slug || product.id || ""
              )}
            </span>
          </td>

          <td>
            ${escapeHtml(
              product.category || "—"
            )}
          </td>

          <td>
            $${(
              Number(product.price_cents || 0) / 100
            ).toFixed(2)}
          </td>

          <td>${pill}</td>

          <td>

            <button
              type="button"
              data-stock-minus="${escapeHtml(
                product.id
              )}"
            >
              −1
            </button>

            <button
              type="button"
              data-stock-plus="${escapeHtml(
                product.id
              )}"
            >
              +1
            </button>

            <button
              type="button"
              data-edit-product="${escapeHtml(
                product.id
              )}"
            >
              Edit
            </button>

            <button
              type="button"
              data-toggle-publish="${escapeHtml(
                product.id
              )}"
              data-active="${product.active ? "true" : "false"}"
            >
              ${product.active ? "Unpublish" : "Publish"}
            </button>

          </td>

        </tr>
      `;

    })
    .join("");


  tbody
    .querySelectorAll("[data-stock-plus]")
    .forEach((button) => {

      button.addEventListener(
        "click",
        async () => {

          try {

            await api(
              "/api/admin/inventory",
              {
                method: "POST",
                body: JSON.stringify({
                  productId:
                    button.dataset.stockPlus,
                  quantity: 1,
                  reason: "restock",
                }),
              }
            );

            await refreshProducts();

          } catch (error) {

            alert(error.message);

          }

        }
      );

    });


  tbody
    .querySelectorAll("[data-stock-minus]")
    .forEach((button) => {

      button.addEventListener(
        "click",
        async () => {

          try {

            await api(
              "/api/admin/inventory",
              {
                method: "POST",
                body: JSON.stringify({
                  productId:
                    button.dataset.stockMinus,
                  quantity: -1,
                  reason: "adjustment",
                }),
              }
            );

            await refreshProducts();

          } catch (error) {

            alert(error.message);

          }

        }
      );

    });


  tbody
    .querySelectorAll("[data-edit-product]")
    .forEach((button) => {

      button.addEventListener("click", () => {
        startEditProduct(button.dataset.editProduct);
      });

    });


  tbody
    .querySelectorAll("[data-toggle-publish]")
    .forEach((button) => {

      button.addEventListener("click", async () => {

        const productId = button.dataset.togglePublish;
        const currentlyActive = button.dataset.active === "true";

        try {

          await api("/api/admin/products", {
            method: "PATCH",
            body: JSON.stringify({
              id: productId,
              active: !currentlyActive,
            }),
          });

          await refreshProducts();

        } catch (error) {

          alert(error.message);

        }

      });

    });

}


/* ============================================================
   PRODUCT SELECT
============================================================ */

function populateProductSelect() {

  const select = document.querySelector(
    "[data-restock-product]"
  );

  if (!select) return;

  const current = select.value;

  select.innerHTML = products
    .map(
      (product) => `
        <option value="${escapeHtml(product.id)}">
          ${escapeHtml(product.name)}
          —
          ${Number(product.stock ?? 0)} in stock
        </option>
      `
    )
    .join("");

  if (current) {
    select.value = current;
  }
}


/* ============================================================
   RESTOCK
============================================================ */

document
  .querySelector("[data-restock-form]")
  ?.addEventListener("submit", async (event) => {

    event.preventDefault();

    const form = event.currentTarget;

    const productId =
      form.elements.product.value;

    const quantity = Number(
      form.elements.quantity.value
    );

    if (
      !productId ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {

      setStatus(
        "[data-restock-status]",
        "Enter a valid quantity.",
        "error"
      );

      return;
    }

    try {

      const result = await api(
        "/api/admin/inventory",
        {
          method: "POST",
          body: JSON.stringify({
            productId,
            quantity,
            reason: "restock",
          }),
        }
      );

      setStatus(
        "[data-restock-status]",
        result.message ||
          `Logged +${quantity} units.`,
        "success"
      );

      form.reset();

      await refreshProducts();

    } catch (error) {

      setStatus(
        "[data-restock-status]",
        error.message,
        "error"
      );

    }

  });


/* ============================================================
   NEW PRODUCT / EDIT PRODUCT
   (One form serves both — editingProductId decides the mode.)
============================================================ */

function startEditProduct(productId) {

  const product = products.find(
    (item) => item.id === productId
  );

  if (!product) return;

  editingProductId = productId;

  const form = document.querySelector(
    "[data-new-product-form]"
  );

  if (!form) return;

  form.elements.name.value = product.name || "";
  form.elements.price.value =
    (Number(product.price_cents || 0) / 100).toFixed(2);
  form.elements.stock.value = product.stock ?? 0;
  form.elements.stock.disabled = true; // stock changes via +1/−1 only
  form.elements.category.value = product.category || "";
  form.elements.tag.value = product.tag || "";
  form.elements.sizes.value =
    (product.sizes || []).join(", ");
  form.elements.image.value = product.image_url || "";
  form.elements.description.value =
    product.description || "";
  form.elements.allowDirectCheckout.checked =
    product.allow_direct_checkout !== false;
  form.elements.active.checked =
    product.active !== false;

  const heading = document.querySelector(
    "[data-new-product-heading]"
  );
  if (heading) heading.textContent = `Edit "${product.name}"`;

  const submitButton = document.querySelector(
    "[data-new-product-submit]"
  );
  if (submitButton) submitButton.textContent = "Save changes";

  const cancelButton = document.querySelector(
    "[data-cancel-edit]"
  );
  if (cancelButton) cancelButton.style.display = "inline-block";

  document
    .querySelector('[data-admin-tab="new-product"]')
    ?.click();

  form.scrollIntoView({ behavior: "smooth" });
}

function resetProductForm() {

  editingProductId = null;

  const form = document.querySelector(
    "[data-new-product-form]"
  );

  if (form) {
    form.reset();
    form.elements.stock.disabled = false;
  }

  const heading = document.querySelector(
    "[data-new-product-heading]"
  );
  if (heading) heading.textContent = "Add a new product";

  const submitButton = document.querySelector(
    "[data-new-product-submit]"
  );
  if (submitButton) submitButton.textContent = "Add product";

  const cancelButton = document.querySelector(
    "[data-cancel-edit]"
  );
  if (cancelButton) cancelButton.style.display = "none";

  setStatus("[data-new-product-status]", "", "");
  setStatus("[data-image-upload-status]", "", "");
}

document
  .querySelector("[data-cancel-edit]")
  ?.addEventListener("click", resetProductForm);


document
  .querySelector("[data-image-file-field]")
  ?.addEventListener("change", async (event) => {

    const file = event.currentTarget.files?.[0];

    if (!file) return;

    setStatus(
      "[data-image-upload-status]",
      "Uploading…",
      ""
    );

    try {

      const buffer = await file.arrayBuffer();

      const response = await fetch(
        "/api/admin/upload-image",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": file.type,
          },
          body: buffer,
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result?.error || "Upload failed."
        );
      }

      const pathField = document.querySelector(
        "[data-image-path-field]"
      );

      if (pathField) {
        pathField.value = result.url;
      }

      setStatus(
        "[data-image-upload-status]",
        "Image uploaded.",
        "success"
      );

    } catch (error) {

      setStatus(
        "[data-image-upload-status]",
        error.message,
        "error"
      );

    }

  });


document
  .querySelector("[data-new-product-form]")
  ?.addEventListener("submit", async (event) => {

    event.preventDefault();

    const form = event.currentTarget;
    const fd = new FormData(form);

    const name = String(
      fd.get("name") || ""
    ).trim();

    const price = Number(
      fd.get("price")
    );

    const stock = Number(
      fd.get("stock")
    );

    const sizes = String(
      fd.get("sizes") || ""
    )
      .split(",")
      .map((size) => size.trim())
      .filter(Boolean);

    const image = String(
      fd.get("image") || ""
    ).trim();

    const active = fd.get("active") === "on";
    const isEditing = Boolean(editingProductId);

    if (
      !name ||
      !Number.isFinite(price) ||
      price < 0 ||
      !image ||
      (!isEditing &&
        (!Number.isInteger(stock) || stock < 0))
    ) {

      setStatus(
        "[data-new-product-status]",
        "Name, valid price and image are required.",
        "error"
      );

      return;
    }

    const payload = {

      name,

      priceCents:
        Math.round(price * 100),

      category:
        fd.get("category") || null,

      tag:
        fd.get("tag") || null,

      sizes:
        sizes.length
          ? sizes
          : ["One size"],

      image,

      description:
        String(
          fd.get("description") || ""
        ).trim(),

      allowDirectCheckout:
        fd.get("allowDirectCheckout")
        === "on",

      active,

    };

    try {

      if (isEditing) {

        await api(
          "/api/admin/products",
          {
            method: "PATCH",
            body: JSON.stringify({
              id: editingProductId,
              ...payload,
            }),
          }
        );

        setStatus(
          "[data-new-product-status]",
          `Saved changes to "${name}".`,
          "success"
        );

      } else {

        const result = await api(
          "/api/admin/products",
          {
            method: "POST",
            body: JSON.stringify({
              ...payload,
              stock,
            }),
          }
        );

        setStatus(
          "[data-new-product-status]",
          result.message ||
            `Added "${name}".`,
          "success"
        );

      }

      resetProductForm();

      await refreshProducts();

    } catch (error) {

      setStatus(
        "[data-new-product-status]",
        error.message,
        "error"
      );

    }

  });


/* ============================================================
   SALES
============================================================ */

async function renderSales() {

  const tbody = document.querySelector(
    "[data-sales-body]"
  );

  if (!tbody) return;

  try {

    const result = await api(
      "/api/admin/orders"
    );

    const orders = result.orders || [];

    if (!orders.length) {

      tbody.innerHTML = `
        <tr>
          <td
            colspan="5"
            style="color:var(--ink-soft);"
          >
            No completed sales recorded yet.
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML = orders
      .filter(
        (order) =>
          order.status === "paid"
      )
      .map(
        (order) => `
          <tr>

            <td>
              ${new Date(
                order.created_at
              ).toLocaleString()}
            </td>

            <td>
              ${escapeHtml(
                order.order_number
              )}
            </td>

            <td>
              ${Number(
                order.item_count || 0
              )}
            </td>

            <td>
              $${(
                Number(
                  order.total_cents || 0
                ) / 100
              ).toFixed(2)}
            </td>

            <td>
              Paynow
            </td>

          </tr>
        `
      )
      .join("");

  } catch (error) {

    tbody.innerHTML = `
      <tr>
        <td
          colspan="5"
          style="color:var(--ink-soft);"
        >
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;

  }
}


/* ============================================================
   ENQUIRIES
============================================================ */

async function renderEnquiries() {

  const tbody = document.querySelector(
    "[data-enquiries-body]"
  );

  if (!tbody) return;

  try {

    const result = await api(
      "/api/admin/enquiries"
    );

    const enquiries =
      result.enquiries || [];

    if (!enquiries.length) {

      tbody.innerHTML = `
        <tr>
          <td
            colspan="5"
            style="color:var(--ink-soft);"
          >
            No enquiries recorded yet.
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML = enquiries
      .map(
        (enquiry) => `
          <tr>

            <td>
              ${new Date(
                enquiry.created_at
              ).toLocaleString()}
            </td>

            <td>
              ${escapeHtml(
                enquiry.product_name ||
                enquiry.product_slug ||
                "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                enquiry.channel || "—"
              )}
            </td>

            <td>

              ${
                enquiry.status === "sold"
                  ? `
                    <span class="pill pill--sold">
                      Sold
                    </span>
                  `
                  : `
                    <span class="pill pill--open">
                      Open
                    </span>
                  `
              }

            </td>

            <td>

              ${
                enquiry.status === "open"
                  ? `
                    <button
                      type="button"
                      data-mark-sold="${escapeHtml(
                        enquiry.id
                      )}"
                    >
                      Mark as sold
                    </button>
                  `
                  : "—"
              }

            </td>

          </tr>
        `
      )
      .join("");


    tbody
      .querySelectorAll("[data-mark-sold]")
      .forEach((button) => {

        button.addEventListener(
          "click",
          async () => {

            try {

              await api(
                "/api/admin/enquiries",
                {
                  method: "PATCH",
                  body: JSON.stringify({
                    id:
                      button.dataset.markSold,
                    status: "sold",
                  }),
                }
              );

              await refreshProducts();
              await renderEnquiries();
              await renderSales();

            } catch (error) {

              alert(error.message);

            }

          }
        );

      });

  } catch (error) {

    tbody.innerHTML = `
      <tr>
        <td
          colspan="5"
          style="color:var(--ink-soft);"
        >
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;

  }

}


/* ============================================================
   REFRESH
============================================================ */

async function refreshProducts() {

  await loadProducts();

  renderInventory();
  populateProductSelect();

}


async function renderAll() {

  await refreshProducts();

  await renderSales();

  await renderEnquiries();

}


/* ============================================================
   BOOT
============================================================ */

(async function boot() {

  try {

    await loadRuntimeConfig();

    await initialiseAuth();

    if (supabase) {
      await attachAuthListener();
    }

  } catch (error) {

    showGate();

    setStatus(
      "[data-login-error]",
      error.message,
      "error"
    );

  }

})();