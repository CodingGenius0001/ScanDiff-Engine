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
| AUD-01 | Critical | web ↔ engine contract | The iOS fixtures recorded from `engine.scandiff.us` on Oct 24 (`ios/ScanDiff/ScanDiffTests/Fixtures/engine_*.json`, commit `7ad46b4`) use a different response shape from the repo's engine: `histogram` is a list of shares plus `histogram_edges_mm`; regions have `centroid`/`radius`/`max_mm` but no `centroid_m`/`radius_m`/`max_depth_mm`/`damage_type`; no `verdict_confidence`/`verdict_reason`; `stats.max_mm` instead of `max_change_mm`. No commit on any branch ever emitted `histogram_edges_mm`, so the deployed engine appears to run uncommitted code. `web/lib/diffClient.ts` reads only the repo shape: on such a response `mm(g.centroid_m)` throws and the comparison page (PITCH step 5) fails. | Feed `engine_mock_needs_review.json` to `toDiffResult` | Web mapping assumes one shape; deployed engine and repo diverged | _pending_ | _pending_ | Open |
| AUD-02 | High | engine security | File names in an uploaded `metadata.json` (`model_file`, `photos[].file`, `textures[].file`, `obj_file`, `material_file`) and `item_id`/`scan_id` are joined onto local paths unchecked, so a member who uploads a crafted scan can make the engine write downloaded bytes outside `engine/data/scans/` (path traversal). | `pytest tests/test_security.py` before the fix: 18 failed; with `photos[].file = "/etc/escaped.jpg"` the engine called `write_atomic('/etc/.escaped.jpg…')` and only macOS permissions stopped it (`PermissionError`). The Dockerfile has no `USER`, so on the server the container runs as root and could overwrite `/app/app/*.py` (code execution on the next restart). | No validation of names in `ScanMetadata` | `engine/app/schemas.py`: `PlainName` validator (no `/`, `\`, NUL, `.`, `..`, empty) on every name that becomes a path part. A crafted scan now fails as `InvalidMetadata`, which `/diff` already turns into an `inconclusive` result. All 9 real metadata files on disk still parse. | `engine/tests/test_security.py` (18 traversal cases + real-name control) | Fixed |
| AUD-03 | Medium | web security | Open redirect after sign-in: `safeNext("/\t/evil.com")` passes the check, and `new URL()` strips tab/CR/LF, so `/auth/callback?next=/%09/evil.com` redirects to `https://evil.com/`. | `node` probe in the test record | `safeNext` checks the raw prefix only | _pending_ | _pending_ | Open |
| AUD-04 | Medium | engine tests | The engine test suite is not hermetic: `storage.load_settings`, `upload_file` and `classify.vision_provider` load `engine/.env`, which on this machine holds live Supabase and Claude credentials. A test that forgets a monkeypatch would call the live project or Claude. | Inspect `tests/` (no global guard) | Missing suite-wide isolation | `engine/tests/conftest.py`: autouse fixture points `ENV_PATH` at a missing file, unsets every service variable, and blocks non-loopback sockets | `engine/tests/test_hermetic.py` (4 tests) | Fixed |
