import Link from "next/link";
import { Suspense } from "react";
import { fetchItemIds } from "@/lib/scans";

const PIPELINE = ["capture", "align", "diff", "triage"];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-4 pb-16 pt-10 sm:pt-16">
      <header className="flex flex-col items-start gap-5">
        <span className="label flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
          iPhone LiDAR · 3D scan comparison
        </span>
        <h1 className="max-w-4xl text-4xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
          Tamper-evident evidence of condition{" "}
          <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">at handoff.</span>
        </h1>
        <p className="max-w-2xl text-base text-zinc-400 sm:text-lg">
          ScanDiff compares a baseline 3D scan with a later one and shows where the shape changed. It does not verify
          that an item is as advertised.
        </p>
        <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-zinc-400">
          {PIPELINE.map((step, i) => (
            <span key={step} className="flex items-center gap-1.5">
              <span className={i === PIPELINE.length - 1 ? "text-accent" : "text-zinc-200"}>{step}</span>
              {i < PIPELINE.length - 1 && <span className="text-zinc-600">→</span>}
            </span>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          Phone LiDAR measures shape, not color, so scuffs and stains are not detected.{" "}
          {process.env.NEXT_PUBLIC_DIFF_API_URL
            ? "Comparisons come from the ScanDiff engine. Item names, prices and timestamps are demo data."
            : "All data on this site is mock data."}
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <DemoCard
          href="/checkout/mug-001"
          tag="Shipping and returns"
          title="Demo checkout"
          body="Payment held until the buyer approves the comparison. Demo only, no real payment."
          wide
        />
        <DemoCard href="/item/car-001" tag="Rental car" title="Pickup and return" body="Compare the pickup scan with the return scan." />
        <DemoCard href="/item/mug-001" tag="Viewer" title="Mug comparison" body="Heat map, histogram and flagged regions." />
      </section>

      <Suspense fallback={<p className="label">Loading scanned items…</p>}>
        <ScannedItems />
      </Suspense>
    </main>
  );
}

function DemoCard({ href, tag, title, body, wide }: { href: string; tag: string; title: string; body: string; wide?: boolean }) {
  return (
    <Link href={href} className={`panel group flex min-h-40 flex-col justify-between gap-6 ${wide ? "md:col-span-1" : ""}`}>
      <span className="label">{tag}</span>
      <div>
        <div className="flex items-center justify-between gap-2 text-xl font-semibold tracking-tight">
          {title}
          <span className="text-accent transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">↗</span>
        </div>
        <p className="mt-1 text-sm text-zinc-400">{body}</p>
      </div>
    </Link>
  );
}

/** Items the iOS app has uploaded to Supabase. */
async function ScannedItems() {
  let ids: string[];
  try {
    ids = await fetchItemIds();
  } catch (e) {
    return <p className="text-sm text-red-400">{e instanceof Error ? e.message : String(e)}</p>;
  }
  if (ids.length === 0) return null;
  return (
    <section>
      <h2 className="label mb-2">Scanned with the iPhone app</h2>
      <ol className="border-t border-white/10">
        {ids.map((id, i) => (
          <li key={id}>
            <Link
              href={`/item/${encodeURIComponent(id)}`}
              className="group flex items-baseline gap-4 border-b border-white/10 py-4 transition-colors hover:bg-white/[0.02]"
            >
              <span className="w-6 font-mono text-xs text-zinc-600">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1 truncate text-2xl font-medium tracking-tight sm:text-3xl">{id}</span>
              <span className="font-mono text-xs text-zinc-500 group-hover:text-accent">open ↗</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
