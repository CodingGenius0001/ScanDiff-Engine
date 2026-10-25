/**
 * The browser's Supabase client. It keeps the signed-in session in cookies,
 * so server renders (lib/supabaseServer.ts) read as the same user and every
 * query goes through row-level security as that user. Null when the env vars
 * are missing, so the app still runs on the mock catalog alone.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "./supabaseConfig";

let client: SupabaseClient | null = null;

/** Call from effects and event handlers only; it needs the browser's cookies. */
export function browserSupabase(): SupabaseClient | null {
  if (!supabaseConfigured || typeof window === "undefined") return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
