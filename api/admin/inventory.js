import { requireAdmin } from "../../lib/admin-auth.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { json } from "../../lib/http.js";

function parseInteger(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value);
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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

    const body = req.body || {};

    const productId =
      typeof body.productId === "string"
        ? body.productId.trim()
        : "";

    const quantity = parseInteger(body.quantity);

    const reason =
      typeof body.reason === "string"
        ? body.reason.trim()
        : "";

    if (!productId) {
      return json(res, 400, {
        ok: false,
        error: "Product ID is required.",
      });
    }

    if (!quantity || quantity === 0) {
      return json(res, 400, {
        ok: false,
        error: "Inventory quantity must be a non-zero integer.",
      });
    }

    if (!reason) {
      return json(res, 400, {
        ok: false,
        error: "Inventory adjustment reason is required.",
      });
    }

    const { data, error } = await supabaseAdmin.rpc(
      "admin_adjust_inventory",
      {
        p_product_id: productId,
        p_quantity_delta: quantity,
        p_reason: reason,
        p_created_by: auth.user.id,
      }
    );

    if (error) {
      console.error("Inventory adjustment error:", error);

      return json(res, 400, {
        ok: false,
        error: error.message || "Unable to adjust inventory.",
      });
    }

    return json(res, 200, {
      ok: true,
      product: data,
    });
  } catch (error) {
    console.error("Admin inventory error:", error);

    return json(res, 500, {
      ok: false,
      error: "Unable to adjust inventory.",
    });
  }
}
