# TODO

## Done
- Scaffolded Next.js 16 (App Router, TypeScript, Tailwind) with three, @react-three/fiber, @react-three/drei and Recharts.
- Viewer `/item/[id]`, evidence page `/item/[id]/evidence`, demo checkout `/checkout/mug-001`, rental car timeline, all on browser mock data.
- Engine contract: `lib/contract.ts` generated from `engine/contract/diff_response.schema.json` (`npm run gen:contract`).
- `diffClient.ts` calls the engine's `POST /diff` when `NEXT_PUBLIC_DIFF_API_URL` is set and maps the response onto `DiffResult` (meters to millimeters, fingerprints, verdict reason and confidence, ICP numbers).
- Engine mode: baseline shows the engine's baked heat map, new scan shows the aligned GLB, signed legend (blue dent, gray unchanged, red added), region and "no data" markers, photo crops when present.
- Every page shows its data source (browser mock, engine example, engine).
- `lib/scanMetadata.ts` maps the iOS `metadata.json` onto `ScanMeta`; real example in `lib/fixtures/metadata.example.json`.
- Tested 2026-10-24 at 412 px and 1366 px: browser mock (37 checks: checkout, dispute, reload persistence, blocked storage, no horizontal scroll, no console errors) and engine mode against the engine's `/diff` (no console errors, no horizontal scroll).

## In progress
- Nothing.

## Blocked / next
- **Real scans in the viewer:** item and scan metadata still come from the mock catalog (`lib/mock/catalog.ts`). Next: read the `scans` table from Supabase (`ios/supabase/setup.sql`) and map rows with `scanMetadata.ts`.
- **Realtime refresh** when the phone finishes uploading (Supabase realtime on `scans`).
- **Engine URL** for the demo: a public HTTPS URL (or the laptop's LAN address for the OnePlus).

## Assumptions to confirm with teammates
1. **Adi: is the response mock?** The engine returns its fake response even without `?mock=true` until `PIPELINE_READY` is set, and the web app cannot tell. Ask for an `is_mock` field so the page never labels fake data as engine output.
2. **Adi: up axis.** The engine mock treats `z < -0.04` as the underside (Z up), while ARKit is Y up. The web assumes Y (`NEXT_PUBLIC_DIFF_UP_AXIS`).
3. **Adi: mock consistency.** Region r2's reason says 4.9 mm while its `max_depth_mm` is 4.4 mm (mock only).
4. **Adi: what `base_id` / `new_id` are.** Assumed to be `scans.id` (the iOS `scan_id`).
5. **Adi: fingerprints.** Assumed `base_fingerprint` equals the phone's `model_sha256`. A hash is not tamper-evident until it is recorded somewhere independent at handoff time.
6. **Adi: diff time.** `diff_time_s` is 3.4 s in the mock. If real runs are slow, `/diff` needs a status endpoint instead of one long request.
7. **Koushik: `kind` values.** The table allows `baseline` and `check`; the upload format says free-form (`baseline`, `pickup`, `return`). The web handles both.

## Notes for later
- The browser mock caps distances at its search radius (300 mm for the car), so "Up to 300 mm" for the missing mirror is a cap, not a measurement.
- Item metadata comes from `lib/items.ts` (mock catalog), kept separate from `diffClient.ts`.
