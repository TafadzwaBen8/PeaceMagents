import { supabaseAdmin } from "../lib/supabase.js";
import { json, methodNotAllowed } from "../lib/http.js";
import {
  initiatePaynowTransaction,
  amountCentsToPaynowAmount,
} from "../lib/paynow.js";

function getBaseUrl(req) {
  return (
    process.env.APP_URL ||
    `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`
  ).replace(/\/$/, "");
}

function cleanString(value, maxLength) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const items = Array.isArray(body.items)
      ? body.items
      : [];

    const customerName = cleanString(body.customerName, 120);
    const customerEmail = cleanString(body.customerEmail, 180).toLowerCase();
    const customerPhone = cleanString(body.customerPhone, 40);

    if (!items.length) {
      return json(res, 400, {
        ok: false,
        error: "Your cart is empty.",
      });
    }

    if (!customerName || !customerEmail) {
      return json(res, 400, {
        ok: false,
        error: "Customer name and email are required.",
      });
    }

    /*
     * Guest checkout is allowed when no Authorization header exists.
     * If a bearer token is supplied, however, it must be valid.
     */
    const authorization = req.headers.authorization || "";
    const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();

    let authenticatedUser = null;

    if (bearerToken) {
      const { data, error: authError } =
        await supabaseAdmin.auth.getUser(bearerToken);

      if (authError || !data?.user) {
        return json(res, 401, {
          ok: false,
          error: "Invalid authentication token.",
        });
      }

      authenticatedUser = data.user;
    }

    const normalizedItems = items.map((item) => ({
      slug: cleanString(item.slug, 160),
      quantity: Number(item.quantity),
      size: cleanString(item.size, 40) || null,
    }));

    if (
      normalizedItems.some(
        (item) =>
          !item.slug ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0
      )
    ) {
      return json(res, 400, {
        ok: false,
        error: "Invalid cart contents.",
      });
    }

    const { data: order, error: orderError } =
      await supabaseAdmin.rpc("create_pending_order", {
        p_items: normalizedItems,
        p_customer_name: customerName,
        p_customer_email: customerEmail,
        p_customer_phone: customerPhone || null,
        p_user_id: authenticatedUser?.id || null,
      });

    if (orderError) {
      console.error("create_pending_order failed:", orderError);

      return json(res, 400, {
        ok: false,
        error: orderError.message || "Unable to create order.",
      });
    }

    const baseUrl = getBaseUrl(req);

    let paynow;

    try {
      paynow = await initiatePaynowTransaction({
        reference: order.order_number,
        amount: amountCentsToPaynowAmount(order.total_cents),
        additionalInfo: `PeaceMagents order ${order.order_number}`,
        returnUrl:
          `${baseUrl}/?payment=return&order=${encodeURIComponent(
            order.order_number
          )}`,
        resultUrl:
          `${baseUrl}/api/paynow/callback?order=${encodeURIComponent(
            order.order_number
          )}`,
        authEmail: customerEmail,
      });
    } catch (paymentError) {
      console.error("Paynow initiation failed:", paymentError);

      const { error: releaseError } = await supabaseAdmin.rpc(
        "release_order_reservation",
        {
          p_order_id: order.id,
          p_reason: "paynow-initiation-failed",
        }
      );

      if (releaseError) {
        console.error(
          "Could not release failed Paynow reservation:",
          releaseError
        );
      }

      return json(res, 502, {
        ok: false,
        error: "Unable to start Paynow payment.",
      });
    }

    /*
     * Paynow has now created a real transaction. Do NOT release the
     * inventory reservation if this database update fails: the
     * customer may still complete the Paynow transaction.
     *
     * This order becomes a reconciliation case instead and remains
     * pending until the callback/recovery process sees it.
     */
    const { error: paymentUpdateError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_poll_url: paynow.pollUrl,
        payment_raw_response: paynow.raw,
      })
      .eq("id", order.id)
      .eq("status", "pending_payment");

    if (paymentUpdateError) {
      console.error(
        "Could not save Paynow transaction details:",
        paymentUpdateError
      );

      return json(res, 500, {
        ok: false,
        error:
          "Payment was created but local payment tracking needs reconciliation.",
      });
    }

    return json(res, 200, {
      ok: true,
      orderId: order.id,
      orderNumber: order.order_number,
      totalCents: order.total_cents,
      currency: order.currency,
      expiresAt: order.expires_at,
      browserUrl: paynow.browserUrl,
    });
  } catch (error) {
    console.error("Checkout error:", error);

    return json(res, 500, {
      ok: false,
      error: "Checkout could not be completed.",
    });
  }
}
