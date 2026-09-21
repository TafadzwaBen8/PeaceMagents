import { supabaseAdmin } from "../../lib/supabase.js";
import {
  parsePaynowMessage,
  verifyPaynowHash,
  pollPaynowTransaction,
  getPaynowStatus,
} from "../../lib/paynow.js";
import { json, methodNotAllowed } from "../../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const body =
      typeof req.body === "string"
        ? req.body
        : new URLSearchParams(req.body || {}).toString();

    const incoming = parsePaynowMessage(body);

    if (!verifyPaynowHash(incoming)) {
      return json(res, 400, {
        ok: false,
        error: "Invalid Paynow response hash.",
      });
    }

    const reference = String(incoming.reference || "").trim();

    if (!reference) {
      return json(res, 400, {
        ok: false,
        error: "Missing Paynow transaction reference.",
      });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("order_number", reference)
      .maybeSingle();

    if (orderError) {
      console.error("Order lookup failed:", orderError);

      return json(res, 500, {
        ok: false,
        error: "Unable to look up the order.",
      });
    }

    if (!order) {
      return json(res, 404, {
        ok: false,
        error: "Order not found.",
      });
    }

    let confirmed = incoming;

    /*
     * Paynow recommends polling the PollUrl to independently
     * confirm important transaction state changes.
     */
    if (incoming.pollurl) {
      try {
        confirmed = await pollPaynowTransaction(incoming.pollurl);
      } catch (pollError) {
        console.error("Paynow confirmation poll failed:", pollError);

        return json(res, 202, {
          ok: false,
          error: "Payment received but confirmation is pending.",
        });
      }
    }

    /*
     * The independently polled transaction must still belong
     * to the order that triggered this callback.
     */
    const confirmedReference = String(
      confirmed.reference || ""
    ).trim();

    if (!confirmedReference) {
      return json(res, 400, {
        ok: false,
        error: "Paynow confirmation did not contain a transaction reference.",
      });
    }

    if (confirmedReference !== reference) {
      console.error("Paynow reference mismatch:", {
        callbackReference: reference,
        confirmedReference,
      });

      return json(res, 400, {
        ok: false,
        error: "Paynow transaction reference mismatch.",
      });
    }

    const status = getPaynowStatus(confirmed);

    /*
     * A payment amount is mandatory for every state that can
     * affect order/payment handling.
     */
    const amount = Number(confirmed.amount);

    if (!Number.isFinite(amount) || amount < 0) {
      return json(res, 400, {
        ok: false,
        error: "Paynow confirmation did not contain a valid amount.",
      });
    }

    const amountCents = Math.round(amount * 100);

    if (amountCents !== order.total_cents) {
      console.error("Paynow amount mismatch:", {
        order: order.order_number,
        expected: order.total_cents,
        received: confirmed.amount,
      });

      return json(res, 400, {
        ok: false,
        error: "Payment amount mismatch.",
      });
    }

    if (status === "paid") {
      const paynowReference = String(
        confirmed.paynowreference || ""
      ).trim();

      if (!paynowReference) {
        return json(res, 400, {
          ok: false,
          error: "Paid Paynow confirmation did not contain a Paynow reference.",
        });
      }

      const { data, error } = await supabaseAdmin.rpc(
        "confirm_order_paid",
        {
          p_order_id: order.id,
          p_paynow_reference: paynowReference,
          p_paynow_amount_cents: amountCents,
          p_raw_response: confirmed,
        }
      );

      if (error) {
        console.error("confirm_order_paid failed:", error);

        return json(res, 500, {
          ok: false,
          error: "Payment confirmation could not be recorded.",
        });
      }

      return json(res, 200, {
        ok: true,
        status: "paid",
        orderNumber: data.order_number,
      });
    }

    if (status === "cancelled") {
      const { error: releaseError } = await supabaseAdmin.rpc(
        "release_order_reservation",
        {
          p_order_id: order.id,
          p_reason: "paynow-cancelled",
        }
      );

      if (releaseError) {
        console.error(
          "Could not release cancelled order reservation:",
          releaseError
        );

        return json(res, 500, {
          ok: false,
          error: "Payment was cancelled but inventory release is pending.",
        });
      }

      return json(res, 200, {
        ok: true,
        status: "cancelled",
      });
    }

    /*
     * Created / Sent / Awaiting Delivery / Delivered /
     * Disputed / Refunded are not treated as a successful
     * checkout payment here.
     */
    return json(res, 200, {
      ok: true,
      status,
      orderNumber: order.order_number,
    });
  } catch (error) {
    console.error("Paynow callback error:", error);

    return json(res, 500, {
      ok: false,
      error: "Unable to process Paynow callback.",
    });
  }
}
