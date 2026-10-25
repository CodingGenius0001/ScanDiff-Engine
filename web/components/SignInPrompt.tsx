import Link from "next/link";

/** Shown instead of a real item when nobody is signed in: scans are read as a signed-in user only. */
export default function SignInPrompt({ next }: { next: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-16">
      <p className="caption">Case file</p>
      <h1 className="display text-5xl">Sign in to open this case file.</h1>
      <p className="text-ink-soft">
        Scans uploaded from the iPhone app are read as a signed-in user, through the database&apos;s row-level security.
      </p>
      <Link
        href={`/login?next=${encodeURIComponent(next)}`}
        className="min-h-12 w-fit key bg-ink px-6 font-semibold text-paper"
      >
        Sign in
      </Link>
    </main>
  );
}
