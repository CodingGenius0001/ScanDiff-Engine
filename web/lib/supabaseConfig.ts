/**
 * Supabase URL and key, shared by the browser client, the server client and
 * proxy.ts. Only the publishable (anon) key may be used: a secret or
 * service-role key bypasses row-level security, and anything NEXT_PUBLIC_
 * ends up in the browser bundle.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const supabaseConfigured = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

/** The `role` claim of a legacy JWT key ("anon" or "service_role"), or null for the newer sb_ keys. */
function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

if (SUPABASE_KEY.startsWith("sb_secret_") || jwtRole(SUPABASE_KEY) === "service_role") {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is a secret (service role) key. It would be shipped to every browser " +
      "and bypass row-level security. Use the publishable key instead.",
  );
}
