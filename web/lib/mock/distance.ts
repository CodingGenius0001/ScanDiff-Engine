/**
 * Surface distance between two mock meshes. MOCK ONLY: the real distances
 * come from the backend. This exists so the mock behaves like real scans,
 * which do not share vertices between captures.
 *
 * For each source vertex it finds the nearest target vertex whose normal
 * faces the same way (so a thin wall is not matched to its other side),
 * then combines the distance along that normal with any tangential gap
 * larger than the target's vertex spacing.
 */
import type * as THREE from "three";

export interface DistanceOptions {
  /** Typical vertex spacing of the target mesh, in mm. */
  spacing: number;
  /** Largest distance searched; anything farther is reported as this value. */
  maxSearch: number;
  /** Minimum dot product between normals for a match. */
  minNormalDot?: number;
}

export function surfaceDistances(
  source: THREE.BufferGeometry,
  target: THREE.BufferGeometry,
  opts: DistanceOptions,
): Float32Array {
  const sp = source.getAttribute("position").array as ArrayLike<number>;
  const sn = source.getAttribute("normal").array as ArrayLike<number>;
  const tp = target.getAttribute("position").array as ArrayLike<number>;
  const tn = target.getAttribute("normal").array as ArrayLike<number>;
  const minDot = opts.minNormalDot ?? 0.5;
  const cell = Math.max(opts.spacing * 2, opts.maxSearch / 8);
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

  const grid = new Map<string, number[]>();
  const tCount = tp.length / 3;
  for (let i = 0; i < tCount; i++) {
    const k = key(
      Math.floor(tp[i * 3] / cell),
      Math.floor(tp[i * 3 + 1] / cell),
      Math.floor(tp[i * 3 + 2] / cell),
    );
    let bucket = grid.get(k);
    if (!bucket) grid.set(k, (bucket = []));
    bucket.push(i);
  }

  const maxRing = Math.ceil(opts.maxSearch / cell);
  const sCount = sp.length / 3;
  const out = new Float32Array(sCount);
  for (let i = 0; i < sCount; i++) {
    const px = sp[i * 3], py = sp[i * 3 + 1], pz = sp[i * 3 + 2];
    const nx = sn[i * 3], ny = sn[i * 3 + 1], nz = sn[i * 3 + 2];
    const cx = Math.floor(px / cell), cy = Math.floor(py / cell), cz = Math.floor(pz / cell);
    let best = Infinity;
    let bestIdx = -1;
    for (let ring = 0; ring <= maxRing; ring++) {
      // Every point in this ring is at least (ring - 1) * cell away.
      if (bestIdx >= 0 && (ring - 1) * cell > Math.sqrt(best)) break;
      for (let dx = -ring; dx <= ring; dx++)
        for (let dy = -ring; dy <= ring; dy++)
          for (let dz = -ring; dz <= ring; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== ring) continue;
            const bucket = grid.get(key(cx + dx, cy + dy, cz + dz));
            if (!bucket) continue;
            for (const j of bucket) {
              const dot = nx * tn[j * 3] + ny * tn[j * 3 + 1] + nz * tn[j * 3 + 2];
              if (dot < minDot) continue;
              const ex = px - tp[j * 3], ey = py - tp[j * 3 + 1], ez = pz - tp[j * 3 + 2];
              const d2 = ex * ex + ey * ey + ez * ez;
              if (d2 < best) {
                best = d2;
                bestIdx = j;
              }
            }
          }
    }
    if (bestIdx < 0) {
      out[i] = opts.maxSearch;
      continue;
    }
    const j = bestIdx;
    const ex = px - tp[j * 3], ey = py - tp[j * 3 + 1], ez = pz - tp[j * 3 + 2];
    const along = Math.abs(ex * tn[j * 3] + ey * tn[j * 3 + 1] + ez * tn[j * 3 + 2]);
    const tangential = Math.sqrt(Math.max(0, best - along * along));
    const gap = Math.max(0, tangential - opts.spacing);
    out[i] = Math.min(opts.maxSearch, Math.hypot(along, gap));
  }
  return out;
}
