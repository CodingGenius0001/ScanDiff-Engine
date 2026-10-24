"""A fake but realistic DiffResponse, so the viewer can be built before the pipeline."""

from pathlib import Path

import numpy as np
import trimesh

from app.schemas import DiffResponse, Histogram, Region, Stats, UncoveredRegion

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
SAMPLE_GLB_NAME = "sample_heatmap.glb"


def ensure_sample_glb() -> Path:
    """Write the sample heatmap GLB into `static/` if it is not there yet."""
    path = STATIC_DIR / SAMPLE_GLB_NAME
    if path.exists():
        return path

    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    # Mug-sized sphere in meters, matching the units of real scans.
    mesh = trimesh.creation.icosphere(subdivisions=4, radius=0.05)
    rng = np.random.default_rng(0)
    colors = rng.integers(0, 256, size=(len(mesh.vertices), 4), dtype=np.uint8)
    colors[:, 3] = 255
    mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=colors)
    mesh.export(path, file_type="glb")
    return path


# Mostly unchanged surface with a long tail, like a real scan pair.
_BIN_EDGES_MM = [round(0.25 * i, 2) for i in range(21)]
_COUNTS = [
    41210, 28930, 15870, 7420, 3105, 1288, 604, 352, 241, 188,
    150, 121, 97, 74, 58, 41, 30, 19, 11, 6,
]

_BASE_FINGERPRINT = "3f9a1c7e5b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4c6e8b0d1f3a"
_NEW_FINGERPRINT = "a7c2e9f4b1d6083e5a2c7f9b4d1e6a3c8f5b2d7e0a9c4f1b6d3e8a5c2f7b0d9e"


def mock_diff_response(heatmap_url: str) -> DiffResponse:
    return DiffResponse(
        heatmap_url=heatmap_url,
        histogram=Histogram(bin_edges_mm=_BIN_EDGES_MM, counts=_COUNTS),
        stats=Stats(
            changed_fraction=0.031,
            max_change_mm=4.87,
            noise_floor_mm=0.42,
            threshold_mm=1.25,
            icp_fitness=0.962,
            icp_rmse_mm=0.81,
            diff_time_s=3.4,
        ),
        regions=[
            Region(
                id="r1",
                label="normal_wear",
                damage_type="normal_wear",
                kind="dent",
                area_cm2=2.6,
                max_depth_mm=1.4,
                centroid=[0.0, 0.0481, 0.0137],
                confidence=0.78,
                reason="Shallow, spread-out change near the rim consistent with handling wear.",
            ),
            Region(
                id="r2",
                label="needs_review",
                damage_type="dent_damage",
                kind="dent",
                area_cm2=0.9,
                max_depth_mm=4.87,
                centroid=[0.0354, -0.0122, 0.0333],
                confidence=0.71,
                reason="Localized 4.9 mm depression with a sharp edge on the side wall.",
            ),
        ],
        uncovered_regions=[
            UncoveredRegion(
                id="u1",
                only_in="base",
                area_cm2=11.3,
                centroid=[0.0, 0.0, -0.05],
            ),
        ],
        verdict="needs_review",
        verdict_confidence=0.66,
        verdict_reason="One region looks like a dent; a person should confirm it.",
        base_fingerprint=_BASE_FINGERPRINT,
        new_fingerprint=_NEW_FINGERPRINT,
        diff_id="mock-diff-0001",
    )
