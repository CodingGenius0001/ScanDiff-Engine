/**
 * The iOS app's `metadata.json` (one per scan upload) and its mapping onto
 * ScanMeta. Shape from engine/UPLOAD_FORMAT.md; a real capture is in
 * `fixtures/metadata.example.json` (copied from engine/metadata.json).
 */
import type { ScanMeta } from "./types";

export interface IosScanMetadata {
  /** ISO 8601. */
  created_at: string;
  created_by: string;
  device: string;
  item_id: string;
  /** Free-form, e.g. "baseline", "pickup" or "return". */
  kind: string;
  model_file: string;
  /** Hex SHA-256 of the model file, computed on the phone. */
  model_sha256: string;
  scan_id: string;
  /** Camera poses and intrinsics; the viewer does not use them. */
  photos: { file: string }[];
  /** Missing means meters. */
  units?: string;
}

const KIND_NAME: Record<string, string> = {
  baseline: "Baseline scan",
  check: "Check scan",
  pickup: "Pickup scan",
  return: "Return scan",
};

export function scanName(kind: string): string {
  return KIND_NAME[kind] ?? `Scan (${kind})`;
}

/** `modelUrl` is where the engine published this scan as GLB (it cannot be the USDZ). */
export function toScanMeta(meta: IosScanMetadata, modelUrl: string): ScanMeta {
  return {
    id: meta.scan_id,
    name: scanName(meta.kind),
    capturedAt: meta.created_at,
    capturedBy: meta.created_by,
    device: meta.device,
    kind: meta.kind,
    modelUrl,
    format: "glb",
    sha256: meta.model_sha256,
  };
}
