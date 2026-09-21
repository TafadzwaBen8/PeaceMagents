import { json } from "../lib/http.js";

export default function handler(req, res) {
  console.log("DEBUG env check:", {
    hasUrl: !!process.env.SUPABASE_URL,
    hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
    cwd: process.cwd(),
  });

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed.",
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return json(res, 500, {
      ok: false,
      error: "Public Supabase configuration is not configured.",
    });
  }

  return json(res, 200, {
    ok: true,
    supabaseUrl,
    supabaseAnonKey,
  });
}
