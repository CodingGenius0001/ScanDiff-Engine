"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserSupabase } from "@/lib/supabase";

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

export default function LoginForm({ next, error: initialError }: { next: string; error?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "password" | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function google() {
    const db = browserSupabase();
    if (!db) return setError("Supabase is not configured for this site.");
    setBusy("google");
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    // On success the browser is already leaving for Google.
    if (error) {
      setError(error.message);
      setBusy(null);
    }
  }

  async function signIn(withEmail: string, withPassword: string) {
    const db = browserSupabase();
    if (!db) return setError("Supabase is not configured for this site.");
    setBusy("password");
    setError(null);
    const { error } = await db.auth.signInWithPassword({ email: withEmail, password: withPassword });
    if (error) {
      setError(error.message);
      setBusy(null);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={google}
        disabled={busy !== null}
        className="min-h-12 rounded-md border border-rule px-5 font-semibold transition-colors hover:bg-ink hover:text-paper disabled:opacity-40"
      >
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>

      {DEMO_EMAIL && DEMO_PASSWORD && (
        <button
          type="button"
          onClick={() => signIn(DEMO_EMAIL, DEMO_PASSWORD)}
          disabled={busy !== null}
          className="min-h-12 key bg-ink px-5 font-semibold text-paper disabled:opacity-40"
        >
          {busy === "password" ? "Signing in…" : "Use the demo account"}
        </button>
      )}

      <form
        className="flex flex-col gap-3 border-t border-rule pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void signIn(email, password);
        }}
      >
        <p className="caption">Or with an email and password</p>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-md border border-rule bg-paper px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 rounded-md border border-rule bg-paper px-3"
          />
        </label>
        <button type="submit" disabled={busy !== null} className="min-h-11 rounded-md border border-rule px-5 font-semibold disabled:opacity-40">
          Sign in
        </button>
      </form>

      {error && (
        <p role="alert" className="border-l-2 border-stamp pl-3 text-sm text-stamp">
          {error}
        </p>
      )}
    </div>
  );
}
