/**
 * Google sign-in returns here with a one-time code. Exchanging it stores the
 * session in cookies, then the browser goes back to the page it came from.
 */
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safeNext";
import { serverSupabase } from "@/lib/supabaseServer";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const db = await serverSupabase();
  let message = url.searchParams.get("error_description") ?? "Google sign-in did not return a code.";
  if (code && db) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    message = error.message;
  }
  const back = new URL("/login", url.origin);
  back.searchParams.set("next", next);
  back.searchParams.set("error", message);
  return NextResponse.redirect(back);
}
