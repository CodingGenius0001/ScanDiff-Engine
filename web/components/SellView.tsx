"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import { nextItemId } from "@/lib/itemId";
import { useScanRows } from "@/lib/liveScans";
import { DEFAULT_PRICE_CENTS, listedItemIds, saveListing, useRealOrderRecord } from "@/lib/realOrder";
import { fetchItemIds } from "@/lib/scans";
import { browserSupabase } from "@/lib/supabase";
import DemoBadge from "./DemoBadge";
import LocalTime from "./LocalTime";
import ScanQR from "./ScanQR";

/**
 * Step one of the pitch: list an item, then the seller scans it with the
 * iPhone app (a QR code opens the app on this item) before packing. The page
 * waits for that baseline scan and then links to the checkout.
 */
export default function SellView() {
  const [listed, setListed] = useState<string | null>(null);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-12 pt-6 sm:pt-10">
      <header>
        <p className="caption">Seller</p>
        <h1 className="display text-5xl">List an item</h1>
        <DemoBadge className="mt-3 w-fit text-sm" />
      </header>
      {listed ? <AwaitBaseline itemId={listed} onBack={() => setListed(null)} /> : <ListingForm onListed={setListed} />}
    </main>
  );
}

function ListingForm({ onListed }: { onListed: (itemId: string) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState((DEFAULT_PRICE_CENTS / 100).toFixed(2));
  const [known, setKnown] = useState<string[] | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const db = browserSupabase();
    // /sell only renders signed in with Supabase configured, so db is always there.
    if (db) fetchItemIds(db).then(setKnown, () => setKnown([]));
  }, []);

  // Items already scanned, plus items listed in this browser that may not be scanned yet.
  const id = known && nextItemId(name, [...known, ...listedItemIds()]);
  const nameProblem = name.trim() === "" ? "Enter what the item is, for example Mug." : !id && known ? "Use letters or numbers in the name." : null;
  const cents = Math.round(Number(price) * 100);
  const priceProblem = Number.isFinite(cents) && cents > 0 ? null : "Enter a price above $0.";

  return (
    <form
      className="sheet flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!id || nameProblem || priceProblem) return;
        saveListing(id, { title: name.trim(), priceCents: cents, listedAt: new Date().toISOString() });
        onListed(id);
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Item
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mug"
          className="min-h-11 border border-ink bg-paper px-3"
        />
        <span className="caption">
          {id ? (
            <>
              Item ID <span className="font-mono text-ink">{id}</span>, assigned automatically. The iPhone app files every
              scan of this item under it.
            </>
          ) : known === null ? (
            "Reading the item IDs already in use…"
          ) : (
            "The item ID is assigned from the name, for example mug-001."
          )}
        </span>
      </label>
      {touched && nameProblem && <p className="text-sm text-stamp">{nameProblem}</p>}

      <label className="flex flex-col gap-1 text-sm">
        Price (demo)
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          className="min-h-11 border border-ink bg-paper px-3 font-mono"
        />
        {touched && priceProblem && <span className="text-sm text-stamp">{priceProblem}</span>}
      </label>

      <button type="submit" className="min-h-12 bg-ink px-5 font-semibold text-paper disabled:opacity-40" disabled={!id}>
        List item
      </button>
      <p className="caption">The listing is kept in this browser for the demo. Only the scans go to the database.</p>
    </form>
  );
}

function AwaitBaseline({ itemId, onBack }: { itemId: string; onBack: () => void }) {
  const record = useRealOrderRecord(itemId);
  const { rows, error } = useScanRows(itemId);
  const baseline = rows?.filter((r) => r.kind === "baseline").at(-1);
  const listedAt = record.listing?.listedAt;
  const fresh = baseline && listedAt && Date.parse(baseline.created_at) >= Date.parse(listedAt);

  return (
    <section className="sheet flex flex-col gap-4">
      <div>
        <h2 className="display text-3xl">{record.listing?.title ?? itemId}</h2>
        <p className="text-sm text-ink-soft">
          Item ID <span className="font-mono">{itemId}</span>
          {record.listing && <> · {formatPrice(record.listing.priceCents)}</>}
        </p>
      </div>

      {baseline ? (
        <div className="border-l-2 border-ink pl-3">
          <p className="text-sm">
            {fresh ? "Seller baseline received" : "This item already has a seller baseline from"}{" "}
            <LocalTime iso={baseline.created_at} />.
          </p>
          {!fresh && <p className="caption">Scan again with the baseline code below to replace it, or go on to the checkout.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Link
              href={`/checkout/${encodeURIComponent(itemId)}`}
              className="inline-flex min-h-12 items-center bg-ink px-6 font-semibold text-paper"
            >
              Open the checkout →
            </Link>
            <Link href={`/item/${encodeURIComponent(itemId)}`} className="text-sm font-semibold underline">
              Item page
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-sm">Scan the item with the ScanDiff iPhone app before packing it. This page updates when the scan arrives.</p>
      )}

      <div className="flex flex-col items-center gap-4 border-t border-rule pt-4">
        <div className="grid w-full gap-6 sm:grid-cols-2">
          <ScanQR itemId={itemId} kind="baseline" />
          <ScanQR itemId={itemId} kind="check" />
        </div>
        {!baseline && (
          <div className="w-full">
            <p className="display text-lg italic text-ink-soft">Waiting for the seller&apos;s baseline scan…</p>
            <div className="progress mt-2" />
          </div>
        )}
      </div>
      {error && <p className="text-sm text-stamp">Could not read the scans: {error}. Retrying.</p>}

      <button type="button" onClick={onBack} className="self-start text-sm underline">
        List a different item
      </button>
    </section>
  );
}
