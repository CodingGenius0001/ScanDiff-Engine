import type { DiffSource, LengthUnit, RegionLabel, Verdict, Vec3, UpAxis } from "./types";

/** Up to two decimals, so a 1.25 mm threshold is not shown as 1.3 mm. */
export function formatDistance(d: number, units: LengthUnit): string {
  return `${Number(d.toFixed(d >= 100 ? 0 : 2))} ${units}`;
}

export function formatPercent(f: number): string {
  return `${(f * 100).toFixed(f < 0.1 ? 1 : 0)}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export const VERDICT_TEXT: Record<Verdict, { title: string; detail: string }> = {
  match: { title: "Match", detail: "No shape change above the noise threshold." },
  minor_wear: { title: "Minor wear", detail: "Small shape changes that look like normal wear." },
  needs_review: { title: "Needs review", detail: "Shape changes that a person should look at." },
};

/** Where the comparison came from, so mock data is never presented as live. */
export const SOURCE_TEXT: Record<DiffSource, { short: string; note: string }> = {
  browser_mock: {
    short: "Mock data (generated in the browser)",
    note: "Generated in the browser from mock data for a demo. The fingerprints are placeholders and are not yet anchored, so they are not yet tamper-evident on their own.",
  },
  engine_mock: {
    short: "Example response from the ScanDiff engine (mock)",
    note: "A fixed example response from the ScanDiff engine, not a comparison of real scans. The fingerprints are example values, not hashes of real scan files.",
  },
  engine: {
    short: "ScanDiff engine",
    note: "Computed by the ScanDiff engine. The fingerprints are SHA-256 hashes reported by the engine. They are not yet anchored anywhere independent, so they are not yet tamper-evident on their own.",
  },
};

export const LABEL_TEXT: Record<RegionLabel, string> = {
  normal_wear: "Normal wear",
  needs_review: "Needs review",
};

/** Model coordinates to the Y-up display frame the viewer uses. */
export function toDisplay(p: Vec3, upAxis: UpAxis): Vec3 {
  return upAxis === "Z" ? [p[0], p[2], -p[1]] : p;
}
