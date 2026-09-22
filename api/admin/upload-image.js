import { requireAdmin } from "../../lib/admin-auth.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { json, methodNotAllowed } from "../../lib/http.js";

const BUCKET = "product-images";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const auth = await requireAdmin(req);

    if (!auth.ok) {
      return json(res, auth.status, {
        ok: false,
        error: auth.error,
      });
    }

    const contentType = req.headers["content-type"] || "";

    if (!ALLOWED_TYPES.has(contentType)) {
      return json(res, 400, {
        ok: false,
        error: "Only JPEG, PNG or WebP images are allowed.",
      });
    }

    const buffer = await readRawBody(req);

    if (buffer.length === 0) {
      return json(res, 400, { ok: false, error: "No image data received." });
    }

    if (buffer.length > MAX_BYTES) {
      return json(res, 400, { ok: false, error: "Image must be under 5MB." });
    }

    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType, upsert: false });

    if (uploadError) {
      console.error("Image upload error:", uploadError);
      return json(res, 500, { ok: false, error: "Unable to upload image." });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    return json(res, 200, { ok: true, url: publicUrlData.publicUrl });
  } catch (error) {
    console.error("Upload-image error:", error);
    return json(res, 500, { ok: false, error: "Unable to upload image." });
  }
}