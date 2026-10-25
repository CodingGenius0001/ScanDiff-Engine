import Link from "next/link";
import { Suspense } from "react";
import { fetchItemIds } from "@/lib/scans";
import { currentUser, serverSupabase } from "@/lib/supabaseServer";

const DEMOS = [
  { href: "/sell", title: "Pitch: list an item and run a real checkout", note: "Seller baseline, buyer check scan, comparison, then the payment is released or disputed. Uses the iPhone app." },
  { href: "/checkout/mug-001", title: "Demo checkout", note: "Shipping and returns. Payment held until the buyer approves. Demo only, no real payment." },
  { href: "/item/mug-001", title: "Handmade ceramic mug", note: "Seller scan before packing, buyer scan on arrival." },
  { href: "/item/car-001", title: "Rental car", note: "Pickup scan and return scan." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 pb-20 pt-12 sm:pt-20">
      <header className="grid gap-8 md:grid-cols-[1fr_18rem] md:items-end">
        <h1 className="display text-5xl sm:text-7xl">
          Tamper-evident evidence of condition <em>at handoff.</em>
        </h1>
        <div className="flex flex-col gap-3 border-l border-ink pl-4 text-sm text-ink-soft">
          <p>
            ScanDiff compares a baseline 3D scan with a later one and records where the shape changed. It does not
            verify that an item is as advertised.
          </p>
          <p className="caption">
            Phone LiDAR measures shape, not color, so scuffs and stains are not detected.{" "}
            {process.env.NEXT_PUBLIC_DIFF_API_URL
              ? "Comparisons come from the ScanDiff engine. Item names, prices and timestamps are demo data."
              : "All data on this site is mock data."}
          </p>
        </div>
      </header>

      <Suspense fallback={<p className="caption">Loading case files…</p>}>
        <ScannedItems />
      </Suspense>

      <Index title="Demonstrations">
        {DEMOS.map((d, i) => (
          <Row key={d.href} n={i + 1} href={d.href} title={d.title} note={d.note} />
        ))}
      </Index>
    </main>
  );
}

function Index({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline justify-between border-b border-ink pb-2">
        <span className="display text-3xl">{title}</span>
      </h2>
      <ol>{children}</ol>
    </section>
  );
}

function Row({ n, href, title, note }: { n: number; href: string; title: string; note?: string }) {
  return (
    <li>
      <Link href={href} className="group grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-3 border-b border-rule py-4">
        <span className="font-mono text-xs text-ink-faint">{String(n).padStart(3, "0")}</span>
        <span className="min-w-0">
          <span className="display block truncate text-2xl group-hover:italic sm:text-3xl">{title}</span>
          {note && <span className="mt-0.5 block text-sm text-ink-soft">{note}</span>}
        </span>
        <span className="text-sm text-ink-soft group-hover:text-ink">Open →</span>
      </Link>
    </li>
  );
}

/** Case files the iOS app has uploaded to Supabase, read as the signed-in user. */
async function ScannedItems() {
  const db = await serverSupabase();
  if (!db) return null;
  if (!(await currentUser(db))) {
    return (
      <p className="border-l border-ink pl-4 text-sm text-ink-soft">
        <Link href="/login" className="font-semibold text-ink underline">
          Sign in
        </Link>{" "}
        to see the case files scanned with the iPhone app.
      </p>
    );
  }
  let ids: string[];
  try {
    ids = await fetchItemIds(db);
  } catch (e) {
    return <p className="text-sm text-stamp">{e instanceof Error ? e.message : String(e)}</p>;
  }
  if (ids.length === 0) return null;
  return (
    <Index title="Case files, scanned with the iPhone app">
      {ids.map((id, i) => (
        <Row key={id} n={i + 1} href={`/item/${encodeURIComponent(id)}`} title={id} />
      ))}
    </Index>
  );
}
