import { supabaseAdmin } from "../../lib/supabase.js";
import {
  pollPaynowTransaction,
  getPaynowStatus,
} from "../../lib/paynow.js";
import { json, methodNotAllowed } from "../../lib/http.js";

function authorized(req) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  return req.headers.authorization === `Bearer ${secret}`;
}

function amountToCents(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function isPaidStatus(status) {
  return [
    "paid",
    "awaiting delivery",
    "delivered",
  ].includes(status);
}

function isCancelledStatus(status) {
  return status === "cancelled";
}

async function releaseReservation(orderId, reason) {
  const { data, error } = await supabaseAdmin.rpc(
    "release_order_reservation",
    {
      p_order_id: orderId,
      p_reason: reason,
    }
  );

  if (error) {
    throw new Error(
      `Failed to release reservation: ${error.message}`
    );
  }

  return data;
}

async function confirmPayment(
  orderId,
  paynowReference,
  amountCents,
  rawResponse
) {
  const { data, error } = await supabaseAdmin.rpc(
    "confirm_order_paid",
    {
      p_order_id: orderId,
      p_paynow_reference: paynowReference,
      p_paynow_amount_cents: amountCents,
      p_raw_response: rawResponse,
    }
  );

  if (error) {
    throw new Error(
      `Failed to confirm payment: ${error.message}`
    );
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  if (!authorized(req)) {
    return json(res, 401, {
      ok: false,
      error: "Unauthorized.",
    });
  }

  const requestedLimit = Number(req.query?.limit || 50);

  const limit = Math.min(
    Math.max(
      Number.isInteger(requestedLimit) ? requestedLimit : 50,
      1
    ),
    200
  );

  const { data: orders, error } = await supabaseAdmin.rpc(
    "get_expired_pending_orders",
    {
      p_limit: limit,
    }
  );

  if (error) {
    console.error("reconcile_lookup_failed", error);

    return json(res, 500, {
      ok: false,
      error: "Unable to load expired orders.",
    });
  }

  const results = [];

  for (const order of orders || []) {
    const result = {
      orderId: order.id,
      orderNumber: order.order_number,
      outcome: "skipped",
    };

    try {
      if (!order.payment_poll_url) {
        result.outcome = "missing_poll_url";
        results.push(result);
        continue;
      }

      const paynow = await pollPaynowTransaction(
        order.payment_poll_url
      );

      const reference = String(
        paynow.reference || ""
      ).trim();

      if (
        !reference ||
        reference !== String(order.order_number).trim()
      ) {
        throw new Error(
          "Paynow reference does not match order reference."
        );
      }

      const amountCents = amountToCents(paynow.amount);

      if (amountCents === null) {
        throw new Error(
          "Paynow returned an invalid transaction amount."
        );
      }

      const status = getPaynowStatus(paynow);

      result.paynowStatus = status;

      const { data: currentOrder, error: orderError } =
        await supabaseAdmin
          .from("orders")
          .select("id,total_cents,status")
          .eq("id", order.id)
          .single();

      if (orderError) {
        throw new Error(
          `Unable to reload order: ${orderError.message}`
        );
      }

      if (currentOrder.status !== "pending_payment") {
        result.outcome =
          currentOrder.status === "paid"
            ? "already_paid"
            : "order_no_longer_pending";

        results.push(result);
        continue;
      }

      if (isPaidStatus(status)) {
        const paynowReference = String(
          paynow.paynowreference || ""
        ).trim();

        if (!paynowReference) {
          throw new Error(
            "Paid Paynow transaction has no Paynow reference."
          );
        }

        if (amountCents !== currentOrder.total_cents) {
          throw new Error(
            `Amount mismatch: Paynow ${amountCents} vs order ${currentOrder.total_cents}.`
          );
        }

        await confirmPayment(
          order.id,
          paynowReference,
          amountCents,
          paynow
        );

        result.outcome = "paid";
        results.push(result);
        continue;
      }

      if (isCancelledStatus(status)) {
        await releaseReservation(
          order.id,
          "payment-cancelled"
        );

        result.outcome = "released_cancelled";
        results.push(result);
        continue;
      }

      /*
       * Created / Sent:
       * The Paynow transaction still exists and may still be
       * payable. Do not destroy the reservation.
       *
       * Disputed / Refunded:
       * These states should not normally occur while our local
       * order is still pending. Leave the reservation intact
       * and surface the state for manual reconciliation.
       */
      if (status === "disputed" || status === "refunded") {
        result.outcome = "manual_review";
        results.push(result);
        continue;
      }

      result.outcome = "still_pending";
      results.push(result);
    } catch (error) {
      console.error(
        "reconcile_order_failed",
        order.order_number,
        error
      );

      result.outcome = "error";
      result.error = error.message;

      results.push(result);
    }
  }

  return json(res, 200, {
    ok: true,
    processed: results.length,
    results,
  });
}
