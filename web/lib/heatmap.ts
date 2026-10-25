/**
 * Per-vertex heat map colors. The threshold and scale come from the
 * DiffResult; nothing here is hardcoded to a particular unit or threshold.
 *
 * At or below the noise threshold: light gray, like the engine's neutral
 * band. Above it: amber through red to dark red on a log scale, so a 30 mm
 * dent and a 300 mm missing part both stay readable. No data: dark slate.
 */
import * as THREE from "three";

export const COLORS = {
  noChange: "#c9c9c5",
  noData: "#4b5563",
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
