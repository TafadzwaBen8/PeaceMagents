import { requireAdmin } from "../../lib/admin-auth.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { json } from "../../lib/http.js";

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseInteger(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value);
  }

  return null;
}

function normalizeSizes(value) {
  if (!Array.isArray(value)) {
    return ["One size"];
  }

  const sizes = value
    .map((size) => String(size).trim())
    .filter(Boolean);

  return sizes.length ? [...new Set(sizes)] : ["One size"];
}

async function createUniqueSlug(name) {
  const base = slugify(name);

  if (!base) {
    throw new Error("Unable to generate a valid product slug.");
  }

  let slug = base;

  const { data: existing, error } = await supabaseAdmin
    .from("products")
    .select("slug")
    .like("slug", `${base}%`);

  if (error) {
    throw error;
  }

  const used = new Set((existing || []).map((row) => row.slug));

  if (!used.has(slug)) {
    return slug;
  }

  let counter = 2;

  while (used.has(`${base}-${counter}`)) {
    counter += 1;
  }

  return `${base}-${counter}`;
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");

    return json(res, 405, {
      ok: false,
      error: "Method not allowed.",
    });
  }

  try {
    const auth = await requireAdmin(req);

    if (!auth.ok) {
      return json(res, auth.status, {
        ok: false,
        error: auth.error,
      });
    }

    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        throw error;
      }

      return json(res, 200, {
        ok: true,
        products: data || [],
      });
    }

    const body = req.body || {};

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const priceCents = parseInteger(body.priceCents);
    const stock = parseInteger(body.stock);

    const category =
      typeof body.category === "string"
        ? body.category.trim()
        : "";

    const tag =
      typeof body.tag === "string"
        ? body.tag.trim()
        : "";

    const image =
      typeof body.image === "string"
        ? body.image.trim()
        : "";

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";

    const sizes = normalizeSizes(body.sizes);

    const allowDirectCheckout =
      body.allowDirectCheckout !== false;

    if (!name) {
      return json(res, 400, {
        ok: false,
        error: "Product name is required.",
      });
    }

    if (priceCents === null || priceCents < 0) {
      return json(res, 400, {
        ok: false,
        error: "A valid non-negative price is required.",
      });
    }

    if (stock === null || stock < 0) {
      return json(res, 400, {
        ok: false,
        error: "A valid non-negative stock quantity is required.",
      });
    }

    const slug = await createUniqueSlug(name);

    const { data, error } = await supabaseAdmin.rpc(
      "admin_create_product",
      {
        p_slug: slug,
        p_name: name,
        p_description: description || null,
        p_price_cents: priceCents,
        p_currency: "USD",
        p_category: category || null,
        p_sizes: sizes,
        p_tag: tag || null,
        p_image_url: image || null,
        p_alt_text: name,
        p_allow_direct_checkout: allowDirectCheckout,
        p_stock: stock,
        p_sort_order: 0,
        p_created_by: auth.user.id,
      }
    );

    if (error) {
      console.error("Product creation error:", error);

      return json(res, 400, {
        ok: false,
        error: error.message || "Unable to create product.",
      });
    }

    return json(res, 201, {
      ok: true,
      product: data,
    });
  } catch (error) {
    console.error("Admin products error:", error);

    return json(res, 500, {
      ok: false,
      error: "Unable to process product request.",
    });
  }
}
