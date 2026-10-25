# DiffResponse contract

`POST {ENGINE_URL}/diff` with `{"base_id": "<scans.id>", "new_id": "<scans.id>"}` returns a `DiffResponse`.

- **Engine URL:** `https://engine.scandiff.us`.
- **Session:** call `GET /health` first; send its `session_id` as the `X-Session-ID` header on `POST /diff` (401 without it). Call `/health` again after a 401: sessions end when the engine restarts or after 12 hours unused. `?mock=true` needs no session.
- **Errors:** only 401, 404 (unknown scan), 502 (result upload failed) and 503 (Supabase not configured). Scans that cannot be compared return 200 with verdict `inconclusive`.

- **Source of truth:** the engine's Pydantic models (`engine/app/schemas.py`). `engine/contract/diff_response.schema.json` is generated from them by the engine's test suite, and `web/lib/contract.ts` is generated from that (`npm run gen:contract` in `web/`).
- **Canonical sample:** `diff_response.json` here is a real response: `coffee-maker-1` vs `coffe-maker-2` (the same coffee maker, cord moved), trimmed to three regions.
- **Check a response:** `engine/.venv/bin/python scripts/check_contract.py <file>` or `--engine http://127.0.0.1:8000 --base <id> --new <id>`.

## Fields the iPhone app reads

These are the plain-language fields from the integration brief. The engine returns them alongside its original fields, derived from them (Pydantic `computed_field`), so the two can never disagree and the web viewer is unaffected.

| Brief name | In the response | Derived from |
|---|---|---|
| `verdict` (`no_change` \| `wear` \| `damage` \| `inconclusive`) | **`triage`** | `verdict` + `regions` (below) |
| `confidence` (0–1) | `confidence` | `verdict_confidence` |
| `reason` | `reason` | `verdict_reason` |
| `compared_fraction` (0–1) | `compared_fraction` | Share of the base surface that key photos from both scans saw. Only that surface is compared; the rest (such as an unscanned bottom) is in `uncovered_regions`, never flagged. Null only in the mock. |
| `heatmap_url` | `heatmap_url` | unchanged |
| `histogram.bins_mm` | `histogram.bins_mm` | `histogram.bin_edges_mm` (bin edges, one more than `counts`) |
| `regions[].triage` | `regions[].triage` | `label`, `damage_type`, `confidence` |
| `regions[].bbox {min, max}` | `regions[].bbox` | `bbox_min_m`, `bbox_max_m` (meters) |
| `regions[].max_mm`, `mean_mm` | `regions[].max_mm`, `mean_mm` | `max_depth_mm`, `mean_depth_mm` |
| `regions[].centroid` | **`regions[].centroid_m`** | Not aliased: the engine's tests forbid a unit-less `centroid` key. |
| `regions[].area_cm2`, `id`, `label` | unchanged | |

The brief's `verdict` name is taken: the engine's `verdict` is `accept | damage_likely | needs_review`, which the web viewer and the engine tests depend on. The brief's four-value verdict is therefore `triage`.

### Triage rules

Whole comparison (`triage`):

| Engine `verdict` | `triage` |
|---|---|
| `accept`, no regions | `no_change` |
| `accept`, with regions (all normal wear) | `wear` |
| `damage_likely` | `damage` |
| `needs_review` | `inconclusive` |
| `inconclusive` | `inconclusive` |

Verdict `inconclusive` means the scans could not be compared: unreadable or too sparse, different `item_id`s, a size mismatch, a failed alignment, or under half the surface captured by both. `verdict_reason` (and `reason`) says which. `heatmap_url`, the model URLs, `heatmap_legend` and `stats` are null, `regions` is empty, and the fingerprints are null if a scan could not be read.

Per region (`regions[].triage`): `wear` when `label` is `normal_wear`; `damage` when `damage_type` is `dent_damage` or `missing_part` and `confidence` > `DAMAGE_MIN_CONFIDENCE` (0.7, the engine's own damage rule); otherwise `inconclusive`.

The triage is a triage for a person, not a guarantee. The fingerprints (`base_fingerprint`, `new_fingerprint`) prove the files were not changed after upload, not that the scan shows the real item.

## Decisions

The Accept and Dispute buttons write `scans.decision` on the check scan's row. Allowed values are **`accept`** and **`dispute`** (enforced by the `scans_decision_check` constraint; `accepted` is rejected). The iOS app, the web app and the database all use these two values.

## iOS decoding

`ios/ScanDiff/ScanDiff/DiffContract.swift` decodes tolerantly: every field is optional or has a default, `triage` falls back to mapping `verdict`, and legacy names are accepted (`confidence` or `verdict_confidence`, `bins_mm` or `bin_edges_mm`, `max_mm` or `max_depth_mm`, `centroid_m` or `centroid`). Unknown verdicts become `inconclusive`. `ios/ScanDiff/ScanDiffTests/ContractDecodingTests.swift` decodes this folder's `diff_response.json`.
