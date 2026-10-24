import Link from "next/link";
import { Suspense } from "react";
import { fetchItemIds } from "@/lib/scans";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold">ScanDiff</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Compares a baseline 3D scan with a later scan and shows where the shape changed. ScanDiff provides
          tamper-evident evidence of condition at handoff. It does not verify that an item is as advertised.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Phone LiDAR measures shape, not color, so scuffs and stains are not detected.{" "}
          {process.env.NEXT_PUBLIC_DIFF_API_URL
            ? "Comparisons come from the ScanDiff engine. Item names, prices and timestamps are demo data."
            : "All data on this site is mock data."}
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/checkout/mug-001"
          className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shipping and returns</div>
          <div className="mt-1 text-lg font-semibold">Demo checkout: ceramic mug</div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Payment held until the buyer approves the comparison. Demo only, no real payment.
          </p>
        </Link>
        <Link
          href="/item/car-001"
          className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Rental car</div>
          <div className="mt-1 text-lg font-semibold">Pickup and return timeline</div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Compare the pickup scan with the return scan.</p>
        </Link>
        <Link
          href="/item/mug-001"
          className="rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 sm:col-span-2 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="text-lg font-semibold">Open the mug comparison directly</div>
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading scanned items…</p>}>
        <ScannedItems />
      </Suspense>
    </main>
  );
}

/** Items the iOS app has uploaded to Supabase. */
async function ScannedItems() {
  let ids: string[];
  try {
    ids = await fetchItemIds();
  } catch (e) {
    return <p className="text-sm text-red-700">{e instanceof Error ? e.message : String(e)}</p>;
  }
  if (ids.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-zinc-500">Scanned with the iPhone app</h2>
      <ul className="flex flex-col gap-2">
        {ids.map((id) => (
          <li key={id}>
            <Link
              href={`/item/${encodeURIComponent(id)}`}
              className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 font-semibold hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {id}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
