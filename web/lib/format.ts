import type { LengthUnit, RegionLabel, Verdict, Vec3, UpAxis } from "./types";

export function formatDistance(d: number, units: LengthUnit): string {
  const digits = d >= 100 ? 0 : 1;
  return `${d.toFixed(digits)} ${units}`;
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

export const LABEL_TEXT: Record<RegionLabel, string> = {
  normal_wear: "Normal wear",
  needs_review: "Needs review",
};

/** Model coordinates to the Y-up display frame the viewer uses. */
export function toDisplay(p: Vec3, upAxis: UpAxis): Vec3 {
  return upAxis === "Z" ? [p[0], p[2], -p[1]] : p;
}
