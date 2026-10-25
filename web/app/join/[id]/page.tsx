import { redirect } from "next/navigation";
import { Suspense } from "react";
import NoAccess from "@/components/NoAccess";
import SignInPrompt from "@/components/SignInPrompt";
import { joinItem } from "@/lib/access";
import { currentUser, serverSupabase } from "@/lib/supabaseServer";

// Reads the session and redirects on every request: nothing to prerender or prefetch.
export const instant = false;

/**
 * A share link: /join/<item>?code=<invite code>&to=checkout|item. Adds the
 * signed-in user to the item, then opens its checkout or comparison page.
 * Signed out, it asks for sign-in and comes back here. Joining twice is fine.
 */
export default function JoinPage({ params, searchParams }: PageProps<"/join/[id]">) {
  return (
    <Suspense fallback={null}>
      {Promise.all([params, searchParams]).then(async ([{ id }, query]) => {
        const code = typeof query.code === "string" ? query.code : "";
        const to = query.to === "checkout" ? "checkout" : "item";
        const db = await serverSupabase();
        if (!db) return <NoAccess itemId={id} reason="This site is not connected to the scan database." />;
        if (!(await currentUser(db))) {
          const back = `/join/${encodeURIComponent(id)}?code=${encodeURIComponent(code)}&to=${to}`;
          return <SignInPrompt next={back} />;
        }
        try {
          await joinItem(db, id, code);
        } catch (e) {
          return <NoAccess itemId={id} reason={e instanceof Error ? e.message : String(e)} />;
        }
        redirect(`/${to}/${encodeURIComponent(id)}`);
      })}
    </Suspense>
  );
}
