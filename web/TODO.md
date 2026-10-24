# TODO

## Done
- Scaffolded Next.js 16 (App Router, TypeScript, Tailwind) with three, @react-three/fiber, @react-three/drei and Recharts.
- Viewer `/item/[id]`, evidence page `/item/[id]/evidence`, demo checkout `/checkout/mug-001`, rental car timeline, all on browser mock data.
- Engine contract: `lib/contract.ts` generated from `engine/contract/diff_response.schema.json` (`npm run gen:contract`).
- `diffClient.ts` calls the engine's `POST /diff` when `NEXT_PUBLIC_DIFF_API_URL` is set and maps the response onto `DiffResult` (meters to millimeters, fingerprints, verdict reason and confidence, ICP numbers).
- Engine mode: baseline shows the engine's baked heat map, new scan shows the aligned GLB, signed legend (blue dent, gray unchanged, red added), region and "no data" markers, photo crops when present.
- Every page shows its data source (browser mock, engine example, engine).
- `lib/scanMetadata.ts` maps the iOS `metadata.json` onto `ScanMeta`; real example in `lib/fixtures/metadata.example.json`.
- Real scans from Supabase (`lib/scans.ts`): `/item/<item_id>` builds the timeline from the newest baseline plus later check scans; the home page lists scanned items; a baseline-only item shows "waiting for a check scan". Uses the engine's `is_mock` to label example responses.
- Tested 2026-10-24 at 412 px and 1366 px: browser mock (37 checks: checkout, dispute, reload persistence, blocked storage, no horizontal scroll, no console errors) and engine mode against the engine's `/diff` (no console errors, no horizontal scroll).

## In progress
- Nothing.

## Blocked / next
- **First real comparison:** `coffee-maker-1` has only a baseline. Needs a check scan from Koushik and the engine running (`NEXT_PUBLIC_DIFF_API_URL`); the browser mock cannot compare real scans.
- **Accept and Dispute for real scans:** hidden for Supabase items. Next: write `scans.decision` (the demo order flow is mock only).
- **Real items have no title, kind or price** in the table, so they show their `item_id`, count as shipping, and have no checkout.
- **Realtime refresh** when the phone finishes uploading (Supabase realtime on `scans`).
- **Engine URL** for the demo: a public HTTPS URL (or the laptop's LAN address for the OnePlus).

## Assumptions to confirm with teammates
1. Resolved by Adi (0c02c0f): `is_mock` added, +Y up, mock r2 depth fixed, `base_id`/`new_id` are `scans.id`, `kind` is `baseline` or `check`.
5. **Adi: fingerprints.** Assumed `base_fingerprint` equals the phone's `model_sha256`. A hash is not tamper-evident until it is recorded somewhere independent at handoff time.
6. **Adi: diff time.** `diff_time_s` is 3.4 s in the mock. If real runs are slow, `/diff` needs a status endpoint instead of one long request.
7. **Team: which real item is the demo listing?** The checkout is tied to the mock mug; decide whether the live demo uses a real `item_id`.

## Notes for later
- The browser mock caps distances at its search radius (300 mm for the car), so "Up to 300 mm" for the missing mirror is a cap, not a measurement.
- Item metadata comes from `lib/items.ts` (mock catalog), kept separate from `diffClient.ts`.
