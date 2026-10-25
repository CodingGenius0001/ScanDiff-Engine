# ScanDiff audit: aggregate report

Audit of the whole repository on branch `audit/full-audit` (from `main` at `11060bd`), Oct 24–25 2026, ahead of the Cal Hacks 13.0 Devpost deadline (Sun Oct 25, 9:00 AM PDT).

Ground rules followed: no calls to the live Supabase project, the AWS engine (`engine.scandiff.us`), Nessie or Claude. Supabase was replaced by a throwaway local Postgres 16 (Unix socket only) and fakes; Nessie and Claude by fakes. `setup.sql` was only run against that local Postgres; `deploy.sh` was not run. No values from `.env` files or keys are printed in this report.

## 1. Project overview

ScanDiff records tamper-evident 3D evidence of an item's condition at handoff. A seller scans the item with a LiDAR iPhone (baseline), the buyer scans it on arrival (check), the engine compares the two, and the buyer accepts or disputes. In the demo checkout the payment is held until the check scan is accepted.

```
iPhone app (ios/)  ──upload──▶  Supabase (scans table + Storage)  ◀──read──  Website (web/)
        │                                   ▲                                   │
        └──────────── POST /diff ──▶  Engine (engine/)  ◀──── POST /diff ───────┘
```

| Component | What it does | Verified facts from this audit |
|---|---|---|
| `ios/ScanDiff` | SwiftUI capture app: Object Capture, on-device `PhotogrammetrySession`, OBJ/MTL/textures, key photos with poses, SHA-256 manifest (`files[]`), deep link `scandiff://scan?item=…&kind=baseline\|check&invite=…`, upload with 3-attempt retry, tolerant `DiffContract` decoder, MOCK RESULT badge, engine failover (primary/fallback). | Builds; XCTest target `ScanDiffTests`. Guided capture does not run in the Simulator. |
| `ios/supabase` | `setup.sql`: `scans`, `items`, `item_members`, RLS, security-definer RPCs (`claim_item`, `create_item`, `join_item`, `item_access`), Storage policies, realtime publication. `tests/run.sh` checks the rules on a local Postgres. | Re-runnable; existing RLS suite passes locally. |
| `engine/` | FastAPI + Open3D/trimesh. `GET /health` hands out a session, `POST /diff` needs it. Pipeline: load USDZ (usd-core) → sample + clean → FPFH RANSAC/FGR → point-to-plane ICP → signed distances → photo-based coverage (`compared_fraction`, `uncovered_regions`) → DBSCAN regions → geometry (+ optional Claude vision) classification → verdict `accept \| damage_likely \| needs_review \| inconclusive` with derived `triage`/`confidence`/`reason`. Heat map and both GLBs uploaded to Supabase Storage. Docker + Caddy, `deploy/deploy.sh`. | `scandiff/ledger.py` is a one-line stub: **no hash chain exists** (see AUD-09). `calibration.json` is absent, so noise floor and threshold are the 3 mm placeholders. |
| `web/` | Next.js 16 (App Router), three.js viewer, Supabase auth (`@supabase/ssr`), realtime + 4 s polling (`lib/liveScans.ts`), mock checkout (`/checkout/mug-001`) and live checkout for real items (`lib/realOrder.ts`), Nessie refunds (`/api/refunds`), evidence page, `/sell`, `/join`. | Nessie is only used for refunds on the **mock** `mug-001` dispute. The live checkout for real items is gated on `scans.decision` but does not call Nessie (see AUD-10). |
| `contract/` | `diff_response.json` (real sample) + `engine/contract/diff_response.schema.json` generated from the engine's Pydantic models; `web/lib/contract.ts` generated from that. | Sample validates against the schema (see test record). |

### Data flows checked

1. **Baseline**: app → `claim_item` RPC → files to `scans/<item_id>/<scan_id>/` (upsert, retried) → `scans` row (`kind=baseline`, `created_by=auth.uid()`).
2. **Check**: app (deep link with `invite`) → `join_item` → upload → `POST /diff {base_id, new_id}` with `X-Session-ID` → result screen → Accept/Dispute writes `scans.decision` on the check row.
3. **Web checkout** (`/checkout/<id>`): hold stored in `localStorage` with the ids of every scan seen at hold time; released only when a *newer* check scan has `decision = accept`, disputed on `dispute` (`realOrderStatus`).
4. **Engine**: service-role key reads the bucket, verifies `model_sha256` and per-file hashes, compares, uploads results.

### PITCH.md demo flows (kept intact)

Main path (list → baseline → pay → check scan → comparison → accept → released), live check-in (delete latest check-in → reset → re-scan), dispute branch (reset → pay → new check scan → dispute → evidence page). None of the changes in this audit alter these flows, the deep link format, the `scans` table shape, or the diff response contract.

## 2. Issue register

Every issue was recorded here before it was fixed. Severity: Critical (breaks the live demo), High (security or data integrity with a realistic path), Medium, Low, Info.

| ID | Sev | Component | Summary | Repro | Root cause | Fix | Regression test | Status |
|---|---|---|---|---|---|---|---|---|
| AUD-01 | Critical | web ↔ engine contract | The iOS fixtures recorded from `engine.scandiff.us` on Oct 24 (`ios/ScanDiff/ScanDiffTests/Fixtures/engine_*.json`, commit `7ad46b4`) use a different response shape from the repo's engine: `histogram` is a list of shares plus `histogram_edges_mm`; regions have `centroid`/`radius`/`max_mm` but no `centroid_m`/`radius_m`/`max_depth_mm`/`damage_type`; no `verdict_confidence`/`verdict_reason`; `stats.max_mm` instead of `max_change_mm`. No commit on any branch ever emitted `histogram_edges_mm`, so the deployed engine appears to run uncommitted code. `web/lib/diffClient.ts` reads only the repo shape: on such a response `mm(g.centroid_m)` throws and the comparison page (PITCH step 5) fails. | `web/tests/diffClient.test.ts` before the fix: both deployed-engine fixtures threw `TypeError: Cannot read properties of undefined (reading 'map')`, and an inconclusive reason sent as `reason` was lost. `scripts/check_contract.py` crashes on them (AUD-08); `jsonschema` finds 6 and 21 violations. | Web mapping assumes one shape; deployed engine and repo diverged | `web/lib/diffClient.ts` `withContractNames()`: fills the contract names from the brief's names when only those are present (`histogram` list + `histogram_edges_mm`, `confidence`, `reason`, `stats.max_mm`, region `centroid`/`radius`/`max_mm`/`mean_mm`, damage type in `label`). Contract fields always win, so repo-shaped responses map exactly as before. No contract change. | `web/tests/diffClient.test.ts` (8 tests: contract sample, both deployed fixtures, 401 renew, inconclusive in either name, failure not cached, non-diff body) | Fixed in the web client. **Still open:** confirm which code `engine.scandiff.us` runs (Adi) and commit it; the iOS decoder already accepts both shapes. |
| AUD-02 | High | engine security | File names in an uploaded `metadata.json` (`model_file`, `photos[].file`, `textures[].file`, `obj_file`, `material_file`) and `item_id`/`scan_id` are joined onto local paths unchecked, so a member who uploads a crafted scan can make the engine write downloaded bytes outside `engine/data/scans/` (path traversal). | `pytest tests/test_security.py` before the fix: 18 failed; with `photos[].file = "/etc/escaped.jpg"` the engine called `write_atomic('/etc/.escaped.jpg…')` and only macOS permissions stopped it (`PermissionError`). The Dockerfile has no `USER`, so on the server the container runs as root and could overwrite `/app/app/*.py` (code execution on the next restart). | No validation of names in `ScanMetadata` | `engine/app/schemas.py`: `PlainName` validator (no `/`, `\`, NUL, `.`, `..`, empty) on every name that becomes a path part. A crafted scan now fails as `InvalidMetadata`, which `/diff` already turns into an `inconclusive` result. All 9 real metadata files on disk still parse. | `engine/tests/test_security.py` (18 traversal cases + real-name control) | Fixed |
| AUD-03 | Medium | web security | Open redirect after sign-in: `safeNext("/\t/evil.com")` passes the check, and `new URL()` strips tab/CR/LF, so `/auth/callback?next=/%09/evil.com` redirects to `https://evil.com/`. | `web/tests/safeNext.test.ts` before the fix: 5 failed (4 control-character escapes to `https://evil.com/`, and the fuzz case threw `TypeError: Invalid URL`, which would make `/auth/callback` answer 500) | `safeNext` checks the raw prefix only | `web/lib/safeNext.ts`: refuse control characters and `\\` anywhere, then require the resolved URL to stay on the same origin (any parse error gives `/`) | `web/tests/safeNext.test.ts` (15 tests, including an exhaustive 4-deep mix of slashes, backslashes, whitespace, `%2F` and `@`) | Fixed |
| AUD-04 | Medium | engine tests | The engine test suite is not hermetic: `storage.load_settings`, `upload_file` and `classify.vision_provider` load `engine/.env`, which on this machine holds live Supabase and Claude credentials. A test that forgets a monkeypatch would call the live project or Claude. | Inspect `tests/` (no global guard) | Missing suite-wide isolation | `engine/tests/conftest.py`: autouse fixture points `ENV_PATH` at a missing file, unsets every service variable, and blocks non-loopback sockets | `engine/tests/test_hermetic.py` (4 tests) | Fixed |
| AUD-05 | High | engine ↔ iOS | `ScanBundle.swift:191` writes 16 zeros as the `camera_transform` of a key photo whose pose did not solve, but the engine's `transform_ends_with_one` validator rejects the whole `metadata.json` for it. One unsolved photo makes the scan unreadable and every diff with it `inconclusive` ("metadata.json does not match ScanMetadata"). All 6 scans on disk happen to have every pose solved. | `tests/test_photo_poses.py::test_unsolved_key_photos_are_dropped_not_fatal` fails with `camera_transform last element must be 1` | The app's "unsolved" marker was never agreed with the engine | `ScanMetadata.unsolved_photos_are_dropped` (before-validator) drops photos whose `camera_transform` is 16 zeros; coverage then uses the solved ones (all unsolved gives `compared_fraction` 0, so `inconclusive` with a rescan message). | `test_unsolved_key_photos_are_dropped_not_fatal`, `test_a_scan_whose_poses_all_failed_parses_with_no_photos` | Fixed |
| AUD-06 | Low | engine | The documented row-major check cannot fire. A row-major dump parsed column-major gives `pose.T`, whose 3×3 is `Rᵀ` (still a rotation), and `K[2,2]` stays 1 either way, so a row-major upload would pass with the camera at the origin. `UPLOAD_FORMAT.md` says a failed rotation check "means the flat list was parsed row-major". | `tests/test_photo_poses.py::test_row_major_*` (no error raised) | Checks test the wrong part of the matrix | `PhotoMeta.T_cam_to_world` requires the bottom row `[0,0,0,1]`; `PhotoMeta.K` requires `[0,0,1]`. Lazy as before (an existing test pins that). All 57 real poses on disk pass. `UPLOAD_FORMAT.md` corrected. | `test_row_major_camera_transforms_are_caught`, `test_row_major_intrinsics_are_caught`, `test_a_scaled_rotation_is_caught` | Fixed |
| AUD-07 | Medium | engine API | A scan with a malformed pose (non-rotation 3×3), a missing key-photo JPEG or a corrupt one makes `POST /diff` return **HTTP 500**, not 200 `inconclusive` as the contract promises. The pose check is lazy (`PhotoMeta.T_cam_to_world`) and runs inside `compare()`, which only catches alignment-type errors. | `test_a_malformed_pose_makes_the_diff_inconclusive_not_a_server_error`: `assert 500 == 200` | Photo loading errors (`ValueError`, `OSError`) escape `compare()` | `pipeline._key_photos` turns a bad pose or a missing/corrupt JPEG into `InvalidMetadata` naming the photo (no server paths), and `compare()` returns `inconclusive` with that reason. | `test_a_malformed_pose_makes_the_diff_inconclusive_not_a_server_error` (through `POST /diff`), `test_a_missing_or_corrupt_key_photo_is_inconclusive_not_a_server_error[missing,corrupt]` | Fixed |
| AUD-08 | Low | tooling | `scripts/check_contract.py` crashes with `AttributeError: 'list' object has no attribute 'get'` instead of printing FAIL when `histogram` is not an object, so it cannot be used to check the deployed engine's responses. | `check_contract.py ios/ScanDiff/ScanDiffTests/Fixtures/engine_real_accept.json` | `check()` assumes the shape it validates; `--engine` never got a session, so it got 401 from any current engine | `scripts/check_contract.py`: type checks before reading `histogram`/`regions` (now prints FAIL with reasons); `fetch()` calls `GET /health` and sends `X-Session-ID` (not for `--mock`) | `engine/tests/test_check_contract.py` (7 tests, including `--engine` against a real uvicorn on 127.0.0.1) | Fixed |
| AUD-09 | Info | engine | `engine/scandiff/ledger.py` contains only a docstring. There is no hash chain or version ledger; fingerprints are the SHA-256s the phone computed, stored in `scans.sha256` and echoed by the engine. Nothing records them independently at handoff time. | Read the file | Not built | None (new feature; out of scope the night before) | n/a | Open: do not claim "hash-chained history" in the pitch |
| AUD-10 | Info | web | Nessie is only called for refunds on the **mock** `mug-001` dispute (`REFUNDABLE = {"mug-001"}`). The live checkout for real items (`RealCheckoutView`) holds and releases from `scans.decision` in the browser only; it never calls Nessie for approval or refund. | Read `app/api/refunds/route.ts`, `lib/realOrder.ts` | Scope | None | `web/tests/realOrder.test.ts` pins the decision gating; `web/tests/refunds.test.ts` the Nessie path | Open: pitch wording |
| AUD-11 | Low | web ↔ iOS | The web QR code for an item ID containing `_` or capitals (`scanLink(..., {existing: true})` keeps them) opens a *different* item in the app, because `DeepLink.parse` always rewrites the ID to lowercase kebab-case (`shoe_01` → `shoe-01`). The phone then claims a new item and the web page waits forever. IDs from `/sell` (`create_item`) are always kebab-case, so the demo path is not affected. | `web/tests/itemId.test.ts` before the fix: 4 failed (QR links were drawn for `shoe_01`, `Coffee-Maker`, `mug__2`, `a_`) | Two normalization rules | `web/lib/itemId.ts`: `appItemId()` mirrors the app's rule, and `scanLink` refuses an ID the app would rewrite; `ScanQR` already shows "No QR code: … start the scan in the iPhone app" instead. Kebab-case IDs (every `/sell` ID, every real ID in the table) are unaffected. Deep-link format unchanged. | `web/tests/itemId.test.ts` (15 tests, incl. a line-for-line port of `ItemID.normalize` and every ID shape `/sell` can produce) | Fixed |
| AUD-12 | Medium | Supabase RLS / checkout | Any member of an item, **including the seller (owner)**, may write `scans.decision` on a check scan, and may change it later (`accept` → `dispute` or back, or to null). So the seller can "accept" the buyer's check scan and release the held demo payment, and a released order flips to disputed if the decision is changed. | Probes in `ios/supabase/tests/rls_audit_test.sql` on local Postgres 16: seller (owner) sets `accept` on the buyer's check scan → 1 row; buyer flips `accept`→`dispute` → 1 row; buyer clears it → 1 row; a member who joined by link sets `accept` → 1 row. `web/tests/realOrder.test.ts` "follows the stored decision if it is changed after release". | Policy `members decide on check scans` has no uploader/once-only condition | None: PITCH step 6 lets the laptop (signed in as the demo/seller account) click Accept, so restricting it now would break the scripted demo | n/a | Open (flagged) |
| AUD-13 | Low | web concurrency | Two concurrent `POST /api/refunds` for the same dispute (double click on Retry, two tabs) both find no deposit and both create one: the description-as-idempotency-key check is check-then-create. | `web/tests/refunds.test.ts` "makes one deposit when … twice at once": `expected length 1 but got 2` | No in-flight de-duplication | `web/lib/nessie.ts`: `refundBuyer` shares one in-flight request per description (per server instance; the existing description lookup still covers later requests) | `web/tests/refunds.test.ts` (12 tests) | Fixed |
| AUD-14 | Medium | web security | `POST /api/refunds` needs no sign-in. Anyone can create Nessie sandbox deposits for `mug-001` with any `disputedAt` (each new timestamp is a new deposit), using the team's Nessie key quota. Sandbox money only. | `web/tests/refunds.test.ts` calls it with no session | Demo shortcut | None (adding auth would change the mock demo, which is meant to run signed out) | n/a | Open (flagged) |
| AUD-15 | Medium | engine security | The engine API is effectively unauthenticated: `GET /health` hands a session to anyone, CORS is `*`, and `/scans/{id}/model.glb` needs no session. Anyone who learns two scan UUIDs can run a diff (several seconds of CPU and uploads); downloads and meshes have no size limits. Mitigated by scan ids being random UUIDs readable only by members. | `engine/tests/test_security.py` (sessions), `test_mock_diff.py::test_cors_allows_any_origin` | Hackathon scope | None (an API key or rate limit needs a redeploy and client changes) | n/a | Open (flagged) |
| AUD-16 | Medium | engine domain | Without the vision model, geometry-only classification is under-confident: on synthetic scans a clean 6 mm × 2.3 cm² dent scores `dent_damage` 0.69 and a 17 mm missing corner `missing_part` 0.49, both under `DAMAGE_MIN_CONFIDENCE` 0.7, so the verdict is `needs_review` ("Needs human review"), not `damage_likely`. | `engine/tests/test_domain.py` + probe output in the test record | `CLASSIFY_PRIOR` and soft steps cap the top label below 0.7 for typical shapes | None (threshold tuning the night before is risky) | `test_domain.py` asserts "not accept" for both | Open: say "flags for review" in the pitch, or make sure `VISION_API_KEY` is set on the server |
| AUD-17 | Low | secrets | The demo account's password is committed in `ios/supabase/seed.sql` (line 2, and the `crypt(...)` call on line 21) and in `ios/ScanDiff/ScanDiff/LoginView.swift:231` (DEBUG builds only); the web takes it from `NEXT_PUBLIC_DEMO_PASSWORD`, which ships in the browser bundle by design. No service-role key, Claude key, Nessie key, Google client secret, JWT or private key is in any tracked file or in git history (masked scan in the test record). | Secret scan | Convenience for the demo | None now | n/a | Open: rotate after the hackathon |
| AUD-18 | Medium | iOS | `UploadService.writeDecision` treats an update that matched no row as success: PostgREST answers 2xx with zero rows when row-level security filters the row (wrong account, item not joined, row deleted by "Delete latest check-in"). The phone then says "Saved. The checkout releases the payment." while `scans.decision` is unchanged and the checkout never releases. The web's `writeDecision` already checks this with `.select("id")`. | Code reading (`ScanSessionModel.swift:527-529`); the old code had no way to observe the row count, so the regression test needs the injectable client added with the fix | Update without `select` | `UploadService.writeDecision` adds `.select("id")` and throws `decisionFailed("The decision was not saved: …")` on zero rows, so the phone shows the error instead of "Saved". `UploadService` takes an injectable `client` (defaults to the app's), and the retry backoff became a named function so tests can run without sleeping; production behaviour unchanged. | `ios/ScanDiff/ScanDiffTests/UploadServiceTests.swift`: `DecisionWriteTests` (3, PostgREST stubbed with `URLProtocol`), `UploadRetryTests` (5) | Fixed |
| AUD-19 | Low | engine mock | The engine's fixed example (`GET /schema/example`, `POST /diff?mock=true`) contradicts the engine's own rule: region `r2` is `dent_damage` at confidence 0.71, over `DAMAGE_MIN_CONFIDENCE` 0.7, so its derived `triage` is `damage`, while the response's verdict is `needs_review` (triage `inconclusive`). By `verdict.decide` that combination is `damage_likely`. A viewer of the example sees a "damage" region under a "needs review" headline. | `test_the_mock_follows_the_engines_own_verdict_rule`: `('needs_review', ['r2'])`; found by the new iOS test `testRepoEngineMockResponse` | Hand-written mock numbers | `engine/app/mock.py`: `r2` confidence 0.68 (under the rule), so it triages `inconclusive`, matching the verdict and its reason "a person should confirm it". Values only; contract shape unchanged. iOS fixture `engine_repo_mock.json` regenerated from the fixed engine. | `test_the_mock_follows_the_engines_own_verdict_rule`; iOS `ContractDecoderEdgeCaseTests.testRepoEngineMockResponse` | Fixed |
| AUD-20 | Low | engine API | A lone UTF-16 surrogate in a name from `metadata.json` (JSON `"\\ud800"` decodes to one) ends up in an `inconclusive` reason such as "The scans are of different items (…)", and serializing the response raises `PydanticSerializationError` (UTF-8 cannot encode it): `POST /diff` answers 500. Found by hypothesis. | `test_inconclusive_results_always_validate` (falsifying example `reason='\\ud800'`); `test_security.py::test_a_lone_surrogate_in_a_name_is_still_a_json_answer` | Reasons echo untrusted names unescaped | `pipeline.inconclusive` replaces unencodable characters in the reason (`encode('utf-8', 'replace')`) | both tests named in Repro | Fixed |
| AUD-21 | Low | engine deploy | `engine/Dockerfile` has no `USER`, so the API runs as root in the container. That is what made AUD-02 able to overwrite the app's own code. The image could not be built here (no Docker or Podman on this Mac). | Read the Dockerfile | Default user | None (changing the image user changes volume permissions on `engine-data`; needs a server test) | n/a | Open: add a non-root user after the hackathon |
| AUD-22 | Low | iOS ↔ Supabase | `ItemID.normalize`/`isValid` put no length limit on item IDs, while `items.id` and `claim_item` allow at most 64 characters. A longer ID reaches the upload and fails with `claim_item`'s message "Item IDs use letters, numbers, - and _.", which does not mention length. | `rls_audit_test.sql`: `claim_item(repeat('a', 65))` → 22023; Swift code reading | Rules not shared | None | n/a | Open |
| AUD-23 | Info | engine | `engine/calibration.json` does not exist, so `noise_floor_mm` and `threshold_mm` are the 3 mm placeholders (`config.py`). Already in TEST_REPORT.md. | `ls engine/calibration.json` | Calibration not run | None | n/a | Open |

## 3. Optimization register

Only changes benchmarked before and after are listed as applied. Benchmarks ran on this Mac (Apple Silicon, Python 3.12.14, Open3D 0.20.0), offline on the scans already in `engine/data/scans/`, uploads to a temp folder, vision off. Scripts: `bench_normals.py`, `bench_compare.py`, `profile_real.py` (session scratchpad).

| ID | Change | Where | Before | After | Output check | Status |
|---|---|---|---|---|---|---|
| OPT-01 | Local plane normals from `eigh` of each 3×3 neighborhood covariance instead of a batched SVD of the 8×3 neighborhood (same eigenvector, ascending order) | `engine/scandiff/regions.py::_local_normals` (called 4× per diff) | Function, median of 7: 141.6 ms (coffee-maker-1, 40,566 pts), 152.6 ms (coffe-maker-2), 35.3 ms (charger-1) | 79.9 ms, 86.8 ms, 20.2 ms (1.74–1.77×) | min \|n_svd · n_eigh\| = 1.000000 on all three clouds | Applied |
| | | Whole `compare()`, median of 5 | coffee rescan 2.672 s · coffee self 2.109 s · charger-002 1.659 s | 2.368 s (−11.4 %) · 1.833 s (−13.1 %) · 1.623 s (−2.2 %) | Verdict, confidence (6 dp), `compared_fraction`, all stats and every region's kind/type/area/depth/confidence **identical** before and after; 175 engine tests + 7 real-data tests pass | |
| — | Vectorize `read_usd_mesh` (per-point `Gf` transform loop) | `engine/scandiff/io.py` | 12–28 ms per real USDZ (6 scans) | not changed | n/a | Rejected: under 1 % of a diff |
| — | Read JPEG size/orientation from the header instead of decoding 19 full-resolution key photos (0.44 s of 2.65 s) | `engine/scandiff/photos.py::load_photo` | 0.44 s per diff (profile) | not changed | n/a | Rejected: a truncated JPEG would then fail later inside the crop thread pool (HTTP 500), undoing AUD-07 |
| — | Compute each cloud's local normals once instead of twice (`cloud_point_areas` and `find_regions._surface` both do it) | `app/pipeline.py`, `scandiff/regions.py` | ~0.3 s per diff (estimated from the profile) | not changed | n/a | Deferred: needs signature changes across modules; not worth the risk tonight |

## 4. Test execution record

All commands ran on this Mac (macOS 27, Xcode 27.1, Node 24.4.1, Python 3.12.14, Postgres 16.13). Outputs are copied from the runs, not paraphrased. "Blanked env" means every service variable was set to an empty string on the command line, so the local `.env.local`/`Secrets.xcconfig` values were not used (Next only fills variables that are undefined; `xcodebuild` command-line settings override the xcconfig).

### 4.1 Baseline, before any change (branch point `11060bd`)

| Component | Command | Result |
|---|---|---|
| Engine | `cd engine && .venv/bin/python -m pytest -q -p no:cacheprovider` | `101 passed, 7 deselected in 18.69s` |
| iOS | `xcodebuild test -project ScanDiff.xcodeproj -scheme ScanDiff -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.5' SUPABASE_URL= SUPABASE_ANON_KEY= ENGINE_URL= ENGINE_URL_FALLBACK= GOOGLE_*= DEMO2_*= CODE_SIGNING_ALLOWED=NO` | `Executed 37 tests, with 0 failures` · `** TEST SUCCEEDED **` (35 s) |
| Supabase RLS | `bash ios/supabase/tests/run.sh` (throwaway Postgres 16, Unix socket only) | `All RLS tests passed.` (0.9 s) |
| Web | none: no test runner existed | 0 tests |
| Contract | `engine/.venv/bin/python scripts/check_contract.py contract/diff_response.json` | `PASS … (triage=damage verdict=damage_likely regions=3 mock=False)` |
| Contract (deployed-engine fixtures) | same script on `ios/ScanDiff/ScanDiffTests/Fixtures/engine_real_accept.json` and `engine_mock_needs_review.json` | crash: `AttributeError: 'list' object has no attribute 'get'` (AUD-08); `jsonschema`: 6 and 21 violations (AUD-01) |

### 4.2 Runs during the audit (reproductions and fixes)

| What | Command | Result |
|---|---|---|
| Path traversal repro (AUD-02) | `pytest tests/test_security.py` before the fix | `18 failed, 9 passed`; one case reached `write_atomic('/etc/.escaped.jpg…')` → `PermissionError` |
| Domain tests, first run | `pytest tests/test_domain.py --durations=12` | `9 passed in 8.32s` (each compare 0.7–1.1 s) |
| Domain probe (what the pipeline returned) | `domain_probe.py` (scratchpad) | identical → accept, 0 regions, rmse 0.0; rigid 40°+30 cm → accept, rmse 0.79 mm; noise 0.3 mm → accept, max 1.38 mm; 6 mm dent → `needs_review`, 1 region `dent_damage` 5.8 mm 2.3 cm² conf 0.69; missing corner → `needs_review`, 1 region `missing_part` 16.9 mm 8.3 cm² conf 0.49; one-sided check scan → `inconclusive`, `compared_fraction` 0.3518 |
| Pose repros (AUD-05/06/07) | `pytest tests/test_photo_poses.py` before the fixes | `7 failed, 2 passed`; malformed pose via `POST /diff`: `assert 500 == 200` |
| Hypothesis finding (AUD-20) | `pytest tests/test_properties.py` | falsifying example `reason='\ud800'` → `PydanticSerializationError`; through `/diff`: `assert 500 == 200` |
| Open redirect repro (AUD-03) | `npx vitest run tests/safeNext.test.ts` before the fix | `5 failed | 10 passed` (4 escapes to `https://evil.com/`, 1 `TypeError: Invalid URL`) |
| Deployed-shape repro (AUD-01) | `npx vitest run tests/diffClient.test.ts` before the fix | `3 failed | 5 passed`: `TypeError: Cannot read properties of undefined (reading 'map')` ×2, lost `reason` ×1 |
| Refund race repro (AUD-13) | `npx vitest run tests/refunds.test.ts` before the fix | `expected [ …(2) ] to have a length of 1 but got 2` |
| QR id repro (AUD-11) | `npx vitest run tests/itemId.test.ts` before the fix | `4 failed | 11 passed` |
| Checker repros (AUD-08) | `pytest tests/test_check_contract.py` before the fix | `5 failed, 2 passed`: `AttributeError` ×4, `HTTP Error 401: Unauthorized` ×1 |
| Mock consistency (AUD-19) | `pytest tests/test_properties.py -k mock_follows` before the fix | `AssertionError: ('needs_review', ['r2'])` |
| RLS audit + probes | `bash ios/supabase/tests/run.sh` (now also runs `rls_audit_test.sql`) | `All RLS tests passed.` · `All audit RLS checks passed.`; probes: seller sets accept → 1 row, buyer flips → 1, buyer clears → 1, link-joined member accepts → 1, `charger-002/../x.jpg` storage name → 1 |
| `setup.sql` on a fresh database, twice | `fresh_setup.sh` (scratchpad; local Postgres) | both runs exit 0; 4 `scans` policies; realtime has `scans`; both check constraints; `create_item('mug')` → `mug-002`, `mug-003` |
| Web production build | `npm run build` with blanked env | `✓ Compiled successfully`, TypeScript OK, 17 routes generated (5.1 s) |
| Client bundle secret check | `grep -rl -E "NESSIE_API_KEY\|GOOGLE_OAUTH_CLIENT_SECRET\|service_role\"\|sb_secret_…" .next/static` | 1 hit, the app's own guard (`"".startsWith("sb_secret_")`) inlined with the blank value; Nessie host not in any client chunk |
| HTTP E2E smoke | `next start -H 127.0.0.1 -p 3917` with blanked env, then `curl` | 10 pages 200 (`/`, `/checkout/mug-001`, `/item/mug-001`, `/item/car-001`, `/item/mug-001/evidence`, `/sell`, `/login`, `/item/coffee-maker-1`, `/checkout/mug-002`, `/join/mug-002?code=x`); checkout shows "Demo only", "no real payment", "Pay with Visa (demo)"; `POST /api/refunds` → 503 without key, 404 on bad body; `/auth/callback?next=/%09/evil.com`, `//evil.com`, `/%0A/evil.com` → `307 /login?next=%2F`; server log: no errors |
| iOS device build | `xcodebuild build -configuration Release -destination 'generic/platform=iOS'` (blanked secrets, no signing) | `** BUILD SUCCEEDED **` (35.6 s), 0 warnings in app sources |
| Real-data comparisons (offline) | `pytest -m real_data` (scans already on disk; uploads faked) | `7 passed` |
| Python 3.11 compatibility (the Docker base is `python:3.11-slim`) | `uv python install 3.11` into the scratchpad, `uv pip install -r engine/requirements-dev.txt`, then pytest | `Python 3.11.14` · `175 passed, 7 deselected in 38.49s` · real data `7 passed` (macOS, not Linux) |

### 4.3 Test inventory

| Suite | Before | After | New files |
|---|---|---|---|
| Engine (pytest) | 108 (101 + 7 real-data) | **182** (175 + 7 real-data) | `conftest.py` (hermetic guard), `test_hermetic.py` 4, `test_security.py` 28, `test_domain.py` 9, `test_properties.py` 15 (hypothesis), `test_photo_poses.py` 9, `test_check_contract.py` 9 |
| Web (vitest, new) | 0 | **67** | `safeNext` 15, `diffClient` 8, `realOrder` 11, `refunds` 12, `itemId` 15, `supabaseConfig` 6 |
| iOS (XCTest) | 37 | **63** | `UploadServiceTests.swift` 8 (retry, decision write vs stubbed PostgREST), `AuditEdgeCaseTests.swift` 18 (deep link, decoder, SHA-256), 2 fixtures generated from the repo's engine |
| Supabase RLS (SQL on local Postgres) | 69 checks | **102 checks** + 5 probes | `rls_audit_test.sql` (33 checks, 5 probes), wired into `run.sh` |
| Build / static | — | `next build`, `tsc --noEmit`, `eslint`, `xcodebuild build` (device, Release), `xcodebuild test`, Python 3.11 run, HTTP smoke of 10 pages + 2 routes | |

By category: unit (most suites); integration (`compare()` end to end, `/diff` through FastAPI, `getDiff` through fetch, refund route through fake Nessie, decision write through stubbed PostgREST); E2E (HTTP smoke against `next start`; `--engine` checker against a real local uvicorn); edge/negative (traversal, malformed poses, corrupt JPEGs, nulls everywhere, bad bodies); regression (one per fixed issue); concurrency (32 parallel sessions, concurrent refunds, concurrent hashing); failure recovery (401 renew, failure not cached, Nessie lookup retry, upload retry, cancellation); security (RLS, secrets scan, key guard, open redirect, path traversal, CORS/session); performance (benchmarks in section 3, domain timings); compatibility (Python 3.11 and 3.12, iOS 18.5 simulator, generic iOS device build, Node 24); property/fuzz (hypothesis over the contract and geometry; exhaustive redirect fuzz); domain (synthetic identical, rigid, noisy, dented, missing chunk, low coverage, different item, wrong size).

## 5. Final verification run

`final_verify.sh` (scratchpad) at `496cae4`, every suite offline with blanked service settings, 67 s in total:

```
=== engine pytest (3.12)      175 passed, 7 deselected, 1 warning in 31.59s
=== engine real_data (3.12)   7 passed, 175 deselected, 2 warnings in 5.05s
=== contract sample           PASS contract/diff_response.json (triage=damage verdict=damage_likely regions=3 mock=False)
=== supabase run.sh           All RLS tests passed. / All audit RLS checks passed.
=== web vitest                Test Files 6 passed (6) · Tests 67 passed (67)
=== web tsc                   0 errors
=== web lint                  0 problems
=== web build                 ✓ Compiled successfully · Finished TypeScript · Generating static pages (17/17)
=== ios xcodebuild test       Executed 63 tests, with 0 failures · ** TEST SUCCEEDED **
```

Engine code is unchanged since the Python 3.11 run (`c206178`), and iOS app code since the device build (`a11b521`). The one warning is hypothesis noting that `norecursedirs` in `pytest.ini` hides `.hypothesis`; the real-data warnings are NumPy `invalid value encountered in det` from an existing test.

## 6. Final summary

### (1) Scope covered

All four parts and their seams: the engine (API, pipeline, storage, schemas, mock, scripts), the web app (diff client, live and mock checkout, refunds/Nessie, auth redirect, item IDs, key guard, build), the iOS app (decoder, deep link, hashing, upload retry, decision write, device build), `setup.sql` and its RLS, and the contract between them. All of it ran locally with fakes; nothing live was called.

### (2) Test inventory

Engine 182, web 67, iOS 63, SQL 102 checks plus 5 probes, plus builds, lint, typecheck and an HTTP smoke run. Before the audit: 108 / 0 / 37 / 69. Details in 4.3.

### (3) Results

Everything passes at `496cae4` (section 5). Every fixed issue has a test that failed before its fix and passes after (repros in 4.2).

### (4) Issues found and fixed (13)

- **AUD-01** (Critical): comparison page crashed on the deployed engine's field names. Fixed in the web client.
- **AUD-02** (High): path traversal from `metadata.json`.
- **AUD-05** (High): one unsolved key photo made a whole scan inconclusive.
- **AUD-03** (Medium): open redirect after sign-in.
- **AUD-04** (Medium): engine tests could reach live services.
- **AUD-07** (Medium): bad pose or photo gave HTTP 500.
- **AUD-18** (Medium): the phone said "Saved" when nothing was saved.
- **AUD-06, 08, 11, 13, 19, 20** (Low): row-major check, contract checker, QR item IDs, refund race, mock consistency, unencodable reasons.

### (5) Issues still open (10)

- **AUD-01 remainder**: nobody knows which code `engine.scandiff.us` runs.
- **AUD-12** (Medium): the seller, or any member, can set or flip a decision.
- **AUD-14** (Medium): the refund route needs no sign-in.
- **AUD-15** (Medium): the engine API is effectively open, with no size limits.
- **AUD-16** (Medium): without vision, real dents come out "needs review".
- **AUD-09** (Info): no hash-chain ledger exists.
- **AUD-10** (Info): Nessie is used for the mock refund only.
- **AUD-17** (Low): committed demo password.
- **AUD-21** (Low): the container runs as root.
- **AUD-22** (Low): no 64-character item ID limit in the app.
- **AUD-23** (Info): calibration placeholders.

The three Mediums (12, 14, 15) were left on purpose: fixing them changes the scripted demo or needs a redeploy.

### (6) Optimizations

OPT-01: local normals via `eigh`. The function is 1.75× faster and a real comparison is 2–13 % faster, with byte-identical results on three real pairs. Three other candidates were measured and rejected or deferred (section 3).

### (7) Blocked items and why

- **Docker image build**: no Docker or Podman on this Mac. The code was run on Python 3.11 and 3.12 on macOS instead.
- **Live end-to-end PITCH run**: needs the live Supabase project and engine, which were forbidden. A local Supabase stack needs Docker, and there were no PostgREST or Realtime binaries. Covered instead by state-machine tests, an HTTP smoke run and the RLS suite.
- **On-device capture → upload → diff**: needs a person with the LiDAR iPhone, and Object Capture does not run in the Simulator. PHONE_TEST.md steps 4–9 are still pending.
- **Which code `engine.scandiff.us` runs**: checking needs a call to the live engine.
- **Not run (they hit live services)**: `scripts/demo_dry_run.mjs`, the live Nessie sandbox, live Claude vision.

### (8) Risks for the live demo

1. **Comparison page crash (AUD-01)**: if `engine.scandiff.us` still answers in the brief's field names and the web is not redeployed with this branch, PITCH step 5 crashes.
2. **Unsolved key photo (AUD-05)**: one unsolved photo in the live check-in makes the comparison "Inconclusive" until the engine is redeployed. Rare: 0 of 57 real poses on disk were unsolved.
3. **Wording for real dents (AUD-16)**: a real dent shows "Needs human review", not "likely damage", unless vision is enabled on the server.
4. **Who can accept (AUD-12)**: anyone on the item, including the seller's laptop, can click Accept. PITCH step 6 relies on this, so don't claim only the buyer can release.
5. **Slow first diff**: the first comparison after an engine restart is slow (19 s cold per TEST_REPORT). Warm it up once before going on stage.
6. **Network**: venue Wi-Fi or realtime trouble falls back to 4 s polling. If the network is down entirely, use the mock demos (`/checkout/mug-001`) and the recording.

### (9) Must-dos before 9:00 AM PDT Sunday, in priority order

1. **Adi, 10 min.** Find out what `engine.scandiff.us` runs (`ssh` to the server, `diff -r /srv/scandiff` against the repo) and commit it. Then, from a laptop, run `engine/.venv/bin/python scripts/check_contract.py --engine https://engine.scandiff.us --mock`; it now gets a session itself. This is a live call, so it is the team's decision, not mine.
2. **Keshav, 15 min.** Merge `audit/full-audit` into `main` (or cherry-pick `f705005` then `26ea7db`, in that order: `next build` type-checks `web/tests/`, which need the vitest added in `f705005`), redeploy Vercel, and rehearse the whole PITCH main path and dispute branch once on the deployed site with the real engine.
3. **Adi, 20 min, only if a rehearsal fits afterwards.** Redeploy the engine from this branch with `deploy/deploy.sh`. That brings AUD-02, 05, 07, 19, 20 and OPT-01; the contract shape is unchanged. If there is no time to rehearse, skip it: the old engine has been working.
4. **Pitch wording, 5 min.** Say "flags it for review" for geometric changes (AUD-16). Don't mention a hash chain (AUD-09). "Nessie refunds the mock mug dispute; the live checkout is a demo hold" (AUD-10). "Demo only, no real payment" (unchanged).
5. **Adi, 2 min.** Confirm `VISION_API_KEY` is set in `deploy/engine.env` if you want real dents to read as "likely damage".
6. **Koushik, 10 min, optional.** Rebuild and install the iOS app from this branch, so a decision that didn't save shows an error instead of "Saved" (AUD-18). Then run PHONE_TEST.md steps 4–6.
7. **Before going on stage.** Run one comparison to warm the engine, and keep the recorded run and `/checkout/mug-001` open as fallbacks.
8. **After the hackathon.** Rotate the demo password (AUD-17). Restrict decisions to the check scan's uploader and lock them once set (AUD-12). Add auth and size limits to the engine (AUD-15) and the refund route (AUD-14). Add a non-root container user (AUD-21). Run calibration (AUD-23).

### What was changed, and what was not

The diff response contract shape, the `scans` table, the deep link format and the PITCH flows are unchanged. Changes that touch them, all backward compatible:

- **Contract values.** The web now also reads the deployed engine's alternate names. The engine mock's `r2` confidence went from 0.71 to 0.68 (values only).
- **Deep links.** The web no longer draws a QR code for an item ID the app would rewrite. No kebab-case ID is affected, including every ID `/sell` hands out.
- **Engine input validation.** Scans with folder paths in file names, or with row-major poses, are now `inconclusive`. Scans with unsolved poses are now accepted. All 6 real scans on disk are unaffected.

Nothing was pushed or merged.
