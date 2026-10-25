# ScanDiff integration test report

Audit of iOS app ↔ engine ↔ web ↔ Supabase, Oct 24 2026. Nothing in the database or Storage was deleted.

**Bottom line:**
- The engine, the contract, the iOS build and the web build all pass.
- Three things block the "scan on the phone, see it live on the web" demo. Realtime is off in Supabase (one SQL line; see section 3). The phone checklist (E) hasn't been run by a person yet. Checkout is a mock that never reads `scans.decision`.
- There are no check scans in the database yet, so no real check-vs-baseline comparison has been shown end to end.

## 1. Results

| Test | Result | Evidence |
|---|---|---|
| **A. Config and secrets** | PASS | `Secrets.xcconfig`, `engine/.env` and `web/.env.local` are gitignored. A search of tracked files and git history found no service-role key, Google client secret or JWT. All iOS keys are set. `ENGINE_URL` was empty (phone always used the mock) and is now `http://172.20.10.13:8000` (this Mac on the iPhone hotspot). Note: the demo password is committed in `ios/supabase/seed.sql` and `LoginView.swift` (DEBUG only). Xcode index files are committed under `ios/ScanDiff/ScanDiff.xcodeproj/-Xcc/`. |
| **B. Engine** | PASS | 91/91 tests. `/health` 200 in 8 ms. Real pair `coffee-maker-1` → `coffe-maker-2`: `damage_likely`, 33 regions, confidence 0.52, 19.3 s cold / 6.5–7.8 s warm (4.45 s inside the engine). Self-diff: `accept`, 0 regions, 4.1 s. Different objects (charger vs coffee maker): 422 "Bounding boxes differ by 54%". Unknown scan id: 404. Tampered model: 422 checksum mismatch. `coffee-maker-1` → `coffe-maker-3`: `needs_review`, 27 regions. Gaps: `compared_fraction` is null and `uncovered_regions` is always `[]`; `calibration.json` is missing, so the noise floor and threshold are placeholders (1 mm / 3 mm); the hash-chain ledger (`scandiff/ledger.py`) is not called by the API. |
| **C. Contract** | PASS | `scripts/check_contract.py`: the sample, the engine mock and three live responses validate against `engine/contract/diff_response.schema.json` with all aliases consistent. A deliberately broken response fails (negative control). Field mapping in `contract/README.md`. |
| **D. iOS build and unit tests** | PASS | Device build for iPhone 17 Pro Max: 0 errors, no new warnings. 17/17 XCTest cases pass: contract decoding of `contract/diff_response.json`, legacy field names, unknown verdicts, deep links, item-id normalization, metadata keys, SHA-256 against a known vector. Latest build installed on the phone. |
| **E. Phone end to end** | BLOCKED | Needs a person holding the phone; checklist in section 4. The installed build points at the real engine. |
| **F. Supabase** | FAIL (partly) | PASS: `scans` table and `scans` bucket exist; the `decision` check constraint allows `accept`/`dispute` and rejects `accepted` (400); demo user sign-in works. Realtime on `scans`: now enabled and verified (event in 0.74 s; see H). FAIL: no `profiles` table; RLS is wide open (anon can read and write every row, and list and upload to the bucket). Old rows have `created_by = "iPhone"`. |
| **G. Web** | PASS with gaps | `next build` and lint pass; no secret in the client bundle. Real item page loads the baseline model from the engine. Demo `/item/mug-001` broke once an engine URL was set (404) — **fixed**; now renders both 3D views, verdict, histogram and 8 clickable regions, labeled "Source: Mock data". `/checkout/mug-001` runs Listed → Held → Scan uploaded → Released with page-local state only. Missing: QR generator. Copy is wrong: "Shape only. LiDAR does not capture color." (textures are uploaded now). |
| **H. Demo dry run** (`scripts/demo_dry_run.mjs`) | PASS (re-run Oct 24, 6:07 PM) | Diff 8.7 s, decision written to `_smoke`, realtime event received 0.74 s after the write, decision restored. Realtime on `scans` is enabled (`alter publication` reports `scans` is already a member). |
| **I. Use-case coverage** | Gaps | See below. |

### I. Use-case coverage

| Use case | What exists | Gap |
|---|---|---|
| Marketplace handoff | iOS baseline + check, real engine diff, Accept/Dispute writes `scans.decision`, web item page | Checkout is not tied to `scans.decision`; no QR on the listing. |
| Shipping returns | Same flow as marketplace; web landing card "Shipping and returns" → `mug-001` (mock) | No return-specific screen; same checkout gap. |
| Rental car | Web demo `car-001` with pickup/return timeline (**mock data only**) | Object Capture works on tabletop objects; a car can't be scanned with this app. Pitch it as the same engine on a different capture source, not a live demo. |
| Hotel room | Nothing in iOS, engine or web | Rooms need RoomPlan or area capture. Pitch-only. |

### Item ids to review (not deleted)

All five rows are baselines; there are no check scans.

| Row id | `item_id` | Issue |
|---|---|---|
| `371735cf…` | `coffe-maker-2` | Misspelled "coffee"; a second baseline of the coffee maker with the cord moved |
| `5336d978…` | `coffe-maker-3` | Misspelled "coffee" |
| `e4155d6c…` | `_smoke` | Test row used by the dry run; `decision` is written and restored by the script |
| `4d4b567f-8b1a-4146-8f55-ef59ef8a3a07` | `coffee-maker-1` | Fine; `created_by = "iPhone"` |
| `e10ef66f-0c5c-4703-9f92-26daefce4113` | `charger-1` | Fine; `created_by = "iPhone"` |

## 2. Fixes made

Known issue 1, contract mismatch. The engine keeps its `verdict` (`accept | damage_likely | needs_review`) because the web app and engine tests depend on it. The brief's names are added as derived fields, so the two can't disagree.
- `engine/app/schemas.py`: computed `triage`, `confidence`, `reason`, `compared_fraction`, `histogram.bins_mm`, and per region `triage`, `bbox`, `max_mm`, `mean_mm`.
- `engine/contract/diff_response.schema.json` regenerated by the engine tests.
- `web/lib/contract.ts` regenerated. `web/lib/diffClient.ts` maps engine verdicts to the viewer's verdicts (`toVerdict`) and `compared_fraction` to coverage.
- `ios/ScanDiff/ScanDiff/DiffContract.swift` (new): tolerant decoder that accepts both the brief's and the engine's field names.
- `contract/diff_response.json`, `contract/README.md`, `scripts/check_contract.py` (new): sample, field mapping, validator.

Known issue 2, `created_by`. `ios/ScanDiff/ScanDiff/ScanSessionModel.swift` and `ScanBundle.swift` now write the Supabase user id (lowercase UUID), plus `device` (model identifier such as `iPhone18,2`), `ios_version` and `image_count`. Old rows still say `"iPhone"`.

Known issue 3, item-id normalization. `Models.swift` (`ItemID.normalize`: lowercase kebab-case), `DeepLink.swift` and `AppModel.swift`. A check scan first confirms a baseline exists for that id and suggests near matches ("did you mean coffee-maker-1?").

Known issue 4, mock badge.
- `EngineClient.swift`: the mock client sets `isMock`, and the app logs a warning when `ENGINE_URL` is empty.
- `DiffResultView.swift`: orange **MOCK RESULT** badge.
- The web already shows "Source: Mock data".

Other fixes:
- `ScanSessionModel.swift`, `ScanFlowView.swift`, `DiffResultView.swift`: new "Comparing…" screen; a failed comparison shows the engine's message (404 / 422 / 503) with **Try again**, which re-runs the diff without re-uploading.
- `UploadService.swift`: each file upload retries up to 3 times with backoff (safe because uploads use upsert).
- `Configuration/Info.plist`: `NSAllowsLocalNetworking` and a local-network usage string, so the phone can reach an HTTP engine on the LAN.
- `web/lib/diffClient.ts`: demo catalog items always use the browser mock, so `/item/mug-001` and `/item/car-001` keep working when an engine URL is set.
- `ScanDiffTests/` (new target, 17 tests), `project.pbxproj`, shared scheme.
- `ios/.gitignore`: ignores `*.xcodeproj/-Xcc/`.
- `scripts/demo_dry_run.mjs` (new): diff → realtime → decision write → restore. It reads `DEMO_EMAIL`/`DEMO_PASSWORD` from the environment and never prints them.

Local only, gitignored: `engine/.env`, `web/.env.local`, `ENGINE_URL` in `Secrets.xcconfig`.

## 3. Remaining work

Ordered by demo impact within each owner.

**Supabase, needs your approval (whoever has dashboard access, 5 min):**
1. Enable realtime (unblocks F, H and the live web update): `alter publication supabase_realtime add table public.scans;`
2. Optional: backfill `created_by` on the four real rows (a data write, so it needs approval).

**Koushik (iOS)**

| # | Task | Time |
|---|---|---|
| 1 | Run the phone checklist (section 4) against the real engine | 30 min |
| 2 | Capture a clean mug baseline and check pair with correct ids (rigid object, no loose cord) | 20 min |
| 3 | `git rm -r --cached ios/ScanDiff/ScanDiff.xcodeproj/-Xcc` and commit | 2 min |
| 4 | Reject models that are too small or too thin (bounding box from `MeshCleaner`); a threshold set too tight would block good scans | 25 min |
| 5 | `kind=calibration` deep link (brief); only needed if Adi calibrates from phone scans | 30 min |
| — | Skipped as not worth the risk: "scan the same way" ghost overlay (2–3 h); in-app QR scanner (45 min; the Camera app already opens `scandiff://` QR links); location (20 min plus a permission prompt); PLY export (15 min; the engine reads OBJ/USDZ) | |

**Adi (engine)**

| # | Task | Time |
|---|---|---|
| 1 | Host the engine on public HTTPS (Fly/Render, or a `cloudflared` tunnel) so the phone doesn't depend on the hotspot IP | 30–60 min |
| 2 | Run calibration on 3 scans of an unchanged object and commit `calibration.json` (thresholds are placeholders) | 30 min |
| 3 | Warm-up on startup or a cache, so the first diff isn't 19 s | 15 min |
| 4 | Coverage: compute `compared_fraction` and `uncovered_regions` (the web shows coverage only for mock data) | 1–2 h |
| 5 | Moved soft parts (the coffee-maker cord) produce 33 regions and `damage_likely`; filter thin or elongated regions, or keep demos to rigid items | 1–2 h |
| 6 | Wire `ledger.py` into `/diff` if the pitch mentions hash-chained history | 1 h |
| 7 | `load_mesh` accepts truncated files when no checksum is given | 30 min |

**Keshav (web, checkout, pitch)**

| # | Task | Time |
|---|---|---|
| 1 | After realtime is on, confirm the item page updates live when the phone uploads | 10 min |
| 2 | Wire checkout to the check scan's `scans.decision`: `accept` → Released, `dispute` → Disputed (realtime) | 45–60 min |
| 3 | QR generator on the listing: `scandiff://scan?item=<id>&kind=check`, with the id lowercased kebab-case | 30 min |
| 4 | Remove "LiDAR does not capture color"; check that textured models render | 10 min |
| 5 | Pitch: say "triage for a person", show the mock labels honestly, present rental and hotel as next steps | 20 min |

## 4. Phone checklist (E)

Engine running on this Mac (`uvicorn` on port 8000), Mac on the iPhone's hotspot, latest build installed. Launch the app from the home screen, not from Xcode.

| # | Step | Expected |
|---|---|---|
| 1 | Sign out. Open `scandiff://scan?item=Mug-002&kind=baseline` in Safari or Notes | Login screen; after sign-in, the scan starts for `mug-002` (normalized) |
| 2 | Baseline: preflight → capture 2 orbits → processing → review → upload | "Saved" screen; new `scans` row with `kind=baseline` and `created_by` = your user id |
| 3 | First engine call | iOS asks to allow local network access: tap Allow |
| 4 | Check scan: `scandiff://scan?item=mug-002&kind=check` (1 orbit, auto-finish) | Upload, then the "Comparing…" screen |
| 5 | Result | Real verdict, **no** MOCK RESULT badge, region list, coverage text |
| 6 | Tap Accept, then Dispute on another run | `scans.decision` = `accept` / `dispute` on the check row |
| 7 | Check scan for an item without a baseline (`kind=check&item=nothing-here`) | Blocked before capture, with "did you mean" suggestions |
| 8 | Airplane mode on, tap Upload | Error message, back on Review with the scan kept; turn airplane mode off and upload succeeds |
| 9 | Stop the engine, run a check scan | Connection error ("Could not connect to the server") and **Try again**; restart the engine and Try again works without re-uploading |

`Documents/diagnostics.log` on the phone records every stage (`upload retry`, `diff done triage=… mock=false`).

## 5. Live-demo risks

| Risk | Fallback |
|---|---|
| Phone can't reach the engine (venue Wi-Fi isolates devices, laptop IP changes) | Keep the Mac on the iPhone hotspot (current setup); if the IP changes, update `ENGINE_URL` and rebuild (1 min). Better: Adi's public HTTPS engine. Last resort: the mock result, which is visibly badged, so say so. |
| Realtime still off | Run the one-line SQL before the demo; otherwise refresh the web page after the phone upload. |
| App freezes when launched from Xcode (Metal validation in RealityKit on iOS 27) | Launch from the home screen; the scheme already disables validation. |
| On-device processing takes 1–2 minutes | Capture the baseline before the demo; do only the 1-orbit check scan live. |
| First diff after engine start is slow (19 s) | Run `node scripts/demo_dry_run.mjs` once before going on stage to warm up. |
| False "damage" from loose parts or a different setup | Demo with a rigid mug, same mat and lighting; the preflight checklist covers this. |
| Typo in item id | Use QR or deep links instead of typing; ids are normalized and the app suggests near matches. |
| Checkout doesn't react to the decision | Present checkout as a mock (it's labeled), or land Keshav's task 2 first. |
| Judges ask about security | Be upfront: RLS is open for the hackathon. The plan is per-user RLS, a `profiles` table, and moving the demo password out of the repo and rotating it. |
| Engine or venue network down | Web demo items (`/item/mug-001`, `/item/car-001`) run entirely in the browser; also keep a screen recording of a real run. |
