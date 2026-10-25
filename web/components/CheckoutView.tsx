"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { pay, resetOrder, statusAt, uploadScan, useOrder, type OrderStatus } from "@/lib/orderStatus";
import type { Item } from "@/lib/types";
import { useComparison } from "@/lib/useComparison";
import DemoBadge from "./DemoBadge";
import DemoCardCheckout, { DEMO_CARD } from "./DemoCardCheckout";
import Fingerprint from "./Fingerprint";
import LocalTime from "./LocalTime";
import RefundNotice from "./RefundNotice";
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

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-12 pt-6 sm:pt-10">
      <header className="flex flex-col gap-2">
        <DemoBadge className="w-fit text-sm" />
        <p className="text-xs text-ink-soft">
          Fake marketplace listing for a demo. No card is charged, nothing is held or released, and there is no Apple
          Pay or Visa integration. A refund is recorded in Capital One&apos;s Nessie sandbox, which moves no real
          money.
        </p>
      </header>

      <section className="sheet flex gap-4">
        <MugIcon />
        <div className="min-w-0 flex-1">
          <h1 className="display text-3xl sm:text-4xl">{item.title}</h1>
          <p className="text-sm text-ink-soft">Sold by Demo Pottery Co. · Scanned before packing</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{formatPrice(price)}</p>
        </div>
      </section>

      <section className="sheet">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-3xl">Order status</h2>
          <StatusPill status={order.status} kind={item.kind} />
        </div>
        <OrderSteps status={order.status} />

        <div className="mt-4 flex flex-col gap-3">
          {order.status === "listed" && (
            <DemoCardCheckout
              title={item.title}
              seller="Demo Pottery Co."
              priceCents={price}
              onPay={() => pay(item.id, item.kind)}
            />
          )}
          {order.status === "held_scan_required" && (
            <>
              <p className="text-sm">
                Payment of {formatPrice(price)} from Visa •••• {DEMO_CARD.number.slice(-4)} is{" "}
                <strong>held: scan required</strong>. When the parcel arrives, the
                buyer scans the item with the ScanDiff iOS app.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (uploadScan(item.id, item.kind)) router.push(`/item/${item.id}`);
                }}
                className="min-h-12 key bg-ink px-5 font-semibold text-paper"
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
                className="min-h-12 key bg-ink px-5 font-semibold text-paper"
              >
                Open comparison
              </Link>
            </>
          )}
          {order.status === "released" && <Receipt item={item} releasedAt={statusAt(order, "released")} heldAt={statusAt(order, "held_scan_required")} />}
          {(order.status === "disputed" || order.status === "refunded") && (
            <>
              <p className="text-sm">
                {order.status === "refunded"
                  ? "The buyer disputed the comparison and was refunded (demo)."
                  : "The buyer disputed the comparison. Payment stays held (demo)."}{" "}
                <Link href={`/item/${item.id}/evidence`} className="font-semibold underline">
                  Open the evidence page
                </Link>
              </p>
              <RefundNotice item={item} />
            </>
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={() => resetOrder(item.id, item.kind)}
        className="min-h-11 self-start rounded-md border border-rule px-4 text-sm text-ink transition-colors hover:bg-ink hover:text-paper"
      >
        Reset demo
      </button>
    </main>
  );
}

/** Progress through the order. A dispute stops at "Scan uploaded"; a refund ends at "Refunded". */
export function OrderSteps({ status }: { status: OrderStatus }) {
  const steps = status === "refunded" ? [...STEPS.slice(0, 3), { status, label: "Refunded" }] : STEPS;
  const stepIndex = status === "disputed" ? 2 : steps.findIndex((s) => s.status === status);
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px] sm:text-xs">
      {steps.map((s, i) => (
        <li key={s.status} className="flex flex-col items-center gap-1">
          <span className={`h-1 w-full ${i <= stepIndex ? "bg-ink" : "bg-rule"}`} />
          <span className={i === stepIndex ? "font-semibold text-ink" : "text-ink-soft"}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function Receipt({ item, releasedAt, heldAt }: { item: Item; releasedAt?: string; heldAt?: string }) {
  const comparison = useComparison(item, false);
  const scans = comparison.status === "ready" ? [comparison.data.diff.baseScan, comparison.data.diff.newScan] : [];
  const receiptId = `DEMO-${item.id.toUpperCase()}-${releasedAt ? new Date(releasedAt).getTime().toString(36).toUpperCase() : "0"}`;
  return (
    <div className="rounded-md border border-rule bg-paper-deep p-4 text-sm">
      <h3 className="display text-2xl">Receipt: payment released (demo)</h3>
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
            <dd>
              <LocalTime iso={heldAt} />
            </dd>
          </div>
        )}
        {releasedAt && (
          <div>
            <dt className="text-xs opacity-75">Released after buyer approval</dt>
            <dd>
              <LocalTime iso={releasedAt} />
            </dd>
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

export function MugIcon() {
  return (
    <svg viewBox="0 0 64 64" className="plate h-20 w-20 shrink-0 border border-rule p-2" aria-hidden>
      <path d="M12 14h32v30a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10z" fill="#8d8a82" />
      <path d="M44 22h4a8 8 0 0 1 0 16h-4" fill="none" stroke="#8d8a82" strokeWidth="5" />
      <ellipse cx="28" cy="14" rx="16" ry="3" fill="#5b5953" />
    </svg>
  );
}
