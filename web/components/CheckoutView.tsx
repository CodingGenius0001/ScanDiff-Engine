"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, formatPrice } from "@/lib/format";
import { pay, resetOrder, statusAt, uploadScan, useOrder, type OrderStatus } from "@/lib/orderStatus";
import type { Item } from "@/lib/types";
import { useComparison } from "@/lib/useComparison";
import DemoBadge from "./DemoBadge";
import Fingerprint from "./Fingerprint";
import StatusPill from "./StatusPill";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "listed", label: "Listed" },
  { status: "held_scan_required", label: "Held" },
  { status: "scan_uploaded", label: "Scan uploaded" },
  { status: "released", label: "Released" },
];

export default function CheckoutView({ item }: { item: Item }) {
  const order = useOrder(item.id, item.kind);
  const router = useRouter();
  const price = item.priceCents ?? 0;
  const stepIndex = order.status === "disputed" ? 2 : STEPS.findIndex((s) => s.status === order.status);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        <Link href="/" className="text-xs font-semibold text-zinc-500 underline">
          ScanDiff
        </Link>
        <DemoBadge className="w-fit text-sm" />
        <p className="text-xs text-zinc-500">
          Fake marketplace listing for a demo. No card is charged, nothing is held or released, and there is no Apple
          Pay or Visa integration.
        </p>
      </header>

      <section className="flex gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <MugIcon />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold sm:text-xl">{item.title}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Sold by Demo Pottery Co. · Scanned before packing</p>
          <p className="mt-2 text-2xl font-bold">{formatPrice(price)}</p>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Order status</h2>
          <StatusPill status={order.status} kind={item.kind} />
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px] sm:text-xs">
          {STEPS.map((s, i) => (
            <li key={s.status} className="flex flex-col items-center gap-1">
              <span
                className={`h-2 w-full rounded-full ${i <= stepIndex ? "bg-zinc-900 dark:bg-white" : "bg-zinc-200 dark:bg-zinc-700"}`}
              />
              <span className={i === stepIndex ? "font-semibold" : "text-zinc-500"}>{s.label}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-col gap-3">
          {order.status === "listed" && (
            <>
              <button
                type="button"
                onClick={() => pay(item.id, item.kind)}
                className="min-h-12 rounded-lg bg-blue-800 px-4 text-base font-semibold text-white hover:bg-blue-900"
              >
                Pay with Visa (demo)
              </button>
              <p className="text-xs text-zinc-500">
                In this demo the payment is held until the buyer scans the item on arrival and approves the comparison.
              </p>
            </>
          )}
          {order.status === "held_scan_required" && (
            <>
              <p className="text-sm">
                Payment of {formatPrice(price)} is <strong>held: scan required</strong>. When the parcel arrives, the
                buyer scans the item with the ScanDiff iOS app.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (uploadScan(item.id, item.kind)) router.push(`/item/${item.id}`);
                }}
                className="min-h-12 rounded-lg bg-zinc-900 px-4 font-semibold text-white dark:bg-white dark:text-zinc-900"
              >
                Simulate: buyer scan uploaded
              </button>
            </>
          )}
          {order.status === "scan_uploaded" && (
            <>
              <p className="text-sm">The buyer&apos;s scan is uploaded. Review the comparison to accept or dispute.</p>
              <Link
                href={`/item/${item.id}`}
                className="flex min-h-12 items-center justify-center rounded-lg bg-zinc-900 px-4 font-semibold text-white dark:bg-white dark:text-zinc-900"
              >
                Open comparison
              </Link>
            </>
          )}
          {order.status === "released" && <Receipt item={item} releasedAt={statusAt(order, "released")} heldAt={statusAt(order, "held_scan_required")} />}
          {order.status === "disputed" && (
            <p className="text-sm">
              The buyer disputed the comparison. Payment stays held (demo).{" "}
              <Link href={`/item/${item.id}/evidence`} className="font-semibold underline">
                Open the evidence page
              </Link>
            </p>
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={() => resetOrder(item.id, item.kind)}
        className="min-h-11 self-start rounded-lg border border-zinc-300 px-3 text-sm font-semibold dark:border-zinc-700"
      >
        Reset demo
      </button>
    </main>
  );
}

function Receipt({ item, releasedAt, heldAt }: { item: Item; releasedAt?: string; heldAt?: string }) {
  const comparison = useComparison(item, false);
  const scans = comparison.status === "ready" ? [comparison.data.diff.baseScan, comparison.data.diff.newScan] : [];
  const receiptId = `DEMO-${item.id.toUpperCase()}-${releasedAt ? new Date(releasedAt).getTime().toString(36).toUpperCase() : "0"}`;
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50">
      <h3 className="text-base font-bold">Receipt: payment released (demo)</h3>
      <DemoBadge className="my-2 w-fit" />
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="text-xs opacity-75">Receipt</dt>
          <dd className="font-mono text-xs font-semibold">{receiptId}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-75">Amount</dt>
          <dd className="font-semibold">{formatPrice(item.priceCents ?? 0)}</dd>
        </div>
        {heldAt && (
          <div>
            <dt className="text-xs opacity-75">Held</dt>
            <dd>{formatDate(heldAt)}</dd>
          </div>
        )}
        {releasedAt && (
          <div>
            <dt className="text-xs opacity-75">Released after buyer approval</dt>
            <dd>{formatDate(releasedAt)}</dd>
          </div>
        )}
      </dl>
      <div className="mt-2 flex flex-col gap-1">
        {scans.map((s) => (
          <div key={s.id}>
            <div className="text-xs opacity-75">{s.name}, SHA-256 fingerprint</div>
            <Fingerprint sha256={s.sha256} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs opacity-75">
        Evidence of condition at handoff only. This receipt does not verify that the item is as advertised.
      </p>
    </div>
  );
}

function MugIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-20 w-20 shrink-0 rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800" aria-hidden>
      <path d="M12 14h32v30a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10z" fill="#a1a1aa" />
      <path d="M44 22h4a8 8 0 0 1 0 16h-4" fill="none" stroke="#a1a1aa" strokeWidth="5" />
      <ellipse cx="28" cy="14" rx="16" ry="3" fill="#71717a" />
    </svg>
  );
}
