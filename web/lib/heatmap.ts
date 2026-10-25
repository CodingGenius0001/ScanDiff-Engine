/**
 * Per-vertex heat map colors. The threshold and scale come from the
 * DiffResult; nothing here is hardcoded to a particular unit or threshold.
 *
 * At or below the noise threshold: light gray, like the engine's neutral
 * band. Above it: amber through red to dark red on a log scale, so a 30 mm
 * dent and a 300 mm missing part both stay readable. No data: cool slate.
 */
import * as THREE from "three";

export const COLORS = {
  noChange: "#c9c9c5",
  noData: "#8a9ab2",
  // Plaster white: plain models read as casts on the gray exhibit plate.
  neutral: "#f2f0ea",
  ramp: ["#fbbf24", "#f97316", "#dc2626", "#7f1d1d"],
} as const;

const ramp = COLORS.ramp.map((c) => new THREE.Color(c));
const unchanged = new THREE.Color(COLORS.noChange);
const gray = new THREE.Color(COLORS.noData);

/** Position of d on the ramp, 0 to 1, or -1 when at or below threshold. */
export function rampPosition(d: number, threshold: number, max: number): number {
  if (d <= threshold) return -1;
  if (max <= threshold) return 1;
  return Math.min(1, Math.log(d / threshold) / Math.log(max / threshold));
}

export function heatColor(d: number | null, threshold: number, max: number, out = new THREE.Color()) {
  if (d === null) return out.copy(gray);
  const t = rampPosition(d, threshold, max);
  if (t < 0) return out.copy(unchanged);
  const x = t * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  return out.copy(ramp[i]).lerp(ramp[i + 1], x - i);
}

/** RGB triplets for a color attribute, in linear color space as three.js expects. */
export function vertexColors(distances: (number | null)[], threshold: number, max: number): Float32Array {
  const out = new Float32Array(distances.length * 3);
  const c = new THREE.Color();
  for (let i = 0; i < distances.length; i++) {
    heatColor(distances[i], threshold, max, c);
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  return out;
}

/** CSS gradient matching the ramp, for the legend. */
export const RAMP_CSS = `linear-gradient(to right, ${COLORS.ramp.join(", ")})`;

/**
 * Material that is gone: the baseline triangles inside a region seen only on
 * the baseline that are farther than `threshold` from the new scan, grown a
 * few triangle rings along the surface so the ghost runs into the break
 * faces instead of stopping just short of them (the overlap sits inside the
 * solid part, where it is hidden).
 */
export function missingGhost(
  base: THREE.BufferGeometry,
  baseToNew: (number | null)[],
  threshold: number,
  regions: { center: [number, number, number]; radius: number }[],
  rings = 4,
): THREE.BufferGeometry | null {
  const pos = base.getAttribute("position");
  if (!regions.length || baseToNew.length !== pos.count) return null;
  const inRegion = (i: number) =>
    regions.some((r) => {
      const dx = pos.getX(i) - r.center[0], dy = pos.getY(i) - r.center[1], dz = pos.getZ(i) - r.center[2];
      return dx * dx + dy * dy + dz * dz <= r.radius * r.radius;
    });
  const index = base.index;
  const tri = index ? (t: number, k: number) => index.getX(t * 3 + k) : (t: number, k: number) => t * 3 + k;
  const count = index ? index.count / 3 : pos.count / 3;

  const gone = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) gone[i] = (baseToNew[i] ?? 0) > threshold && inRegion(i) ? 1 : 0;
  for (let ring = 0; ring < rings; ring++) {
    const next = gone.slice();
    for (let t = 0; t < count; t++) {
      const a = tri(t, 0), b = tri(t, 1), c = tri(t, 2);
      if (gone[a] || gone[b] || gone[c]) next[a] = next[b] = next[c] = 1;
    }
    gone.set(next);
  }

  const out: number[] = [];
  for (let t = 0; t < count; t++) {
    const a = tri(t, 0), b = tri(t, 1), c = tri(t, 2);
    if (!gone[a] || !gone[b] || !gone[c]) continue;
    for (const i of [a, b, c]) out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  if (!out.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}
