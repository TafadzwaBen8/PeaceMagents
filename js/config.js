/**
 * PeaceMagents — site configuration.
 *
 * Replace the placeholder values below with the real ones before you
 * deploy. Nothing else in the codebase needs to change.
 */

export const SELLER = {
  // Full international format, no spaces, no "+" — e.g. Zimbabwe: 263 783 057 337
  whatsappNumber: "+263 783 057 337",
  email: "Jabulaniparkie8@icloud.com",
  // International format for tel: links — e.g. "+263 783 057 337"
  phone: "+263 783 057 337",
  instagram: "https://instagram.com/PEACE_MAGENTS",
};

/**
 * Local-only admin passcode, used by admin.html while there is no
 * real backend yet. This is NOT secure — it lives in a file the
 * browser downloads, so anyone who views source can read it. It's
 * only meant to stop casual access while you're testing on your own
 * machine.
 *
 * When the backend step happens, this gets replaced by a real
 * server-side check (an ADMIN_SECRET environment variable checked in
 * a serverless function, the way the rest of this project's backend
 * plan already works) — see HYBRID-PROJECT-PLAN.md.
 */
export const ADMIN_LOCAL_PASSCODE = "peacemagents-admin";

/** Stock count at or below this shows a "Low stock" badge instead of the exact number disappearing straight to "Sold out". */
export const LOW_STOCK_THRESHOLD = 3;
