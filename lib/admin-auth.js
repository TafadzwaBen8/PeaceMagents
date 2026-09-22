import { supabaseAdmin } from "./supabase.js";

export function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function requireAdmin(req) {
  const token = getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Authentication required.",
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return {
      ok: false,
      status: 401,
      error: "Invalid or expired authentication session.",
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profile || profile.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Admin access required.",
    };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email || null,
      fullName: profile.full_name || null,
      role: profile.role,
    },
  };
}
