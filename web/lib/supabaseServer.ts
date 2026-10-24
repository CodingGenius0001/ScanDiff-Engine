/**
 * Supabase for server components and route handlers, signed in as the user
 * whose session cookie came with the request. Uses the publishable key, never
 * a service-role key, so reads stay under row-level security.
 */
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "./supabaseConfig";

export async function serverSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured) return null;
  // Request time only: the session check reads the clock (Date.now), which Next refuses
  // while prerendering, even once cookies are available.
  await connection();
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server components cannot set cookies. proxy.ts refreshes the session before the render.
        }
      },
    },
  });
}

/** The signed-in user's email (or id), checked with Supabase Auth; null when signed out. */
export async function currentUser(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  return claims ? ((claims.email as string | undefined) ?? claims.sub) : null;
}
