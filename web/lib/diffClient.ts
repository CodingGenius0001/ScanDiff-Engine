/**
 * The ONE place the web app gets diff results from.
 *
 * Set NEXT_PUBLIC_DIFF_API_URL to call the engine's `POST /diff`; leave it
 * empty to use the mock generated in the browser. The engine's response
 * (`contract.ts`) is mapped onto `DiffResult` here, so components only ever
 * see `DiffResult`.
 */
import type { DiffResponse } from "./contract";
import { getScan } from "./items";
import { MOCK_SCANS } from "./mock/catalog";
import type { DiffResult, ScanMeta } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_DIFF_API_URL?.replace(/\/+$/, "") || null;
/** Ask the engine for its fake response (`?mock=true`). */
const API_MOCK = process.env.NEXT_PUBLIC_DIFF_API_MOCK === "true";

const cache = new Map<string, Promise<DiffResult>>();

/**
 * One scan's model from the engine (`GET /scans/{id}/model.glb`): meters,
 * +Y up, in the scan's own frame. Null without an engine.
 */
export function scanModelUrl(scanId: string): string | null {
  return API_BASE ? `${API_BASE}/scans/${encodeURIComponent(scanId)}/model.glb` : null;
}

export function getDiff(baseId: string, newId: string): Promise<DiffResult> {
  const key = `${baseId}|${newId}`;
  let p = cache.get(key);
  if (!p) {
    // Catalog demo items (mug-001, car-001) only exist in the browser mock, so they
    // stay on it even when the engine is configured for real scans.
    const isCatalogPair = baseId in MOCK_SCANS && newId in MOCK_SCANS;
    p = API_BASE && !isCatalogPair ? fetchDiff(API_BASE, baseId, newId) : mockDiff(baseId, newId);
    // A failed request should be retryable, not cached forever.
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

async function mockDiff(baseId: string, newId: string): Promise<DiffResult> {
  if (!(baseId in MOCK_SCANS)) {
    throw new Error("Real scans need the engine. Set NEXT_PUBLIC_DIFF_API_URL in web/.env.local.");
  }
  // Loaded lazily so the mock (and three.js) stay out of pages that do not need them.
  const { buildMockDiff } = await import("./mock/scenarios");
  return buildMockDiff(baseId, newId);
}

async function fetchDiff(base: string, baseId: string, newId: string): Promise<DiffResult> {
  const res = await fetch(`${base}/diff${API_MOCK ? "?mock=true" : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_id: baseId, new_id: newId }),
  });
  if (!res.ok) throw new Error(`Diff request failed (${res.status})`);
  const [raw, baseScan, newScan] = await Promise.all([res.json(), scanMeta(baseId), scanMeta(newId)]);
  return toDiffResult(raw, baseScan, newScan);
}

async function scanMeta(id: string): Promise<ScanMeta> {
  const scan = await getScan(id);
  if (!scan) throw new Error(`Unknown scan "${id}"`);
  return scan;
}

const REQUIRED: (keyof DiffResponse)[] = [
  "is_mock",
  "heatmap_url",
  "base_model_url",
  "new_model_url",
  "heatmap_legend",
  "histogram",
  "stats",
  "regions",
  "uncovered_regions",
  "verdict",
];

/** Engine positions are meters; the web app works in millimeters. */
export const M_TO_MM = 1000;

/** The engine's verdict as it comes; anything unrecognized needs a person. */
export function toVerdict(verdict: DiffResponse["verdict"] | string): DiffResult["verdict"] {
  switch (verdict) {
    case "accept":
    case "damage_likely":
    case "needs_review":
    case "inconclusive":
      return verdict;
    default:
      return "needs_review";
  }
}

function toDiffResult(raw: unknown, baseScan: ScanMeta, newScan: ScanMeta): DiffResult {
  if (!raw || typeof raw !== "object") throw new Error("Diff response is not a JSON object");
  const missing = REQUIRED.filter((k) => !(k in raw));
  if (missing.length) throw new Error(`Diff response is missing ${missing.join(", ")}`);
  const r = raw as DiffResponse;
  // An inconclusive comparison has no heat map, models or stats to show; its reason is the message.
  if (!r.stats || !r.heatmap_legend || !r.heatmap_url || !r.base_model_url || !r.new_model_url) {
    throw new Error(`Inconclusive: ${r.verdict_reason || "the engine could not compare these scans."}`);
  }
  const mm = (p: [number, number, number]) => p.map((v) => v * M_TO_MM) as [number, number, number];

  return {
    source: r.is_mock || API_MOCK ? "engine_mock" : "engine",
    diffId: r.diff_id,
    baseScan: { ...baseScan, modelUrl: r.base_model_url, format: "glb", sha256: r.base_fingerprint ?? null },
    newScan: { ...newScan, modelUrl: r.new_model_url, format: "glb", sha256: r.new_fingerprint ?? null },
    units: "mm",
    // The contract fixes every engine position and GLB as +Y up (ARKit and glTF).
    upAxis: "Y",
    modelScale: M_TO_MM,
    noiseThreshold: r.stats.threshold_mm,
    heatmap: {
      modelUrl: r.heatmap_url,
      format: "glb",
      min: r.heatmap_legend.min_mm,
      max: r.heatmap_legend.max_mm,
      neutralBand: r.heatmap_legend.neutral_band_mm,
    },
    histogram: { binEdges: r.histogram.bin_edges_mm, counts: r.histogram.counts },
    flaggedRegions: r.regions.map((g) => ({
      id: g.id,
      label: g.label,
      confidence: g.confidence,
      center: mm(g.centroid_m),
      radius: g.radius_m * M_TO_MM,
      maxDistance: g.max_depth_mm,
      // A missing part is material only the baseline has; anything else shows on the new scan.
      seenOn: g.kind === "missing" || g.damage_type === "missing_part" ? "baseline" : "new",
      kind: g.kind,
      description: g.reason,
      beforeCropUrl: g.before_crop_url,
      afterCropUrl: g.after_crop_url,
    })),
    uncoveredRegions: r.uncovered_regions.map((u) => ({
      id: u.id,
      center: mm(u.centroid_m),
      radius: u.radius_m * M_TO_MM,
      coveredBy: u.only_in === "base" ? "baseline_only" : "new_only",
      description: `About ${u.area_cm2.toFixed(1)} cm² of surface.`,
    })),
    verdict: toVerdict(r.verdict),
    verdictConfidence: r.verdict_confidence,
    verdictReason: r.verdict_reason,
    summary: {
      maxDistance: r.stats.max_change_mm,
      fractionAboveThreshold: r.stats.changed_fraction,
      ...(typeof r.compared_fraction === "number" ? { coveredFraction: r.compared_fraction } : {}),
    },
    quality: {
      noiseFloor: r.stats.noise_floor_mm,
      icpFitness: r.stats.icp_fitness,
      icpRmse: r.stats.icp_rmse_mm,
      diffTimeSeconds: r.stats.diff_time_s,
    },
    // The engine does not report when it ran.
    computedAt: new Date().toISOString(),
  };
}
