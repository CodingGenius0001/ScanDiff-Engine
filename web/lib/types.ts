/**
 * All data types shared by the ScanDiff web app.
 *
 * These shapes are the web app's own internal contract. The engine's real
 * response (`contract.ts`, generated from the engine's JSON schema) is mapped
 * onto them inside `diffClient.ts`, so components only ever see these types.
 */

export type Vec3 = [number, number, number];

/** Length unit used by every distance, radius and threshold in a DiffResult. */
export type LengthUnit = "mm" | "cm" | "m";

/** Which model axis points up. The viewer rotates Z-up models to Y-up. */
export type UpAxis = "Y" | "Z";

/** Model file formats the loader understands. "mock" is generated in code. */
export type ModelFormat = "glb" | "ply" | "mock";

export interface ScanMeta {
  id: string;
  /** Human-readable name, e.g. "Seller scan before packing". */
  name: string;
  /** ISO 8601 capture time. */
  capturedAt: string;
  /** Who captured it, e.g. "Seller" or "Rental desk". */
  capturedBy: string;
  /** Where the model file lives. Mock models use the `mock://` scheme. */
  modelUrl: string;
  format: ModelFormat;
  /**
   * SHA-256 of the scan file as a hex string, or null when not yet computed.
   * Placeholder: it is not anchored anywhere independent yet.
   */
  sha256: string | null;
  /** Phone model and OS, e.g. "iPhone18,2, iOS 27.0". */
  device?: string;
  /** Free-form role from the app, e.g. "baseline", "pickup" or "return". */
  kind?: string;
}

export type RegionLabel = "normal_wear" | "needs_review";

export interface FlaggedRegion {
  id: string;
  label: RegionLabel;
  /** 0 to 1. */
  confidence: number;
  /** Center of the region in model coordinates (after alignment). */
  center: Vec3;
  /** Radius of the region in `units`. */
  radius: number;
  /** Largest distance inside the region, in `units`. */
  maxDistance: number;
  /** Which scan shows the change: "new" (shape moved) or "baseline" (material missing in new scan). */
  seenOn: "baseline" | "new";
  /** Shape of the change, when the engine reports it. "missing": a part is gone, so the new scan has no surface there. */
  kind?: "dent" | "added" | "missing";
  description: string;
  /** Optional photo crops of the region from each scan's reference photos. */
  beforeCropUrl?: string | null;
  afterCropUrl?: string | null;
}

export interface UncoveredRegion {
  id: string;
  center: Vec3;
  radius: number;
  /** Which scan captured this area. The other scan has no data there. */
  coveredBy: "baseline_only" | "new_only";
  description: string;
}

export type Verdict = "accept" | "damage_likely" | "needs_review";

export interface Histogram {
  /** Bin edges in `units`; length is counts.length + 1. */
  binEdges: number[];
  counts: number[];
}

export interface DiffSummary {
  maxDistance: number;
  /** Not reported by the engine. */
  meanDistance?: number;
  /** Fraction (0 to 1) of covered vertices above the noise threshold. */
  fractionAboveThreshold: number;
  /** Fraction (0 to 1) of vertices covered by both scans. Not reported by the engine. */
  coveredFraction?: number;
}

/** Where a DiffResult came from, shown on screen so mock data is never presented as live. */
export type DiffSource = "browser_mock" | "engine_mock" | "engine";

/**
 * A model whose colors are already baked into its vertices (the engine's
 * heat map). Colors use a signed scale: blue is a dent, gray is within
 * `neutralBand` of zero, red is added material.
 */
export interface BakedHeatmap {
  modelUrl: string;
  format: ModelFormat;
  /** Signed scale ends and gray band half-width, in `units`. */
  min: number;
  max: number;
  neutralBand: number;
}

/** Alignment and noise numbers reported by the engine, in `units`. */
export interface DiffQuality {
  noiseFloor: number;
  icpFitness: number;
  icpRmse: number;
  diffTimeSeconds: number;
}

export interface DiffResult {
  source: DiffSource;
  /** Engine's id for this comparison, when there is one. */
  diffId?: string;
  baseScan: ScanMeta;
  newScan: ScanMeta;
  units: LengthUnit;
  upAxis: UpAxis;
  /**
   * Multiply model file coordinates by this to get `units`, e.g. 1000 when
   * models are in meters and `units` is "mm". Defaults to 1.
   */
  modelScale?: number;
  /** Changes at or below this distance are treated as scanner noise. */
  noiseThreshold: number;
  /**
   * One distance per vertex of the NEW model, measured to the baseline
   * surface, in `units`. null = no data (area covered by only one scan).
   * Index i matches vertex i of the model returned by `loadModel`.
   * Absent when the engine sends a baked heat map instead.
   */
  newToBase?: (number | null)[];
  /**
   * One distance per vertex of the BASELINE model, measured to the new
   * surface. Shows material that is missing from the new scan. Optional:
   * a one-sided backend may omit it.
   */
  baseToNew?: (number | null)[];
  /**
   * Optional row-major 4x4 matrix that moves the new model into the
   * baseline frame. Not applied yet: the app assumes models arrive aligned.
   */
  alignment?: number[];
  /**
   * Engine heat map on the new scan's surface, aligned into the baseline frame.
   * When present, the viewer shows it instead of computing colors. A removed
   * part has no surface in it; regions and stats still report it.
   */
  heatmap?: BakedHeatmap;
  histogram: Histogram;
  flaggedRegions: FlaggedRegion[];
  uncoveredRegions: UncoveredRegion[];
  verdict: Verdict;
  /** 0 to 1, from the engine. */
  verdictConfidence?: number;
  /** One-line reason for the verdict, from the engine. */
  verdictReason?: string;
  summary: DiffSummary;
  quality?: DiffQuality;
  /** ISO 8601 time the diff was computed (or received, for the engine, which does not report it). */
  computedAt: string;
}

export type ItemKind = "shipping" | "rental";

/** One scan in an item's history, e.g. "pickup" and "return" for a rental car. */
export interface ScanVersion {
  scanId: string;
  /** Short timeline label, e.g. "Pickup". */
  label: string;
  capturedAt: string;
}

export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  /** Price in cents for shipping listings. */
  priceCents?: number;
  /** "supabase" for real scans from the iOS app; mock items omit it. */
  source?: "supabase";
  /** Scans in time order. The first is the baseline. */
  versions: ScanVersion[];
}
