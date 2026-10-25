# ScanDiff phone test log

Live checklist for the Cal Hacks demo (due Sun Oct 25, 9:00 AM PT). The overall state is in `TEST_REPORT.md`; this file records the phone run.

## Engine targets

| Role | Value baked into the build | Status |
|---|---|---|
| Primary (`ENGINE_URL`) | `engine.scandiff.us` (https, Adi's AWS, Caddy) | **Live (5:25 PM).** `/health` 200 with `session_id`; `/diff` without a session → 401; `coffee-maker-1` self-diff with session → `accept`, confidence 1.0, `compared_fraction` 0.865, 0 regions, `is_mock=false`, 9.5 s. App sends `X-Session-ID` and refreshes once on 401 (commit `7ad46b4`). |
| Fallback (`ENGINE_URL_FALLBACK`) | `census-read-releases-recipes.trycloudflare.com` (https Cloudflare quick tunnel to `uvicorn` on this Mac) | `/health` 200; `coffee-maker-1` self-diff → `accept`, 0 regions, `is_mock=false`, 5.6 s. No hotspot needed. The address changes if `cloudflared` restarts (then update and rebuild). |

The app checks `/health` on the primary, then the fallback (4 s timeout each), and sends `/diff` to the first that answers. Debug builds show `Engine: <host>` on the Result screen; `diagnostics.log` has `engine primary|fallback <host> answered /health` and `diff done … host=<host>`.

## Tasks

| # | Task | Status | Evidence |
|---|---|---|---|
| 1 | Untrack `-Xcc` index files | DONE | Commit `77c5f67` "chore: untrack Xcode index files" (3,032 files). `ios/.gitignore` has `**/*.xcodeproj/-Xcc/`. |
| 2 | Minimum model size check | DONE | Commit `b98bf77`. Rejects only if largest side < 3 cm, smallest side < 0.3 cm, or triangles < 2,000 (`ModelSize.Limits`). Logs `model size box=… vertices=… triangles=… acceptable=…` for every scan. Capture is kept on reject. 26/26 XCTests pass (17 + 8 size + 1 failover). Generic iOS build: 0 errors. |
| 3 | Point app at engine, rebuild, install | DONE | Built for the iPhone 17 Pro Max with 0 errors and installed (with commit `7ad46b4`). `EngineURL=https://engine.scandiff.us` (live), `EngineURLFallback=https://census-read-releases-recipes.trycloudflare.com`. 30/30 XCTests. |
| 4 | 9-step phone checklist | PENDING | Below |
| 5 | Real diff on `mug-002` | PENDING | |
| 6 | Accept / Dispute → `scans.decision` | PENDING | |
| 7 | Spare baselines | PENDING | |
| 8 | Final summary | PENDING | |

## Phone checklist (TEST_REPORT.md section 4)

Launch from the **home screen**, never from Xcode (Metal validation freeze).

| # | Step | Expected | Result | Evidence |
|---|---|---|---|---|
| 1 | Signed out, open `scandiff://scan?item=Mug-002&kind=baseline` | Login, then scan starts for `mug-002` | | |
| 2 | Baseline: 2 orbits → processing → review → upload | "Baseline uploaded"; row `kind=baseline`, `created_by` = user id | | |
| 3 | First engine call | Fallback only: local-network prompt → Allow. Primary (HTTPS): no prompt. | | |
| 4 | Check scan `scandiff://scan?item=mug-002&kind=check` (1 orbit) | Upload → "Comparing…" | | |
| 5 | Result | No MOCK badge, real verdict, regions, `Engine: <host>` | | |
| 6 | Accept, then Dispute on a second run | `scans.decision` = `accept` / `dispute` | | |
| 7 | `scandiff://scan?item=nothing-here&kind=check` | Blocked before capture, "did you mean" | | |
| 8 | Airplane mode → Upload | Error, back on Review, scan kept; upload succeeds after | | |
| 9 | Engine stopped → check scan | Connection error + Try again; works after restart without re-upload | | |

## Real diff results (`mug-002`)

| Run | Verdict | Confidence | Regions | `compared_fraction` | Diff time | Engine host |
|---|---|---|---|---|---|---|
| Change (tape/sticker) | | | | | | |
| No change | | | | | | |

## FOR KESHAV

*(filled in after step 6)*

## Demo-ready baselines

| Item | Row id | Storage folder | Self-diff |
|---|---|---|---|
