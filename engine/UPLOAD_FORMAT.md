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
| `textures` | array | Optional. Each entry is `{file, sha256}` |

Camera positions are meters. The mesh loader multiplies USD points by the stage `metersPerUnit`, so the mesh is meters even when the file was authored in another unit.

## photos

| Field | Type | |
|---|---|---|
| `file` | string | JPEG file name |
| `camera_transform` | 16 numbers | ARKit `simd_float4x4`, flattened column-major. The last element is `1` |
| `intrinsics` | 9 numbers | ARKit `simd_float3x3`, flattened column-major |
| `image_width` | integer | Optional full-frame width in pixels |
| `image_height` | integer | Optional full-frame height in pixels |

Both arrays are parsed column-major, then transposed:

```python
T_cam_to_world = np.array(camera_transform, dtype=float).reshape(4, 4).T
K = np.array(intrinsics, dtype=float).reshape(3, 3).T
```

After that, the camera position is `T_cam_to_world[:3, 3]`, and `K` is `[[fx, 0, cx], [0, fy, cy], [0, 0, 1]]`. `PhotoMeta.T_cam_to_world` and `PhotoMeta.K` are the only way to read these. The upper 3×3 of `T` must be a rotation (determinant about 1, orthonormal within `1e-3`) and `K[2, 2]` must be 1. A failure means the flat list was parsed row-major.

Intrinsics belong to the full camera frame. For a 4032×3024 frame, `cx` and `cy` are about 2037 and 1512. When a JPEG is loaded, its real size comes from Pillow. If `image_width` or `image_height` is missing, that side of the frame is `round(2 * cx)` or `round(2 * cy)`. If the JPEG is smaller than the frame, `fx`, `fy`, `cx`, and `cy` are scaled down to the JPEG and a warning is logged.

## Model file

`trimesh` cannot read USDZ. The loader uses `usd-core` (`pxr`) for points, face indices, and `metersPerUnit`. If that read fails, it raises `UnsupportedFormat` and asks the app to also send an OBJ.
