/**
 * Refreshes the Supabase session cookie before each page render, so server
 * components read as a signed-in user whose access token has not expired.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "./lib/supabaseConfig";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Signed out: nothing to refresh, and no call to Supabase.
  if (!supabaseConfigured || !request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
  // Refreshes an expired access token. Who the user is gets checked where data is read.
  await supabase.auth.getSession();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|glb|ico)$).*)"],
};
