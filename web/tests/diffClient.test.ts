import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanMeta } from "@/lib/types";

// Scan names come from Supabase; fake it so getDiff reaches the engine mapping.
vi.mock("@/lib/supabase", () => ({ browserSupabase: () => ({}) }));
vi.mock("@/lib/scans", () => ({
  fetchScan: async (_db: unknown, id: string): Promise<ScanMeta> => ({
    id,
    name: id,
    capturedAt: "2026-10-24T00:00:00Z",
    capturedBy: "test",
    modelUrl: "",
    format: "glb",
    sha256: null,
  }),
}));

const ENGINE = "https://engine.test";
const json = (relative: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")) as Record<string, unknown>;
/** The repo's contract: a real response, contract/diff_response.json. */
const SAMPLE = json("../../contract/diff_response.json");
/** Recorded from the deployed engine (engine.scandiff.us) on Oct 24, in the brief's field names. */
const DEPLOYED_ACCEPT = json("../../ios/ScanDiff/ScanDiffTests/Fixtures/engine_real_accept.json");
const DEPLOYED_REVIEW = json("../../ios/ScanDiff/ScanDiffTests/Fixtures/engine_mock_needs_review.json");

type Reply = { status: number; body: unknown };

/** A fake engine: /health hands out "s1", then "s2"; /diff answers from `replies` in order. */
function fakeEngine(replies: Reply[]) {
  const sessions: string[] = [];
  let health = 0;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === `${ENGINE}/health`) return Response.json({ status: "ok", session_id: `s${++health}` });
    if (url.startsWith(`${ENGINE}/diff`)) {
      sessions.push(new Headers(init?.headers).get("X-Session-ID") ?? "");
      const reply = replies.shift()!;
      return Response.json(reply.body, { status: reply.status });
    }
    throw new Error(`unexpected request to ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, sessions };
}

async function load() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DIFF_API_URL", `${ENGINE}/`);
  return import("@/lib/diffClient");
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllEnvs());

describe("getDiff against the engine", () => {
  it("maps the contract sample onto the viewer's millimeters", async () => {
    fakeEngine([{ status: 200, body: SAMPLE }]);
    const { getDiff } = await load();

    const result = await getDiff("base", "new");

    const regions = SAMPLE.regions as { centroid_m: number[]; radius_m: number; max_depth_mm: number }[];
    expect(result.source).toBe("engine");
    expect(result.verdict).toBe("damage_likely");
    expect(result.verdictConfidence).toBeCloseTo(0.5223, 3);
    expect(result.flaggedRegions).toHaveLength(regions.length);
    expect(result.flaggedRegions[0].center).toEqual(regions[0].centroid_m.map((v) => v * 1000));
    expect(result.flaggedRegions[0].radius).toBeCloseTo(regions[0].radius_m * 1000);
    expect(result.flaggedRegions[0].maxDistance).toBe(regions[0].max_depth_mm);
    expect(result.histogram.binEdges).toHaveLength(result.histogram.counts.length + 1);
  });

  it("maps the deployed engine's accept response (brief field names)", async () => {
    fakeEngine([{ status: 200, body: DEPLOYED_ACCEPT }]);
    const { getDiff } = await load();

    const result = await getDiff("base", "new");

    const uncovered = (DEPLOYED_ACCEPT.uncovered_regions as { centroid: number[]; radius: number }[])[0];
    expect(result.verdict).toBe("accept");
    expect(result.verdictConfidence).toBe(1);
    expect(result.verdictReason).toBe(DEPLOYED_ACCEPT.reason);
    expect(result.flaggedRegions).toEqual([]);
    expect(result.uncoveredRegions[0].center).toEqual(uncovered.centroid.map((v) => v * 1000));
    expect(result.uncoveredRegions[0].radius).toBeCloseTo(uncovered.radius * 1000);
    expect(result.histogram.binEdges).toEqual(DEPLOYED_ACCEPT.histogram_edges_mm);
    expect(result.histogram.counts).toEqual(DEPLOYED_ACCEPT.histogram);
    expect(result.summary.maxDistance).toBe((DEPLOYED_ACCEPT.stats as { max_mm: number }).max_mm);
    expect(result.summary.coveredFraction).toBe(DEPLOYED_ACCEPT.compared_fraction);
  });

  it("maps the deployed engine's regions: damage type in label, centroid and radius in meters", async () => {
    fakeEngine([{ status: 200, body: DEPLOYED_REVIEW }]);
    const { getDiff } = await load();

    const result = await getDiff("base", "new");

    const [wear, dent] = result.flaggedRegions;
    expect(result.source).toBe("engine_mock");
    expect(result.verdict).toBe("needs_review");
    expect(wear.label).toBe("normal_wear");
    expect(dent.label).toBe("needs_review");
    expect(dent.maxDistance).toBe(4.87);
    expect(dent.center).toEqual([35.045, -11.266, 33.26].map((v) => expect.closeTo(v, 6)));
    expect(dent.radius).toBeCloseTo(9.094);
    expect(dent.seenOn).toBe("new");
  });

  it("renews an expired session once and retries", async () => {
    const engine = fakeEngine([
      { status: 401, body: { detail: "Missing or expired session." } },
      { status: 200, body: SAMPLE },
    ]);
    const { getDiff } = await load();

    await getDiff("base", "new");

    expect(engine.sessions).toEqual(["s1", "s2"]);
  });

  it("reports an inconclusive comparison with the engine's reason, in either field name", async () => {
    fakeEngine([
      { status: 200, body: { ...SAMPLE, verdict: "inconclusive", verdict_reason: "Only 31% of the item was captured." } },
      { status: 200, body: { ...DEPLOYED_ACCEPT, verdict: "inconclusive", reason: "Alignment failed, please re-scan." } },
    ]);
    const { getDiff, InconclusiveDiff } = await load();

    await expect(getDiff("a", "b")).rejects.toThrow(new InconclusiveDiff("Only 31% of the item was captured."));
    await expect(getDiff("c", "d")).rejects.toThrow(new InconclusiveDiff("Alignment failed, please re-scan."));
  });

  it("does not cache a failure, so the next try reaches the engine again", async () => {
    const engine = fakeEngine([
      { status: 503, body: { detail: "down" } },
      { status: 200, body: SAMPLE },
    ]);
    const { getDiff } = await load();

    await expect(getDiff("base", "new")).rejects.toThrow("Diff request failed (503)");
    await expect(getDiff("base", "new")).resolves.toMatchObject({ verdict: "damage_likely" });
    expect(engine.sessions).toHaveLength(2);
  });

  it("rejects a response that is not a diff", async () => {
    fakeEngine([{ status: 200, body: { hello: "world" } }]);
    const { getDiff } = await load();

    await expect(getDiff("base", "new")).rejects.toThrow(/missing/);
  });
});

describe("toVerdict", () => {
  it("passes engine verdicts through and sends anything else to a person", async () => {
    const { toVerdict } = await load();
    expect(["accept", "damage_likely", "needs_review", "inconclusive"].map(toVerdict)).toEqual([
      "accept",
      "damage_likely",
      "needs_review",
      "inconclusive",
    ]);
    expect(toVerdict("accepted")).toBe("needs_review");
  });
});
