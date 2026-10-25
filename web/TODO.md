# TODO

## Done
- Scaffolded Next.js 16 (App Router, TypeScript, Tailwind) with three, @react-three/fiber, @react-three/drei and Recharts.
- Viewer `/item/[id]`, evidence page `/item/[id]/evidence`, demo checkout `/checkout/mug-001`, rental car timeline, all on browser mock data.
- Engine contract: `lib/contract.ts` generated from `engine/contract/diff_response.schema.json` (`npm run gen:contract`).
- `diffClient.ts` calls the engine's `POST /diff` when `NEXT_PUBLIC_DIFF_API_URL` is set and maps the response onto `DiffResult` (meters to millimeters, fingerprints, verdict reason and confidence, ICP numbers).
- Engine mode: baseline shows the plain base GLB, new scan shows the engine's heat map (its own aligned surface; removed parts appear only in regions), signed legend (blue dent, gray unchanged, red added), region and "no data" markers, photo crops when present.
- Every page shows its data source (browser mock, engine example, engine).
- `lib/scanMetadata.ts` maps the iOS `metadata.json` onto `ScanMeta`; real example in `lib/fixtures/metadata.example.json`.
- Real scans from Supabase (`lib/scans.ts`): `/item/<item_id>` builds the timeline from the newest baseline plus later check scans; the home page lists scanned items; a baseline-only item shows "waiting for a check scan". Uses the engine's `is_mock` to label example responses.
- Accept and Dispute for real scans write `decision` on the newest check scan's row (the same field the iOS app writes), read it back on load, and show it on the evidence page. Dispute opens the evidence page. A write that matches no row shows an error. Tested against a local stand-in for Supabase, not the shared table.
- A baseline-only item shows its own 3D model from the engine (`GET /scans/{id}/model.glb`, about 6 s on first load). Engine errors (`{"detail": ...}`) are shown on the page. Verified with the real `coffee-maker-1` scan.
- Live updates on real item pages (`lib/liveScans.ts`): polls `scans` every 4 s while visible and listens on Supabase realtime. A new scan refreshes the page in place; a decision made on the phone appears without reload. Tested with a simulated upload (page updated in about 1 to 5 s).
- Tested 2026-10-24 at 412 px and 1366 px: browser mock (37 checks: checkout, dispute, reload persistence, blocked storage, no horizontal scroll, no console errors) and engine mode against the engine's `/diff` (no console errors, no horizontal scroll).

- Sign-in (2026-10-24): Google, the demo account, or email and password through Supabase Auth; sessions in cookies (`@supabase/ssr`, `proxy.ts`). Real scans are read as the signed-in user on the server and in the browser; signed out, real items show a sign-in prompt. The app refuses a secret or service-role key. Tested on the real project: demo sign-in, reads, sign-out (20 checks).
- Live checkout for real items (`/checkout/<id>`, `lib/realOrder.ts`): held until a check scan uploaded after the hold is accepted, released the moment the decision lands, dispute state with the evidence page. `/sell` lists an item with ID checks (lowercase, allowed characters, "did you mean") and QR codes for the `scandiff://scan` link. Rehearsed against a local fake Supabase with a script playing the phone: list, baseline, pay, check scan, accept from the phone and from the web, dispute, and an old accepted scan not releasing a new order (15 checks; 3–4 s per update by polling). Every data read went out with the user's token.
- Viewer checked on a real engine comparison (`coffee-maker-1` vs `coffe-maker-2`): baseline, check and heat-map GLBs load from Storage, 33 clickable regions, histogram, crops.

## In progress
- Nothing.

## Blocked / next
- **First real comparison:** `coffee-maker-1` has only a baseline. Needs a check scan from Koushik and the engine running (`NEXT_PUBLIC_DIFF_API_URL`); the browser mock cannot compare real scans.
- **Real items have no title, kind or price** in the table. `/sell` keeps a title and price in the browser; elsewhere they show their `item_id` and count as shipping.
- **QR codes on a real iPhone:** the codes decode to the right link (checked with zbarimg), but opening them from the Camera app is untested.
- **Realtime is off:** a decision write on `_smoke` produced no realtime event, so updates come from the 4 s poll. Koushik: run the publication SQL below.
- **Google sign-in on the deployed site** needs its `/auth/callback` URL in Supabase's Redirect URLs.
- **Engine URL** for the demo: a public HTTPS URL (or the laptop's LAN address for the OnePlus).

## Assumptions to confirm with teammates
- **Koushik: realtime.** For instant updates instead of 4 s polling, run `alter publication supabase_realtime add table public.scans;` in the Supabase SQL editor.
- Resolved by Adi (0b8fef5): the engine accepts `textures` as names or `{file, sha256}`.
0. **Koushik: decisions can be changed.** The table policies still allow anonymous reads and updates, so the web's sign-in is enforced by the app, not the database. Before limiting the policies to `authenticated`, note the engine also reads the table with the publishable key (as anon) and would need a signed-in or server-side key.
1. Resolved by Adi (0c02c0f): `is_mock` added, +Y up, mock r2 depth fixed, `base_id`/`new_id` are `scans.id`, `kind` is `baseline` or `check`.
5. **Adi: fingerprints.** Assumed `base_fingerprint` equals the phone's `model_sha256`. A hash is not tamper-evident until it is recorded somewhere independent at handoff time.
6. **Adi: diff time.** `diff_time_s` is 3.4 s in the mock. If real runs are slow, `/diff` needs a status endpoint instead of one long request.
7. **Team: which real item is the demo listing?** The checkout is tied to the mock mug; decide whether the live demo uses a real `item_id`.

## Notes for later
- The browser mock caps distances at its search radius (300 mm for the car), so "Up to 300 mm" for the missing mirror is a cap, not a measurement.
- Item metadata comes from `lib/items.ts` (mock catalog), kept separate from `diffClient.ts`.
