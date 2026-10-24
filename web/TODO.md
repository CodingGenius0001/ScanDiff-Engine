# TODO

## Done
- Scaffolded Next.js (App Router, TypeScript, Tailwind) with three, @react-three/fiber, @react-three/drei and Recharts.

## In progress
- Adapters (`lib/types.ts`, `lib/diffClient.ts`, `lib/modelLoader.ts`) and the mock scenario.

## Blocked
- Wiring the real diff API: waiting on the backend response shape.
- Loading real scans: waiting on the iOS export format.

## Assumptions to confirm with teammates
1. **File format** (iOS): GLB or PLY. Other formats are not supported yet.
2. **Units**: millimeters. Distances and the noise threshold arrive in the units named in the diff result.
3. **Orientation**: Y up, as stated in the diff result.
4. **Alignment** (backend): both models are returned already aligned in one coordinate frame. An optional 4x4 alignment matrix is supported in the types but unused.
5. **Distances** (backend): one value per vertex of the *new* scan, measured to the baseline. `null` means that vertex has no data (it is covered by only one scan).
6. **Noise threshold** (backend): supplied in the diff result. The web app never hardcodes it.
7. **Verdict** (backend): `match`, `minor_wear` or `needs_review`, decided by the backend.
8. **Region labels** (backend): `normal_wear` or `needs_review`, with a confidence from 0 to 1, a center point and a radius in model units.
9. **Fingerprint**: SHA-256 of each scan file. It is a placeholder for now and is not anchored anywhere independent, so it is not yet tamper-evident by itself.
