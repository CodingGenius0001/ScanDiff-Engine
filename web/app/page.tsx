import Link from "next/link";
import { Suspense } from "react";
import HeroScan from "@/components/HeroScan";
import { COLORS, RAMP_CSS } from "@/lib/heatmap";
import { fetchItemIds } from "@/lib/scans";
import { currentUser, serverSupabase } from "@/lib/supabaseServer";

const DEMOS = [
  { href: "/sell", title: "Run a live handoff", note: "List an item, scan it with the iPhone app before and after, and watch the payment release or stay held." },
  { href: "/checkout/mug-001", title: "Demo checkout: shipping and returns", note: "The payment is held until the buyer approves the arrival scan. Demo only, no real payment." },
  { href: "/item/mug-001", title: "Ceramic mug: a dent and a broken handle", note: "Seller scan before packing against the buyer's scan on arrival." },
  { href: "/item/car-001", title: "Rental car: a door dent and a missing mirror", note: "Pickup scan at the desk against the return scan." },
];

const SPECS: [string, string][] = [
  ["Capture", "LiDAR on an iPhone Pro, guided"],
  ["Measure", "Shape change down to a few mm"],
  ["Seal", "SHA-256 on every file"],
  ["Settle", "Accept releases, dispute holds"],
];

const STEPS: [string, string][] = [
  ["Scan before it leaves", "The seller scans the item with the ScanDiff iPhone app before it ships or is lent out. Every file is fingerprinted on the phone."],
  ["Scan when it lands", "The buyer or renter scans it again on arrival. A QR code opens the app on the right item."],
  ["See exactly what changed", "The engine aligns the two scans and measures how far every part of the surface moved. Dents light up; missing pieces show as a red ghost."],
  ["Settle it", "Accept, and the payment is released. Dispute, and it stays held, with a printable evidence record both sides can check."],
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
            <h1 className="display text-[60px] sm:text-[92px]">
              measured,
              <br />
              <span className="text-ink-soft">not argued.</span>
            </h1>
            <p className="mt-6 max-w-md text-xl leading-snug">
              Settle &ldquo;it arrived broken&rdquo; with millimeters, not photos.
            </p>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft">
              Scan the item with an iPhone before it changes hands and again when it arrives. ScanDiff aligns the two 3D
              scans, shows exactly where the shape changed, and fingerprints every file, so any later edit to the record
              shows. Tamper-evident evidence of condition at handoff; it does not verify that an item is as advertised.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/sell" className="key min-h-12 bg-ink px-6 font-medium text-paper">
                List an item
              </Link>
              <Link href="/item/mug-001" className="flex min-h-12 items-center rounded-md border border-rule px-5 text-ink-soft transition-colors hover:border-ink-faint hover:text-ink">
                See it catch a dent →
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
              <dt className="text-xs text-ink-faint">{k}</dt>
              <dd className="text-[15px]">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="display text-4xl sm:text-5xl">Photos can&apos;t settle a condition dispute.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
              Resale, rentals and returns all run on trust about an item&apos;s condition. When something breaks, both
              sides hold a few photos: angles they chose, depth flattened so a dent can vanish under the wrong light, and
              nothing tying them to the moment the item changed hands. It comes down to one word against another, and
              someone eats the loss.
            </p>
          </div>
          <div>
            <h2 className="display text-4xl sm:text-5xl">ScanDiff measures it instead.</h2>
            <ol className="mt-5 flex flex-col">
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
          {DEMOS.map((d) => (
            <Row key={d.href} href={d.href} title={d.title} note={d.note} />
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

function Row({ href, title, note }: { href: string; title: string; note?: string }) {
  return (
    <li className="border-t border-rule first:border-t-0">
      <Link
        href={href}
        className="group grid grid-cols-[1fr_auto] items-center gap-x-4 bg-[var(--panel)] px-4 py-4 transition-colors hover:bg-paper-deep"
      >
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

/** Case files the iOS app has uploaded to Supabase, read as the signed-in user. */
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
          to see the case files scanned with the iPhone app.
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
  if (ids.length === 0) return null;
  return (
    <Index title="Case files" note="Scanned with the iPhone app.">
      {ids.map((id) => (
        <Row key={id} href={`/item/${encodeURIComponent(id)}`} title={id} />
      ))}
    </Index>
  );
}
