import { requireAdmin } from "../../lib/admin-auth.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { json } from "../../lib/http.js";

const ALLOWED_STATUSES = new Set([
  "open",
  "sold",
]);

export default async function handler(req, res) {
  if (!["GET", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, PATCH");

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
        .from("enquiries")
        .select(`
          id,
          product_id,
          product_name_snapshot,
          channel,
          customer_name,
          customer_contact,
          message,
          user_id,
          status,
          created_at,
          updated_at,
          products (
            slug
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const enquiries = (data || []).map((enquiry) => ({
        id: enquiry.id,
        product_id: enquiry.product_id,
        product_name: enquiry.product_name_snapshot,
        product_slug: enquiry.products?.slug || null,
        channel: enquiry.channel,
        customer_name: enquiry.customer_name,
        customer_contact: enquiry.customer_contact,
        message: enquiry.message,
        user_id: enquiry.user_id,
        status: enquiry.status,
        created_at: enquiry.created_at,
        updated_at: enquiry.updated_at,
      }));

      return json(res, 200, {
        ok: true,
        enquiries,
      });
    }

    const body = req.body || {};

    const id =
      typeof body.id === "string"
        ? body.id.trim()
        : "";

    const status =
      typeof body.status === "string"
        ? body.status.trim().toLowerCase()
        : "";

    if (!id) {
      return json(res, 400, {
        ok: false,
        error: "Enquiry ID is required.",
      });
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return json(res, 400, {
        ok: false,
        error: "Invalid enquiry status.",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("enquiries")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(`
        id,
        product_id,
        product_name_snapshot,
        channel,
        customer_name,
        customer_contact,
        message,
        user_id,
        status,
        created_at,
        updated_at
      `)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return json(res, 404, {
        ok: false,
        error: "Enquiry not found.",
      });
    }

    return json(res, 200, {
      ok: true,
      enquiry: {
        ...data,
        product_name: data.product_name_snapshot,
      },
    });
  } catch (error) {
    console.error("Admin enquiries error:", error);

    return json(res, 500, {
      ok: false,
      error: "Unable to process enquiry request.",
    });
  }
}
