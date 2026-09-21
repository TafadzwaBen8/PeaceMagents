import { requireAdmin } from "../../lib/admin-auth.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { json } from "../../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

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

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        payment_status,
        currency,
        subtotal_cents,
        total_cents,
        customer_name,
        customer_email,
        customer_phone,
        payment_provider,
        payment_reference,
        created_at,
        updated_at,
        order_items (
          quantity
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const orders = (data || []).map((order) => ({
      ...order,
      item_count: (order.order_items || []).reduce(
        (total, item) => total + Number(item.quantity || 0),
        0
      ),
      order_items: undefined,
    }));

    return json(res, 200, {
      ok: true,
      orders,
    });
  } catch (error) {
    console.error("Admin orders error:", error);

    return json(res, 500, {
      ok: false,
      error: "Unable to load orders.",
    });
  }
}
