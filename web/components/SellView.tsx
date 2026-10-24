"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import { closestItemId, itemIdProblem, normalizeItemId } from "@/lib/itemId";
import { useScanRows } from "@/lib/liveScans";
import { DEFAULT_PRICE_CENTS, saveListing, useRealOrderRecord } from "@/lib/realOrder";
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
  const [rawId, setRawId] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState((DEFAULT_PRICE_CENTS / 100).toFixed(2));
  const [known, setKnown] = useState<string[]>([]);
  const [newDespiteTypo, setNewDespiteTypo] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const db = browserSupabase();
    if (db) fetchItemIds(db).then(setKnown, () => setKnown([]));
  }, []);

  const id = normalizeItemId(rawId);
  const problem = itemIdProblem(id);
  const near = problem ? undefined : closestItemId(id, known);
  const exists = known.includes(id);
  const cents = Math.round(Number(price) * 100);
  const priceProblem = Number.isFinite(cents) && cents > 0 ? null : "Enter a price above $0.";
  const blocked = problem !== null || priceProblem !== null || (near !== undefined && !newDespiteTypo);

  return (
    <form
      className="sheet flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (blocked) return;
        saveListing(id, { title: title.trim() || id, priceCents: cents, listedAt: new Date().toISOString() });
        onListed(id);
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Item ID
        <input
          value={rawId}
          onChange={(e) => {
            setRawId(e.target.value);
            setNewDespiteTypo(false);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="coffee-maker-4"
          className="min-h-11 border border-ink bg-paper px-3 font-mono"
        />
        <span className="caption">
          {rawId && id !== rawId ? (
            <>
              Saved as <span className="font-mono text-ink">{id}</span>. IDs are lowercase so one item never splits
              across two folders.
            </>
          ) : (
            "Lowercase letters, numbers, - and _. The iPhone app files every scan under this ID."
          )}
        </span>
      </label>

      {(touched || rawId !== "") && problem && <p className="text-sm text-stamp">{problem}</p>}

      {near && (
        <div className="border-l-2 border-stamp pl-3 text-sm">
          <p>
            Did you mean <span className="font-mono">{near}</span>? It already has a seller scan.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setRawId(near)} className="min-h-10 border border-ink px-3 font-semibold">
              Use {near}
            </button>
            <label className="flex min-h-10 items-center gap-2">
              <input type="checkbox" checked={newDespiteTypo} onChange={(e) => setNewDespiteTypo(e.target.checked)} className="h-4 w-4 accent-black" />
              No, {id} is a different item
            </label>
          </div>
        </div>
      )}
      {exists && (
        <p className="border-l-2 border-ink pl-3 text-sm">
          <span className="font-mono">{id}</span> already has a seller scan. A new baseline scan replaces it as the
          reference for future comparisons.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Drip coffee maker"
          className="min-h-11 border border-ink bg-paper px-3"
        />
      </label>
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

      <button type="submit" className="min-h-12 bg-ink px-5 font-semibold text-paper disabled:opacity-40" disabled={touched && blocked}>
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
          {!fresh && <p className="caption">Scan again with the code below to replace it, or go on to the checkout.</p>}
          <Link
            href={`/checkout/${encodeURIComponent(itemId)}`}
            className="mt-3 inline-flex min-h-12 items-center bg-ink px-6 font-semibold text-paper"
          >
            Open the checkout →
          </Link>
        </div>
      ) : (
        <p className="text-sm">Scan the item with the ScanDiff iPhone app before packing it. This page updates when the scan arrives.</p>
      )}

      {!fresh && (
        <div className="flex flex-col items-center gap-4 border-t border-rule pt-4">
          <ScanQR itemId={itemId} kind="baseline" />
          {!baseline && (
            <div className="w-full">
              <p className="display text-lg italic text-ink-soft">Waiting for the seller&apos;s baseline scan…</p>
              <div className="progress mt-2" />
            </div>
          )}
        </div>
      )}
      {error && <p className="text-sm text-stamp">Could not read the scans: {error}. Retrying.</p>}

      <button type="button" onClick={onBack} className="self-start text-sm underline">
        List a different item
      </button>
    </section>
  );
}
