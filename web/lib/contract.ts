/* Generated from engine/contract/diff_response.schema.json by npm run gen:contract. Do not edit by hand. */

/**
 * True when this is the engine's fixed example response, not a comparison of the two scans.
 */
export type IsMock = boolean;
/**
 * Heatmap GLB: the new scan's surface aligned into the base scan frame, meters, with signed blue/gray/red vertex colors already applied.
 */
export type HeatmapUrl = string;
/**
 * Base scan as GLB, in the base scan frame, meters. No heatmap colors.
 */
export type BaseModelUrl = string;
/**
 * New scan as GLB, aligned into the base scan frame, meters. No heatmap colors.
 */
export type NewModelUrl = string;
/**
 * Low end of the color scale, millimeters of signed change from the base surface. Negative is a dent.
 */
export type MinMm = number;
/**
 * High end of the color scale, millimeters of signed change from the base surface. Positive is added material.
 */
export type MaxMm = number;
/**
 * Comparison threshold, millimeters from the base surface. Matches stats.threshold_mm.
 */
export type ThresholdMm = number;
/**
 * Signed scale baked into the heatmap GLB vertex colors. Blue is a dent, gray is within neutral_band_mm of zero, red is added material. Not a blue-to-red magnitude ramp.
 */
export type Colormap = "diverging_blue_gray_red";
/**
 * Half-width of the gray band around zero, millimeters. Equal to threshold_mm.
 */
export type NeutralBandMm = number;
/**
 * Histogram bin edges, millimeters of absolute change from the base surface.
 */
export type BinEdgesMm = number[];
/**
 * Unitless sample count in each bin. One fewer entry than bin_edges_mm.
 */
export type Counts = number[];
/**
 * Unitless fraction of the base surface whose change exceeds threshold_mm, from 0 to 1.
 */
export type ChangedFraction = number;
/**
 * Largest absolute change, millimeters from the base surface.
 */
export type MaxChangeMm = number;
/**
 * Estimated sensor noise, millimeters, in the base scan frame.
 */
export type NoiseFloorMm = number;
/**
 * Change at or below this is treated as unchanged, millimeters from the base surface.
 */
export type ThresholdMm1 = number;
/**
 * Unitless ICP inlier ratio from 0 to 1, after alignment into the base scan frame.
 */
export type IcpFitness = number;
/**
 * ICP residual RMSE, millimeters, in the base scan frame.
 */
export type IcpRmseMm = number;
/**
 * Pipeline runtime, seconds.
 */
export type DiffTimeS = number;
export type Id = string;
export type Label = "normal_wear" | "needs_review";
export type DamageType = "normal_wear" | "scratch_scuff" | "dent_damage" | "missing_part";
export type Kind = "dent" | "added" | "missing";
/**
 * Region area on the base surface, square centimeters.
 */
export type AreaCm2 = number;
/**
 * Largest absolute change in the region, millimeters from the base surface.
 */
export type MaxDepthMm = number;
/**
 * Mean absolute change over the region, millimeters from the base surface.
 */
export type MeanDepthMm = number;
/**
 * Centroid [x, y, z] in the base scan frame, meters.
 *
 * @minItems 3
 * @maxItems 3
 */
export type CentroidM = [number, number, number];
/**
 * Max distance from centroid_m to any point in the region, meters, in the base scan frame.
 */
export type RadiusM = number;
/**
 * Axis-aligned minimum corner [x, y, z] of the region in the base scan frame, meters.
 *
 * @minItems 3
 * @maxItems 3
 */
export type BboxMinM = [number, number, number];
/**
 * Axis-aligned maximum corner [x, y, z] of the region in the base scan frame, meters.
 *
 * @minItems 3
 * @maxItems 3
 */
export type BboxMaxM = [number, number, number];
/**
 * Unitless score from 0 to 1.
 */
export type Confidence = number;
export type Reason = string;
export type BeforeCropUrl = string | null;
export type AfterCropUrl = string | null;
export type Regions = Region[];
export type Id1 = string;
export type OnlyIn = "base" | "new";
/**
 * Uncovered area on that scan, square centimeters.
 */
export type AreaCm21 = number;
/**
 * Centroid [x, y, z] in the base scan frame, meters.
 *
 * @minItems 3
 * @maxItems 3
 */
export type CentroidM1 = [number, number, number];
/**
 * Max distance from centroid_m to any point in the uncovered patch, meters, in the base scan frame.
 */
export type RadiusM1 = number;
export type UncoveredRegions = UncoveredRegion[];
export type Verdict = "accept" | "damage_likely" | "needs_review";
/**
 * Unitless confidence in the verdict, from 0 to 1.
 */
export type VerdictConfidence = number;
export type VerdictReason = string;
export type BaseFingerprint = string;
export type NewFingerprint = string;
export type DiffId = string;

/**
 * Comparison of a new scan against a base scan, for the web viewer.
 *
 * All three GLBs are in the base scan frame, in meters, with +Y up as in ARKit and glTF. Every
 * position in this response (centroid_m, bbox_*_m) is in that frame too. The upload is USDZ, which
 * three.js cannot load, so the engine publishes both scans as GLB. `new_model_url` is already aligned
 * into the base frame. `heatmap_url` is the new scan's surface, also aligned into the base frame,
 * with vertex colors already applied on the signed blue/gray/red scale. A part removed since the base
 * scan has no surface in it; regions and stats still report it.
 */
export interface DiffResponse {
  is_mock: IsMock;
  heatmap_url: HeatmapUrl;
  base_model_url: BaseModelUrl;
  new_model_url: NewModelUrl;
  heatmap_legend: HeatmapLegend;
  histogram: Histogram;
  stats: Stats;
  regions: Regions;
  uncovered_regions: UncoveredRegions;
  verdict: Verdict;
  verdict_confidence: VerdictConfidence;
  verdict_reason: VerdictReason;
  base_fingerprint: BaseFingerprint;
  new_fingerprint: NewFingerprint;
  diff_id: DiffId;
}
/**
 * How to read vertex colors on the heatmap GLB.
 *
 * The GLB is in the base scan's frame, in meters, with these colors already applied.
 * The scale is signed, not a magnitude ramp from unchanged to large change:
 * blue is a dent (negative), gray is inside the neutral band around zero, and red is added material (positive).
 */
export interface HeatmapLegend {
  min_mm: MinMm;
  max_mm: MaxMm;
  threshold_mm: ThresholdMm;
  colormap?: Colormap;
  neutral_band_mm: NeutralBandMm;
}
export interface Histogram {
  bin_edges_mm: BinEdgesMm;
  counts: Counts;
}
export interface Stats {
  changed_fraction: ChangedFraction;
  max_change_mm: MaxChangeMm;
  noise_floor_mm: NoiseFloorMm;
  threshold_mm: ThresholdMm1;
  icp_fitness: IcpFitness;
  icp_rmse_mm: IcpRmseMm;
  diff_time_s: DiffTimeS;
}
export interface Region {
  id: Id;
  label: Label;
  damage_type: DamageType;
  kind: Kind;
  area_cm2: AreaCm2;
  max_depth_mm: MaxDepthMm;
  mean_depth_mm: MeanDepthMm;
  centroid_m: CentroidM;
  radius_m: RadiusM;
  bbox_min_m: BboxMinM;
  bbox_max_m: BboxMaxM;
  confidence: Confidence;
  reason: Reason;
  before_crop_url?: BeforeCropUrl;
  after_crop_url?: AfterCropUrl;
}
/**
 * Surface that only one of the two scans captured, so it cannot be compared.
 *
 * `centroid_m` and `radius_m` match Region, so a marker can be placed and sized.
 */
export interface UncoveredRegion {
  id: Id1;
  only_in: OnlyIn;
  area_cm2: AreaCm21;
  centroid_m: CentroidM1;
  radius_m: RadiusM1;
}
