import { requireAdmin } from "../../lib/admin-auth.js";
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
    const result = await requireAdmin(req);

    if (!result.ok) {
      return json(res, result.status, {
        ok: false,
        error: result.error,
      });
    }

    return json(res, 200, {
      ok: true,
      user: result.user,
    });
  } catch (error) {
    console.error("Admin session error:", error);

    return json(res, 500, {
      ok: false,
      error: "Unable to verify admin session.",
    });
  }
}
