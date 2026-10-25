import Link from "next/link";
import { Suspense } from "react";
import HeroScan from "@/components/HeroScan";
import { COLORS, RAMP_CSS } from "@/lib/heatmap";
import { fetchItemIds } from "@/lib/scans";
import { currentUser, serverSupabase } from "@/lib/supabaseServer";

const DEMOS = [
  { href: "/sell", title: "List an item and run a real checkout", note: "Seller baseline, buyer check scan, comparison, then the payment is released or disputed. Uses the iPhone app." },
  { href: "/checkout/mug-001", title: "Demo checkout", note: "Shipping and returns. Payment held until the buyer approves. Demo only, no real payment." },
  { href: "/item/mug-001", title: "Handmade ceramic mug", note: "Seller scan before packing, buyer scan on arrival." },
  { href: "/item/car-001", title: "Rental car", note: "Pickup scan and return scan." },
];

const SPECS: [string, string][] = [
  ["capture", "iPhone LiDAR, guided loop"],
  ["compare", "aligned, point to surface"],
  ["fingerprint", "SHA-256 on every file"],
  ["decision", "accept or dispute"],
];

const STEPS: [string, string][] = [
  ["Baseline at handoff", "Before packing or lending it, the seller scans the item with the ScanDiff iPhone app. Every file is fingerprinted and uploaded."],
  ["Check-in on arrival", "The buyer or renter scans the same item when it arrives or comes back. A QR code opens the app on the right item."],
  ["Comparison", "The engine aligns the two scans and measures how far the surface moved, region by region."],
  ["Decision", "Accept releases the demo payment. A dispute keeps it held, with a printable evidence record for both sides."],
];

export default function Home() {
  return (
    <main className="flex w-full flex-col pb-24">
      <section className="relative isolate overflow-hidden border-b border-rule">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_55%_65%_at_68%_30%,#353534_0%,#141414_55%,#0b0b0b_100%)]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[44vh] md:inset-y-0 md:left-auto md:h-auto md:w-[62%]">
          <HeroScan />
        </div>
        <div className="mx-auto flex min-h-[78vh] max-w-6xl flex-col justify-end gap-8 px-4 pb-10 pt-[46vh] md:pt-24">
          <div className="max-w-xl">
            <h1 className="display text-[56px] sm:text-[88px]">
              every handoff,
              <br />
              <span className="text-ink-soft">measured.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-soft">
              ScanDiff compares a 3D scan taken before an item changes hands with one taken after, and shows exactly
              where its shape changed. Tamper-evident evidence of condition at handoff. It does not verify that an item
              is as advertised.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/sell" className="key min-h-12 bg-ink px-6 font-medium text-paper">
                List an item
              </Link>
              <Link href="/item/mug-001" className="flex min-h-12 items-center rounded-md border border-rule px-5 text-ink-soft transition-colors hover:border-ink-faint hover:text-ink">
                See a comparison →
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-ink-faint">
            <span>Example: handmade mug, arrival scan against the seller&apos;s baseline. Mock data.</span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-sm" style={{ background: COLORS.noChange }} /> unchanged
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-12 rounded-sm" style={{ background: RAMP_CSS }} /> changed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-sm border border-[#dc2626] bg-[#dc2626]/45" /> missing
              </span>
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 pt-10">
        <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-rule md:grid-cols-4">
          {SPECS.map(([k, v], i) => (
            <div key={k} className={`flex flex-col gap-1 bg-[var(--panel)] p-4 ${i % 2 ? "border-l border-rule" : ""} ${i > 1 ? "border-t border-rule md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}>
              <dt className="font-mono text-[11px] text-ink-faint">{String(i + 1).padStart(2, "0")} · {k}</dt>
              <dd className="text-[15px]">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="caption">The problem</p>
            <h2 className="display mt-2 text-4xl sm:text-5xl">Condition disputes come down to one word against another.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
              Resale, rentals and returns all ask someone to trust the other side about an item&apos;s condition. The
              usual evidence is a few photos: angles someone chose, depth flattened so a small dent can vanish under the
              wrong light, and nothing tying them to the moment of handoff.
            </p>
          </div>
          <div>
            <p className="caption">What ScanDiff does</p>
            <ol className="mt-3 flex flex-col">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-t border-rule py-4">
                  <span className="font-mono text-xs text-stamp">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <span className="block text-lg">{title}</span>
                    <span className="mt-1 block text-sm text-ink-soft">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="caption mt-2">
              LiDAR measures shape, not color, so scuffs and stains are not detected. Areas only one scan saw are
              reported as no data, never as damage.
            </p>
          </div>
        </section>

        <Suspense fallback={<p className="caption">Loading case files…</p>}>
          <ScannedItems />
        </Suspense>

        <Index title="Demonstrations" note={process.env.NEXT_PUBLIC_DIFF_API_URL ? "Item names, prices and timestamps are demo data." : "All data on this site is mock data."}>
          {DEMOS.map((d, i) => (
            <Row key={d.href} n={i + 1} href={d.href} title={d.title} note={d.note} />
          ))}
        </Index>
      </div>
    </main>
  );
}

function Index({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="display text-4xl">{title}</span>
        {note && <span className="caption">{note}</span>}
      </h2>
      <ol className="overflow-hidden rounded-md border border-rule">{children}</ol>
    </section>
  );
}

function Row({ n, href, title, note }: { n: number; href: string; title: string; note?: string }) {
  return (
    <li className="border-t border-rule first:border-t-0">
      <Link
        href={href}
        className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 bg-[var(--panel)] px-4 py-4 transition-colors hover:bg-paper-deep"
      >
        <span className="font-mono text-xs text-ink-faint">{String(n).padStart(3, "0")}</span>
        <span className="min-w-0">
          <span className="block text-xl font-light transition-colors group-hover:text-ink sm:text-2xl">{title}</span>
          {note && <span className="mt-0.5 block text-sm text-ink-soft">{note}</span>}
        </span>
        <span className="flex items-center gap-2 text-sm text-ink-faint transition-colors group-hover:text-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-rule transition-colors group-hover:bg-stamp" aria-hidden />
          open
        </span>
      </Link>
    </li>
  );
}

/** The signed-in user's case files, as seller or buyer. Row-level security leaves out everyone else's. */
async function ScannedItems() {
  const db = await serverSupabase();
  if (!db) return null;
  if (!(await currentUser(db))) {
    return (
      <p className="flex items-center gap-3 rounded-md border border-rule bg-[var(--panel)] px-4 py-3 text-sm text-ink-soft">
        <span className="h-1.5 w-1.5 rounded-full bg-stamp" aria-hidden />
        <span>
          <Link href="/login" className="text-ink underline underline-offset-4">
            Sign in
          </Link>{" "}
          to see your case files scanned with the iPhone app.
        </span>
      </p>
    );
  }
  let ids: string[];
  try {
    ids = await fetchItemIds(db);
  } catch (e) {
    return <p className="text-sm text-stamp">{e instanceof Error ? e.message : String(e)}</p>;
  }
  if (ids.length === 0) {
    return (
      <p className="rounded-md border border-rule bg-[var(--panel)] px-4 py-3 text-sm text-ink-soft">
        No case files yet. Items you list or scan, and items shared with you, show up here.
      </p>
    );
  }
  return (
    <Index title="Your case files" note="Items you listed or scanned, and items shared with you.">
      {ids.map((id, i) => (
        <Row key={id} n={i + 1} href={`/item/${encodeURIComponent(id)}`} title={id} />
      ))}
    </Index>
  );
}
