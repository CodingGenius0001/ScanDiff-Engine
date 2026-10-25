"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";

/**
 * A checkout form filled in with a test card, so the demo looks like paying
 * without anyone typing a real card. The fields are read-only and nothing is
 * sent anywhere: "Pay" waits a moment and calls `onPay`.
 */
export const DEMO_CARD = {
  // The widely used Visa test number: passes the Luhn check, belongs to no account.
  number: "4242 4242 4242 4242",
  name: "Demo Buyer",
  expiry: "12 / 29",
  cvc: "123",
};

const DEMO_ADDRESS = ["Demo Buyer", "1 Market St", "San Francisco, CA 94105"];
const AUTHORIZE_MS = 1200;

export default function DemoCardCheckout({
  title,
  seller,
  priceCents,
  onPay,
}: {
  title: string;
  seller: string;
  priceCents: number;
  onPay: () => void;
}) {
  const [paying, setPaying] = useState(false);

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_15rem]">
      <form
        className="flex flex-col gap-4"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          if (paying) return;
          setPaying(true);
          setTimeout(onPay, AUTHORIZE_MS);
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="caption mb-1">Ship to</legend>
          <address className="rounded-md border border-rule bg-paper px-3 py-2 text-sm not-italic leading-relaxed">
            {DEMO_ADDRESS.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </address>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="caption mb-1">Payment</legend>
          <CardFace />
          <Field label="Card number" value={DEMO_CARD.number} mono />
          <Field label="Name on card" value={DEMO_CARD.name} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expiry" value={DEMO_CARD.expiry} mono />
            <Field label="CVC" value={DEMO_CARD.cvc} mono />
          </div>
          <p className="text-xs text-ink-soft">
            A test card is filled in for the demo and the fields cannot be edited. Never enter a real card here.
          </p>
        </fieldset>

        <button
          type="submit"
          disabled={paying}
          aria-busy={paying}
          className="min-h-12 key bg-ink px-5 text-base font-semibold text-paper disabled:opacity-80"
        >
          {paying ? "Authorizing…" : "Pay with Visa (demo)"}
        </button>
        {paying && <div className="progress" />}
        <p className="text-xs text-ink-soft">
          In this demo the payment is held until the buyer scans the item on arrival and approves the comparison.
        </p>
      </form>

      <aside className="order-first flex flex-col gap-2 self-start rounded-md sm:order-last border border-rule bg-paper-deep p-4 text-sm">
        <h3 className="caption">Order summary</h3>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-ink-soft">Sold by {seller}</p>
        <dl className="mt-2 flex flex-col gap-1">
          <SummaryRow label="Item" value={formatPrice(priceCents)} />
          <SummaryRow label="Shipping" value="Free" />
          <div className="mt-1 border-t border-rule pt-2">
            <SummaryRow label="Total" value={formatPrice(priceCents)} strong />
          </div>
        </dl>
        <p className="mt-2 text-xs text-ink-soft">Held by ScanDiff until the arrival scan is approved.</p>
      </aside>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        readOnly
        value={value}
        autoComplete="off"
        className={`min-h-11 rounded-md border border-rule bg-paper px-3 text-ink-soft ${mono ? "font-mono tabular-nums" : ""}`}
      />
    </label>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <span className="leader" aria-hidden />
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

/** The test card, drawn as a card so the stage audience reads it at a glance. */
function CardFace() {
  return (
    <div
      className="flex aspect-[1.586] w-full max-w-72 flex-col justify-between rounded-xl border border-rule p-4 text-ink"
      style={{ background: "linear-gradient(135deg, #2a2a29 0%, #161616 60%, #0b0b0b 100%)" }}
      aria-hidden
    >
      <div className="flex items-start justify-between">
        <span className="h-7 w-9 rounded-md bg-gradient-to-br from-[#d9c38a] to-[#9c8650]" />
        <span className="rounded-full border border-stamp/60 px-2 py-0.5 text-[10px] font-medium text-stamp">
          Test card
        </span>
      </div>
      <p className="font-mono text-lg tracking-wider tabular-nums">{DEMO_CARD.number}</p>
      <div className="flex items-end justify-between text-xs">
        <div>
          <div className="text-[10px] text-ink-faint">Card holder</div>
          <div className="uppercase tracking-wide">{DEMO_CARD.name}</div>
        </div>
        <div>
          <div className="text-[10px] text-ink-faint">Expires</div>
          <div className="font-mono">{DEMO_CARD.expiry.replace(/ /g, "")}</div>
        </div>
        <span className="text-xl font-black italic tracking-tight">VISA</span>
      </div>
    </div>
  );
}
