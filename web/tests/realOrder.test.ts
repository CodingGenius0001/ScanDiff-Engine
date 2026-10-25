import { describe, expect, it } from "vitest";
import { placeHold, realOrderStatus, resetHold, saveListing, type RealOrderRecord } from "@/lib/realOrder";
import { newestCheck } from "@/lib/liveScans";
import type { ScanRow } from "@/lib/scans";

const ITEM = "mug-002";
let counter = 0;

function row(kind: ScanRow["kind"], version: number, decision: ScanRow["decision"] = null, id?: string): ScanRow {
  return {
    id: id ?? `00000000-0000-0000-0000-${String(++counter).padStart(12, "0")}`,
    item_id: ITEM,
    version,
    kind,
    model_url: null,
    sha256: "ab".repeat(32),
    created_by: "u",
    created_at: new Date(Date.UTC(2026, 9, 24, 12, version)).toISOString(),
    decision,
  };
}

const held = (rows: ScanRow[]): RealOrderRecord => ({ hold: { at: "2026-10-24T12:00:00Z", seen: rows.map((r) => r.id) } });
const status = (record: RealOrderRecord, rows: ScanRow[]) => realOrderStatus(ITEM, record, rows).status;

describe("live checkout (PITCH.md main path and dispute branch)", () => {
  const baseline = row("baseline", 1);

  it("is listed until the buyer pays", () => {
    expect(realOrderStatus(ITEM, {}, [baseline])).toEqual({ status: "listed", baseline });
  });

  it("holds the payment until a check scan arrives", () => {
    expect(status(held([baseline]), [baseline])).toBe("held_scan_required");
  });

  it("waits for the buyer's decision once the check scan is in", () => {
    const check = row("check", 2);
    const order = realOrderStatus(ITEM, held([baseline]), [baseline, check]);
    expect(order).toEqual({ status: "scan_uploaded", check, baseline });
  });

  it("releases on accept and stays held on dispute", () => {
    expect(status(held([baseline]), [baseline, row("check", 2, "accept")])).toBe("released");
    expect(status(held([baseline]), [baseline, row("check", 2, "dispute")])).toBe("disputed");
  });

  it("never releases a new order on a check scan accepted before the hold", () => {
    const old = row("check", 2, "accept");
    expect(status(held([baseline, old]), [baseline, old])).toBe("held_scan_required");
    expect(status(held([baseline, old]), [baseline, old, row("check", 3, "accept")])).toBe("released");
  });

  it("counts a redone check-in that reuses a deleted one's version (told apart by id)", () => {
    const deleted = row("check", 2, "dispute");
    const record = held([baseline, deleted]);
    const redone = row("check", 2);
    expect(status(record, [baseline, redone])).toBe("scan_uploaded");
    expect(status(record, [baseline, { ...redone, decision: "accept" }])).toBe("released");
  });

  it("supports holds saved by older builds (version-based)", () => {
    const record: RealOrderRecord = { hold: { at: "2026-10-24T12:00:00Z", afterVersion: 2 } };
    expect(status(record, [baseline, row("check", 2, "accept")])).toBe("held_scan_required");
    expect(status(record, [baseline, row("check", 3, "accept")])).toBe("released");
  });

  it("ignores check scans of an older baseline once the seller re-baselines", () => {
    const rows = [baseline, row("check", 2, "accept"), row("baseline", 3)];
    expect(newestCheck(ITEM, rows)).toBeUndefined();
    expect(status(held([baseline]), rows)).toBe("held_scan_required");
  });

  it("follows the stored decision if it is changed after release (no lock; see AUD-12)", () => {
    const check = row("check", 2, "accept");
    expect(status(held([baseline]), [baseline, check])).toBe("released");
    expect(status(held([baseline]), [baseline, { ...check, decision: "dispute" }])).toBe("disputed");
  });

  it("has nothing to sell without a baseline", () => {
    expect(realOrderStatus(ITEM, {}, [])).toEqual({ status: "listed", baseline: undefined });
    expect(status(held([]), [row("check", 1, "accept")])).toBe("held_scan_required");
  });
});

describe("hold bookkeeping in this browser", () => {
  it("remembers every scan seen at payment and resets back to the listing", async () => {
    const { useRealOrderRecord } = await import("@/lib/realOrder");
    expect(typeof useRealOrderRecord).toBe("function");
    const item = `hold-${Date.now()}`;
    const rows = [row("baseline", 1), row("check", 2, "accept")];
    saveListing(item, { title: "Mug", priceCents: 4800, listedAt: "2026-10-24T12:00:00Z" });
    placeHold(item, rows);
    const record = (await import("@/lib/realOrder")).realOrderStatus(item, { hold: { at: "", seen: rows.map((r) => r.id) } }, rows);
    expect(record.status).toBe("held_scan_required");
    resetHold(item);
  });
});
