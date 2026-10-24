# TODO

## Done
- Scaffolded Next.js 16 (App Router, TypeScript, Tailwind) with three, @react-three/fiber, @react-three/drei and Recharts.
- Adapters: `lib/types.ts`, `lib/diffClient.ts` (`getDiff`), `lib/modelLoader.ts` (GLB, PLY, `mock://`).
- Mock scenarios generated in code: mug (dent, missing handle piece, slight wear, uncovered underside) and rental car (door dent, missing mirror, bumper wear, uncovered roof).
- Viewer `/item/[id]`: linked baseline and new 3D views, heat map toggle, histogram with threshold line, flagged regions that move the camera, "no data" regions, verdict banner, version timeline, Accept and Dispute.
- Evidence page `/item/[id]/evidence`: scans, timestamps, placeholder SHA-256 field, diff summary, print layout.
- Demo checkout `/checkout/mug-001`: Pay with Visa (demo) -> held: scan required -> simulate scan uploaded -> viewer -> released with receipt. Status flow lives in `lib/orderStatus.ts`.
- Tested with Playwright at 412 px (phone) and 1366 px (laptop): full checkout flow, dispute flow, reload persistence, blocked localStorage, no horizontal scroll, no console errors in dev or production builds.

## In progress
- Nothing. Waiting for teammate formats.

## Blocked
- Real diff API: needs the backend response shape. Plug in at `fetchDiff` / `toDiffResult` in `lib/diffClient.ts`.
- Real scan files: needs the iOS export format. Plug in at `lib/modelLoader.ts`.
- Real fingerprints: needs a decision on who computes the SHA-256 and where it is anchored.

## Assumptions to confirm with teammates
1. **File format** (iOS): GLB or PLY. OBJ, USDZ and Draco-compressed GLB are not supported yet.
2. **Units**: millimeters. Every distance, radius and threshold is in the `units` field of the diff result.
3. **Orientation**: Y up (Z-up models are rotated). Stated in `upAxis`.
4. **Alignment** (backend): both models arrive already aligned in one frame. `alignment` (4x4) exists in the types but is not applied.
5. **Distances** (backend): `newToBase` has one value per vertex of the new model; `baseToNew` (optional) has one per vertex of the baseline. One-sided distances cannot show missing material, so please ask the backend for both directions. `null` = no data.
6. **Vertex order**: distance index i matches vertex i as loaded. For multi-mesh GLB files the loader merges meshes in traversal order; the backend must use the same order (single-mesh exports avoid this).
7. **Coverage** ("no data"): must come from the capture or backend side. Geometry alone cannot tell "missing part" from "not scanned".
8. **Noise threshold** (backend): in the diff result. The 5 mm value exists only in `lib/mock/scenarios.ts`.
9. **Verdict and labels** (backend): `match` / `minor_wear` / `needs_review`; regions labeled `normal_wear` / `needs_review` with confidence 0 to 1, center and radius in model units.
10. **Fingerprint**: SHA-256 of each scan file, currently `null` and shown as a placeholder. A hash is not tamper-evident until it is recorded somewhere independent at handoff time.

## Notes for later
- The mock caps distances at its search radius (300 mm for the car), so "Up to 300 mm" for the missing mirror is a cap, not a measurement.
- The evidence page and home page say the data is mock. Remove that wording when real data is wired in.
- Item metadata comes from `lib/items.ts` (mock catalog), kept separate from `diffClient.ts`.
