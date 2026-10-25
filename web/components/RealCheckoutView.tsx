"use client";

import Link from "next/link";
import { useEffect } from "react";
import { formatPrice } from "@/lib/format";
import { useScanRows } from "@/lib/liveScans";
import {
  DEFAULT_PRICE_CENTS,
  noteDecision,
  placeHold,
  realOrderStatus,
  resetHold,
  useRealOrderRecord,
} from "@/lib/realOrder";
import type { ScanRow } from "@/lib/scans";
import type { Item } from "@/lib/types";
import { MugIcon, OrderSteps } from "./CheckoutView";
import DemoBadge from "./DemoBadge";
import DemoCardCheckout, { DEMO_CARD } from "./DemoCardCheckout";
import Fingerprint from "./Fingerprint";
import LocalTime from "./LocalTime";
import ScanQR from "./ScanQR";
import StatusPill from "./StatusPill";

/**
 * Demo checkout for an item scanned with the iPhone app. The payment is held
 * until the buyer's check scan is accepted, and released the moment that
 * decision lands in the scans table, whether it was made on the phone or on
 * the comparison page.
 */
export default function RealCheckoutView({ item }: { item: Item }) {
  const record = useRealOrderRecord(item.id);
  const { rows, error } = useScanRows(item.id);
  const order = rows ? realOrderStatus(item.id, record, rows) : undefined;
  const price = record.listing?.priceCents ?? DEFAULT_PRICE_CENTS;
  const itemHref = `/item/${encodeURIComponent(item.id)}`;
  const check = order?.check;

  useEffect(() => {
    if (check?.decision) noteDecision(item.id, check);
  }, [item.id, check]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-12 pt-6 sm:pt-10">
      <header className="flex flex-col gap-2">
        <DemoBadge className="w-fit text-sm" />
        <p className="text-xs text-ink-soft">
          Demo checkout for an item scanned with the iPhone app. No card is charged, nothing is held or released, and
          there is no Apple Pay or Visa integration. The scans and the buyer&apos;s decision are real.
        </p>
      </header>

      <section className="sheet flex gap-4">
        <MugIcon />
        <div className="min-w-0 flex-1">
          <h1 className="display text-3xl sm:text-4xl">{record.listing?.title ?? item.id}</h1>
          <p className="text-sm text-ink-soft">
            Item ID <span className="font-mono">{item.id}</span>
            {order?.baseline && (
              <>
                {" "}
                · Seller baseline scanned <LocalTime iso={order.baseline.created_at} />
              </>
            )}
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{formatPrice(price)}</p>
        </div>
      </section>

      <section className="sheet">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-3xl">Order status</h2>
          {order && <StatusPill status={order.status} kind="shipping" />}
        </div>
        {order && <OrderSteps status={order.status} />}

        <div className="mt-4 flex flex-col gap-3" aria-live="polite">
          {!rows && !error && <p className="text-sm text-ink-soft">Reading the item&apos;s scans…</p>}
          {error && (
            <p role="alert" className="text-sm text-stamp">
              Could not read the scans: {error}. Retrying.
            </p>
          )}

          {order?.status === "listed" && (
            <DemoCardCheckout
              title={record.listing?.title ?? item.id}
              priceCents={price}
              onPay={() => placeHold(item.id, rows!)}
            />
          )}

          {order?.status === "held_scan_required" && (
            <>
              <p className="text-sm">
                Payment of {formatPrice(price)} from Visa •••• {DEMO_CARD.number.slice(-4)} is{" "}
                <strong>held: scan required</strong>
                {record.hold && (
                  <>
                    {" "}
                    since <LocalTime iso={record.hold.at} />
                  </>
                )}
                . When the parcel arrives, the buyer scans it with the ScanDiff iPhone app.
              </p>
              <div className="flex justify-center border-y border-rule py-4">
                <ScanQR itemId={item.id} kind="check" />
              </div>
              <Waiting text="Waiting for the buyer's check scan" />
            </>
          )}

          {order?.status === "scan_uploaded" && check && (
            <>
              <p className="text-sm">
                The buyer&apos;s check scan arrived <LocalTime iso={check.created_at} />. The payment stays held until
                the buyer accepts the comparison, on the phone or on the comparison page.
              </p>
              <Link
                href={itemHref}
                className="min-h-12 key bg-ink px-5 font-semibold text-paper"
              >
                Open comparison
              </Link>
              <Waiting text="Waiting for the buyer's decision" />
            </>
          )}

          {order?.status === "released" && check && (
            <RealReceipt item={item} price={price} baseline={order.baseline} check={check} heldAt={record.hold?.at} releasedAt={record.decided?.at} />
          )}

          {order?.status === "disputed" && check && (
            <div className="rounded-md border border-stamp p-4 text-sm">
              <h3 className="display text-2xl text-stamp">Disputed: payment stays held (demo)</h3>
              <p className="mt-2">
                The buyer disputed the comparison
                {record.decided && (
                  <>
                    {" "}
                    at <LocalTime iso={record.decided.at} />
                  </>
                )}
                . The {formatPrice(price)} is not released. The evidence page has both scans, their fingerprints and
                every flagged region.
              </p>
              <Link href={`${itemHref}/evidence`} className="mt-3 inline-flex min-h-11 items-center rounded-md border border-stamp px-4 font-semibold text-stamp">
                Open the evidence page
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => resetHold(item.id)}
          className="min-h-11 rounded-md border border-rule px-4 text-sm text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          Reset demo
        </button>
        <span className="caption">Clears the hold in this browser. Scans and decisions in the database stay as they are.</span>
      </div>
    </main>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="display text-lg text-ink-soft">{text}…</p>
      <div className="progress" />
    </div>
  );
}

function RealReceipt(props: { item: Item; price: number; baseline?: ScanRow; check: ScanRow; heldAt?: string; releasedAt?: string }) {
  const receiptId = `DEMO-${props.item.id.toUpperCase()}-${props.check.id.slice(0, 8).toUpperCase()}`;
  return (
    <div className="rounded-md border border-rule bg-paper-deep p-4 text-sm">
      <h3 className="display text-2xl">Receipt: payment released (demo)</h3>
      <DemoBadge className="my-2 w-fit" />
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <Row label="Receipt" value={<span className="font-mono text-xs font-semibold">{receiptId}</span>} />
        <Row label="Amount" value={<span className="font-semibold">{formatPrice(props.price)}</span>} />
        {props.heldAt && <Row label="Held" value={<LocalTime iso={props.heldAt} />} />}
        {props.releasedAt && <Row label="Released after buyer approval" value={<LocalTime iso={props.releasedAt} />} />}
      </dl>
      <div className="mt-2 flex flex-col gap-1">
        {props.baseline && <Scan label="Seller baseline" row={props.baseline} />}
        <Scan label="Buyer check scan" row={props.check} />
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Evidence of condition at handoff only. This receipt does not verify that the item is as advertised.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Scan({ label, row }: { label: string; row: ScanRow }) {
  return (
    <div>
      <div className="text-xs text-ink-soft">
        {label}, <LocalTime iso={row.created_at} />, SHA-256 fingerprint
      </div>
      <Fingerprint sha256={row.sha256} />
    </div>
  );
}
