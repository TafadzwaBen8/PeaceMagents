import { supabaseAdmin } from "../lib/supabase.js";
import { json, methodNotAllowed } from "../lib/http.js";

const ALLOWED_CHANNELS = new Set(["whatsapp", "email", "phone"]);

function cleanString(value, maxLength) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    const productSlug = cleanString(body.productSlug, 160);
    const channel = cleanString(body.channel, 20).toLowerCase();
    const customerName = cleanString(body.customerName, 120) || null;
    const customerContact = cleanString(body.customerContact, 180) || null;
    const message = cleanString(body.message, 2000) || null;

    if (!ALLOWED_CHANNELS.has(channel)) {
      return json(res, 400, { ok: false, error: "Invalid enquiry channel." });
    }

    let productId = null;
    let productName = cleanString(body.productName, 200);

    if (productSlug) {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("id, name")
        .eq("slug", productSlug)
        .maybeSingle();

      if (product) {
        productId = product.id;
        productName = product.name;
      }
    }

    if (!productName) {
      return json(res, 400, { ok: false, error: "Product information is required." });
    }

    /*
     * Optional bearer token: if a signed-in shopper sends one, attach
     * the enquiry to their account. Anonymous enquiries are allowed —
     * this endpoint exists precisely because the enquire modal has no
     * login gate.
     */
    const authorization = req.headers.authorization || "";
    const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();
    let userId = null;

    if (bearerToken) {
      const { data } = await supabaseAdmin.auth.getUser(bearerToken);
      userId = data?.user?.id || null;
    }

    const { error } = await supabaseAdmin.from("enquiries").insert({
      product_id: productId,
      product_name_snapshot: productName,
      channel,
      customer_name: customerName,
      customer_contact: customerContact,
      message,
      user_id: userId,
    });

    if (error) {
      console.error("Enquiry insert failed:", error);
      return json(res, 500, { ok: false, error: "Could not log the enquiry." });
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("Enquiries error:", error);
    return json(res, 500, { ok: false, error: "Could not log the enquiry." });
  }
}