"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase";

/** "Sign in", or the signed-in email with "Sign out". Blank until the session is known. */
export default function AccountLink() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const db = browserSupabase();
    if (!db) return;
    const { data } = db.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? (session ? "Signed in" : null)));
    return () => data.subscription.unsubscribe();
  }, []);

  if (email === undefined) return null;
  if (email === null) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="flex flex-col leading-tight hover:text-ink">
        <span className="text-[15px]">sign in</span>
        <span className="hidden text-[11px] text-ink-faint sm:block">google or email</span>
      </Link>
    );
  }
  return (
    <button
      type="button"
      title={`Signed in as ${email}`}
      className="flex flex-col items-start leading-tight hover:text-ink"
      onClick={async () => {
        await browserSupabase()?.auth.signOut();
        router.refresh();
      }}
    >
      <span className="text-[15px]">sign out</span>
      <span className="hidden max-w-40 truncate text-[11px] text-ink-faint sm:block">{email}</span>
    </button>
  );
}
