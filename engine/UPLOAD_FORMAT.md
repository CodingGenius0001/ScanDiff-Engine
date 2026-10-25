# Upload format

The iOS app sends one scan. The JSON shape is `ScanMetadata` and `PhotoMeta` in `app/schemas.py`. A real capture is in `tests/fixtures/metadata.json`.

The upload contains:

- `metadata.json`
- the USDZ named by `model_file` (usually `model.usdz`)
- one JPEG per `photos[].file`
- any `textures[].file` the app adds later

`sha256` of the model file bytes must equal `model_sha256`. A mismatch is rejected.

## metadata.json

| Field | Type | |
|---|---|---|
| `created_at` | string | ISO 8601 datetime |
| `created_by` | string | `iPhone` |
| `device` | string | Model and OS, such as `iPhone18,2, iOS 27.0` |
| `item_id` | string | Item this scan belongs to |
| `kind` | string | `baseline` or `check`. The iOS app sends only these, and the `scans` table rejects anything else |
| `model_file` | string | USDZ file name in the upload |
| `model_sha256` | string | Hex sha256 of that file |
| `scan_id` | string | This capture |
| `photos` | array | Reference photos |
| `units` | string | Optional. Missing means meters |
| `textures` | array | Optional. The textures `model.mtl` references, each `{file, sha256}` or just the file name. A given hash is checked |
| `files` | array | Optional. `{name, sha256}` for every file in the upload except `metadata.json`. Downloads are checked against these hashes; an empty `sha256` is not checked |

Camera positions are meters. The mesh loader multiplies USD points by the stage `metersPerUnit`, so the mesh is meters even when the file was authored in another unit.

## photos

| Field | Type | |
|---|---|---|
| `file` | string | JPEG file name |
| `camera_transform` | 16 numbers | ARKit `simd_float4x4`, flattened column-major. The last element is `1` |
| `intrinsics` | 9 numbers | ARKit `simd_float3x3`, flattened column-major |
| `image_width` | integer | Full camera frame width in pixels. Every new scan sends it; scans from before it was added do not |
| `image_height` | integer | Full camera frame height in pixels. Sent together with `image_width` |

Both arrays are parsed column-major, then transposed:

```python
T_cam_to_world = np.array(camera_transform, dtype=float).reshape(4, 4).T
K = np.array(intrinsics, dtype=float).reshape(3, 3).T
```

After that, the camera position is `T_cam_to_world[:3, 3]`, and `K` is `[[fx, 0, cx], [0, fy, cy], [0, 0, 1]]`. `PhotoMeta.T_cam_to_world` and `PhotoMeta.K` are the only way to read these. The bottom row of `T` must be `[0, 0, 0, 1]` and its upper 3×3 a rotation (determinant about 1, orthonormal within `1e-3`); the bottom row of `K` must be `[0, 0, 1]`. A row-major dump fails the bottom-row checks (its 3×3 is still a rotation, just transposed). A key photo whose `camera_transform` is all zeros, the app's marker for a pose that did not solve, is ignored. A pose that fails these checks, or a key photo that is missing or not an image, makes the comparison `inconclusive`.

Intrinsics belong to the full camera frame, `image_width` × `image_height`. When a JPEG is loaded, its real size comes from Pillow. If the JPEG is smaller than the frame, `fx`, `fy`, `cx`, and `cy` are scaled down to the JPEG and a warning is logged.

Scans without `image_width` / `image_height` came from an older app build that always saved full-frame JPEGs, so their intrinsics are used unscaled and a warning is logged. The frame cannot be guessed from the principal point: on the first real capture, a 4032×3024 frame had `cx` 2039.1 and `cy` 1508.9, so `2 * cx` overshoots the width by 46 px.

## Model file

The model covers the whole item, underside included: the app also captures the bottom, so both scans of a pair can be compared everywhere. Scans from before bottom capture was added have a closed underside that Object Capture filled in, not one the phone saw.

`trimesh` cannot read USDZ. The loader uses `usd-core` (`pxr`) for points, face indices, and `metersPerUnit`. If that read fails, it raises `UnsupportedFormat` and asks the app to also send an OBJ.
