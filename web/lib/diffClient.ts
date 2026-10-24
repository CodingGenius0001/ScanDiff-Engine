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
import type { DiffResult, ScanMeta, UpAxis } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_DIFF_API_URL?.replace(/\/+$/, "") || null;
/** Ask the engine for its fake response (`?mock=true`). */
const API_MOCK = process.env.NEXT_PUBLIC_DIFF_API_MOCK === "true";
// TODO(backend): confirm the engine frame's up axis. ARKit is Y up.
const API_UP_AXIS: UpAxis = process.env.NEXT_PUBLIC_DIFF_UP_AXIS === "Z" ? "Z" : "Y";

const cache = new Map<string, Promise<DiffResult>>();

export function getDiff(baseId: string, newId: string): Promise<DiffResult> {
  const key = `${baseId}|${newId}`;
  let p = cache.get(key);
  if (!p) {
    p = API_BASE ? fetchDiff(API_BASE, baseId, newId) : mockDiff(baseId, newId);
    // A failed request should be retryable, not cached forever.
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

async function mockDiff(baseId: string, newId: string): Promise<DiffResult> {
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
  return toDiffResult(await res.json(), scanMeta(baseId), scanMeta(newId));
}

function scanMeta(id: string): ScanMeta {
  const scan = getScan(id);
  if (!scan) throw new Error(`Unknown scan "${id}"`);
  return scan;
}

const REQUIRED: (keyof DiffResponse)[] = [
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
const M_TO_MM = 1000;

function toDiffResult(raw: unknown, baseScan: ScanMeta, newScan: ScanMeta): DiffResult {
  if (!raw || typeof raw !== "object") throw new Error("Diff response is not a JSON object");
  const missing = REQUIRED.filter((k) => !(k in raw));
  if (missing.length) throw new Error(`Diff response is missing ${missing.join(", ")}`);
  const r = raw as DiffResponse;
  const mm = (p: [number, number, number]) => p.map((v) => v * M_TO_MM) as [number, number, number];

  return {
    source: API_MOCK ? "engine_mock" : "engine",
    diffId: r.diff_id,
    baseScan: { ...baseScan, modelUrl: r.base_model_url, format: "glb", sha256: r.base_fingerprint ?? null },
    newScan: { ...newScan, modelUrl: r.new_model_url, format: "glb", sha256: r.new_fingerprint ?? null },
    units: "mm",
    upAxis: API_UP_AXIS,
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
      seenOn: g.damage_type === "missing_part" ? "baseline" : "new",
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
    verdict: r.verdict,
    verdictConfidence: r.verdict_confidence,
    verdictReason: r.verdict_reason,
    summary: {
      maxDistance: r.stats.max_change_mm,
      fractionAboveThreshold: r.stats.changed_fraction,
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
