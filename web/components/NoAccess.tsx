import Link from "next/link";

/** Shown for a real item that belongs to other accounts, or a share link that did not work. */
export default function NoAccess({ itemId, reason }: { itemId: string; reason?: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-16">
      <p className="caption">Case file {itemId}</p>
      <h1 className="display text-5xl">This case file isn&apos;t shared with you.</h1>
      <p className="text-ink-soft">
        {reason ?? "It belongs to another account."} Ask the seller for the item&apos;s share link, then open it while
        signed in. If you opened it with a different account, sign out and sign in with that one.
      </p>
      <Link href="/" className="min-h-12 w-fit key bg-ink px-6 font-semibold text-paper">
        Your case files
      </Link>
    </main>
  );
}
