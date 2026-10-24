/**
 * Builds mock DiffResults shaped exactly like `DiffResult` in types.ts.
 * MOCK ONLY. The 5 mm noise threshold below is a placeholder that lives in
 * the mock data; components read the threshold from the DiffResult.
 */
import type * as THREE from "three";
import type { DiffResult, FlaggedRegion, Histogram, UncoveredRegion, Vec3 } from "../types";
import { MOCK_SCANS } from "./catalog";
import { surfaceDistances, type DistanceOptions } from "./distance";
import {
  CAR,
  MUG,
  carMirrorCenter,
  carPickup,
  carReturn,
  mugBaseline,
  mugMissingCenter,
  mugNew,
} from "./geometry";

/** Placeholder noise threshold for the mock only (millimeters). */
const MOCK_NOISE_THRESHOLD_MM = 5;

const geometryCache = new Map<string, THREE.BufferGeometry>();

const GENERATORS: Record<string, () => THREE.BufferGeometry> = {
  "mug-before": mugBaseline,
  "mug-arrival": mugNew,
  "car-pickup": carPickup,
  "car-return": carReturn,
};

/** Geometry for a `mock://<scanId>` model. Cached so every caller shares one copy. */
export function mockGeometry(scanId: string): THREE.BufferGeometry {
  let g = geometryCache.get(scanId);
  if (!g) {
    const make = GENERATORS[scanId];
    if (!make) throw new Error(`Unknown mock scan "${scanId}"`);
    g = make();
    geometryCache.set(scanId, g);
  }
  return g;
}

interface Scenario {
  distance: DistanceOptions;
  /** True where the NEW scan has no data (area seen only by the baseline). */
  uncovered: (p: Vec3, n: Vec3) => boolean;
  uncoveredRegions: UncoveredRegion[];
  regions: Omit<FlaggedRegion, "maxDistance">[];
}

const v = (x: THREE.Vector3): Vec3 => [x.x, x.y, x.z];

const SCENARIOS: Record<string, Scenario> = {
  "mug-before|mug-arrival": {
    distance: { spacing: 2.5, maxSearch: 40 },
    uncovered: (p, n) => p[1] < 1.5 && n[1] < -0.5,
    uncoveredRegions: [
      {
        id: "u1",
        center: [0, 0, 0],
        radius: MUG.radius,
        coveredBy: "baseline_only",
        description: "Underside of the mug. The buyer scanned it standing on a table, so the bottom face was not captured.",
      },
    ],
    regions: [
      {
        id: "r1",
        label: "needs_review",
        confidence: 0.91,
        center: v(MUG.dentCenter),
        radius: MUG.dentRadius,
        seenOn: "new",
        description: "Dent in the front wall of the mug.",
      },
      {
        id: "r2",
        label: "needs_review",
        confidence: 0.86,
        center: v(mugMissingCenter()),
        radius: 22,
        seenOn: "baseline",
        description: "Piece of the handle present before packing is missing on arrival.",
      },
      {
        id: "r3",
        label: "normal_wear",
        confidence: 0.58,
        center: v(MUG.wearCenter),
        radius: MUG.wearRadius,
        seenOn: "new",
        description: "Shallow flattening near the base, just above the noise threshold.",
      },
    ],
  },
  "car-pickup|car-return": {
    distance: { spacing: 40, maxSearch: 300 },
    uncovered: (p, n) => p[1] > CAR.cabinTop - 5 && n[1] > 0.5,
    uncoveredRegions: [
      {
        id: "u1",
        center: [-150, CAR.cabinTop, 0],
        radius: CAR.cabinLength / 2,
        coveredBy: "baseline_only",
        description: "Roof. The return scan was taken at standing height, so the roof was not captured.",
      },
    ],
    regions: [
      {
        id: "r1",
        label: "needs_review",
        confidence: 0.88,
        center: v(CAR.dentCenter),
        radius: CAR.dentRadius,
        seenOn: "new",
        description: "Dent in the right rear door.",
      },
      {
        id: "r2",
        label: "needs_review",
        confidence: 0.93,
        center: v(carMirrorCenter()),
        radius: 200,
        seenOn: "baseline",
        description: "Right side mirror present at pickup is missing at return.",
      },
      {
        id: "r3",
        label: "normal_wear",
        confidence: 0.62,
        center: v(CAR.wearCenter),
        radius: CAR.wearRadius,
        seenOn: "new",
        description: "Slight push-in on the front bumper.",
      },
    ],
  },
};

function toNullable(
  d: Float32Array,
  g: THREE.BufferGeometry,
  uncovered: Scenario["uncovered"],
): (number | null)[] {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const out: (number | null)[] = new Array(d.length);
  for (let i = 0; i < d.length; i++) {
    const p: Vec3 = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const n: Vec3 = [nor.getX(i), nor.getY(i), nor.getZ(i)];
    out[i] = uncovered(p, n) ? null : Math.round(d[i] * 100) / 100;
  }
  return out;
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

function histogram(values: number[], threshold: number): Histogram {
  const max = values.reduce((a, b) => Math.max(a, b), threshold * 2);
  // Bin edges land on the threshold so the line falls between bars.
  const step = Math.min(niceStep(max / 30), threshold);
  const bins = Math.ceil(max / step);
  const counts = new Array(bins).fill(0);
  for (const x of values) counts[Math.min(bins - 1, Math.floor(x / step))]++;
  const binEdges = Array.from({ length: bins + 1 }, (_, i) => i * step);
  return { binEdges, counts };
}

function maxInRegion(
  g: THREE.BufferGeometry,
  d: (number | null)[],
  center: Vec3,
  radius: number,
): number {
  const pos = g.getAttribute("position");
  let m = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    if (x === null) continue;
    const dx = pos.getX(i) - center[0], dy = pos.getY(i) - center[1], dz = pos.getZ(i) - center[2];
    if (dx * dx + dy * dy + dz * dz <= radius * radius && x > m) m = x;
  }
  return m;
}

export function hasMockScenario(baseId: string, newId: string): boolean {
  return `${baseId}|${newId}` in SCENARIOS;
}

export function buildMockDiff(baseId: string, newId: string): DiffResult {
  const s = SCENARIOS[`${baseId}|${newId}`];
  if (!s) throw new Error(`No mock diff for ${baseId} -> ${newId}`);
  const base = mockGeometry(baseId);
  const next = mockGeometry(newId);
  const threshold = MOCK_NOISE_THRESHOLD_MM;

  const newToBase = toNullable(surfaceDistances(next, base, s.distance), next, s.uncovered);
  // A baseline area the new scan did not cover has nothing to compare against.
  const baseToNew = toNullable(surfaceDistances(base, next, s.distance), base, s.uncovered);

  const covered = [...newToBase, ...baseToNew].filter((x): x is number => x !== null);
  const total = newToBase.length + baseToNew.length;
  const maxDistance = covered.reduce((a, b) => Math.max(a, b), 0);
  const meanDistance = covered.reduce((a, b) => a + b, 0) / covered.length;
  const above = covered.filter((x) => x > threshold).length;

  const flaggedRegions: FlaggedRegion[] = s.regions.map((r) => {
    const onNew = r.seenOn === "new";
    return {
      ...r,
      maxDistance: maxInRegion(onNew ? next : base, onNew ? newToBase : baseToNew, r.center, r.radius),
    };
  });

  // Mirrors engine/scandiff/verdict.py: a needs-review region over 70% confidence is likely
  // damage, normal wear on under 2% of the surface is accepted, anything else needs review.
  const review = flaggedRegions.filter((r) => r.label === "needs_review");
  const verdict = review.some((r) => r.confidence > 0.7)
    ? "damage_likely"
    : review.length === 0 && above / covered.length < 0.02
      ? "accept"
      : "needs_review";

  return {
    source: "browser_mock",
    baseScan: MOCK_SCANS[baseId],
    newScan: MOCK_SCANS[newId],
    units: "mm",
    upAxis: "Y",
    noiseThreshold: threshold,
    newToBase,
    baseToNew,
    histogram: histogram(covered, threshold),
    flaggedRegions,
    uncoveredRegions: s.uncoveredRegions,
    verdict,
    summary: {
      maxDistance,
      meanDistance,
      fractionAboveThreshold: above / covered.length,
      coveredFraction: covered.length / total,
    },
    computedAt: MOCK_SCANS[newId].capturedAt,
  };
}
