/**
 * All data types shared by the ScanDiff web app.
 *
 * These shapes are the web app's own internal contract. They are ASSUMPTIONS
 * until the backend and iOS teammates confirm their formats (see TODO.md).
 * When the real formats arrive, map them onto these types inside
 * `diffClient.ts` and `modelLoader.ts`; components should not need to change.
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
  description: string;
}

export interface UncoveredRegion {
  id: string;
  center: Vec3;
  radius: number;
  /** Which scan captured this area. The other scan has no data there. */
  coveredBy: "baseline_only" | "new_only";
  description: string;
}

export type Verdict = "match" | "minor_wear" | "needs_review";

export interface Histogram {
  /** Bin edges in `units`; length is counts.length + 1. */
  binEdges: number[];
  counts: number[];
}

export interface DiffSummary {
  maxDistance: number;
  meanDistance: number;
  /** Fraction (0 to 1) of covered vertices above the noise threshold. */
  fractionAboveThreshold: number;
  /** Fraction (0 to 1) of vertices covered by both scans. */
  coveredFraction: number;
}

export interface DiffResult {
  baseScan: ScanMeta;
  newScan: ScanMeta;
  units: LengthUnit;
  upAxis: UpAxis;
  /** Changes at or below this distance are treated as scanner noise. */
  noiseThreshold: number;
  /**
   * One distance per vertex of the NEW model, measured to the baseline
   * surface, in `units`. null = no data (area covered by only one scan).
   * Index i matches vertex i of the model returned by `loadModel`.
   */
  newToBase: (number | null)[];
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
  histogram: Histogram;
  flaggedRegions: FlaggedRegion[];
  uncoveredRegions: UncoveredRegion[];
  verdict: Verdict;
  summary: DiffSummary;
  /** ISO 8601 time the diff was computed. */
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
  /** Scans in time order. The first is the baseline. */
  versions: ScanVersion[];
}
