"""A fake but realistic DiffResponse, so the viewer can be built before the pipeline."""

from pathlib import Path

import numpy as np
import trimesh

from app.schemas import COLORMAP, DiffResponse, HeatmapLegend, Histogram, Region, Stats, UncoveredRegion
from scandiff.heatmap import diverging_colors
from scandiff.regions import measure_region

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
SAMPLE_GLB_NAME = "sample_heatmap.glb"
SAMPLE_BASE_GLB_NAME = "sample_base.glb"
SAMPLE_NEW_GLB_NAME = "sample_new.glb"

_THRESHOLD_MM = 1.25
_MAX_CHANGE_MM = 4.87
_LEGEND = HeatmapLegend(
    min_mm=-_MAX_CHANGE_MM,
    max_mm=_MAX_CHANGE_MM,
    threshold_mm=_THRESHOLD_MM,
    colormap=COLORMAP,
    neutral_band_mm=_THRESHOLD_MM,
)

# Mostly unchanged surface with a long tail, like a real scan pair.
_BIN_EDGES_MM = [round(0.25 * i, 2) for i in range(21)]
_COUNTS = [
    41210, 28930, 15870, 7420, 3105, 1288, 604, 352, 241, 188,
    150, 121, 97, 74, 58, 41, 30, 19, 11, 6,
]

_BASE_FINGERPRINT = "3f9a1c7e5b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a1c3e5b7d9f2a4c6e8b0d1f3a"
_NEW_FINGERPRINT = "a7c2e9f4b1d6083e5a2c7f9b4d1e6a3c8f5b2d7e0a9c4f1b6d3e8a5c2f7b0d9e"

_SPHERE_SUBDIVISIONS = 4
_SPHERE_RADIUS_M = 0.05


def _nearest_vertex(point: list[float]) -> np.ndarray:
    vertices = trimesh.creation.icosphere(subdivisions=_SPHERE_SUBDIVISIONS, radius=_SPHERE_RADIUS_M).vertices
    return vertices[np.argmin(np.linalg.norm(vertices - point, axis=1))]


# Seeds sit on vertices of the 5 cm mock mug, so each patch's peak change lands on a vertex
# and max_depth_mm reaches the full depth. +Y is up: the rim is near the top, the wall on the side.
# Patches stay inside a 3 cm radius.
_RIM = _nearest_vertex([0.0, 0.0481, 0.0137])
_WALL = _nearest_vertex([0.0354, -0.0122, 0.0333])
_RIM_RADIUS = 0.016
_WALL_RADIUS = 0.009


def _diverging_colors(signed_mm: np.ndarray) -> np.ndarray:
    """Blue for dents, gray inside the neutral band, red for added material."""
    return diverging_colors(signed_mm, _LEGEND.neutral_band_mm, _LEGEND.max_mm)


def _signed_change_mm(vertices: np.ndarray) -> np.ndarray:
    rng = np.random.default_rng(0)
    signed = rng.normal(0.0, 0.25, len(vertices))
    rim = np.linalg.norm(vertices - _RIM, axis=1)
    wall = np.linalg.norm(vertices - _WALL, axis=1)
    rim_hit = rim < _RIM_RADIUS
    wall_hit = wall < _WALL_RADIUS
    signed[rim_hit] = -1.4 * (1.0 - rim[rim_hit] / _RIM_RADIUS)
    signed[wall_hit] = -_MAX_CHANGE_MM * (1.0 - wall[wall_hit] / _WALL_RADIUS)
    return signed


def build_base_mesh() -> trimesh.Trimesh:
    """Mug-sized sphere in the base frame, meters, with no heatmap colors."""
    return trimesh.creation.icosphere(subdivisions=_SPHERE_SUBDIVISIONS, radius=_SPHERE_RADIUS_M)


def build_aligned_new_mesh() -> trimesh.Trimesh:
    """Same sphere with the mock dents, already in the base frame."""
    mesh = build_base_mesh()
    signed_m = _signed_change_mm(mesh.vertices) / 1000.0
    mesh.vertices = mesh.vertices + mesh.vertex_normals * signed_m[:, None]
    return mesh


def build_sample_mesh() -> trimesh.Trimesh:
    """Base surface in the base frame, meters, with the legend's colors applied."""
    mesh = build_base_mesh()
    mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=_diverging_colors(_signed_change_mm(mesh.vertices)))
    return mesh


def ensure_sample_glb() -> Path:
    """Write the sample heatmap and both aligned scan GLBs into `static/`."""
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    build_base_mesh().export(STATIC_DIR / SAMPLE_BASE_GLB_NAME, file_type="glb")
    build_aligned_new_mesh().export(STATIC_DIR / SAMPLE_NEW_GLB_NAME, file_type="glb")
    path = STATIC_DIR / SAMPLE_GLB_NAME
    build_sample_mesh().export(path, file_type="glb")
    return path


def _region(
    region_id: str,
    points: np.ndarray,
    signed_mm: np.ndarray,
    *,
    label: str,
    damage_type: str,
    area_cm2: float,
    reason: str,
    confidence: float,
) -> Region:
    extent = measure_region(points)
    if not 0.005 <= extent.radius_m <= 0.03:
        raise RuntimeError(f"{region_id} radius {extent.radius_m} is outside 0.005-0.03 m")
    if np.linalg.norm(extent.centroid_m) > 0.3:
        raise RuntimeError(f"{region_id} centroid is more than 0.3 m from the origin")
    depth = np.abs(signed_mm)
    return Region(
        id=region_id,
        label=label,
        damage_type=damage_type,
        kind="dent",
        area_cm2=area_cm2,
        max_depth_mm=round(float(depth.max()), 3),
        mean_depth_mm=round(float(depth.mean()), 3),
        centroid_m=extent.centroid_m.round(6).tolist(),
        radius_m=round(extent.radius_m, 6),
        bbox_min_m=extent.bbox_min_m.round(6).tolist(),
        bbox_max_m=extent.bbox_max_m.round(6).tolist(),
        confidence=confidence,
        reason=reason,
    )


def _uncovered(region_id: str, points: np.ndarray, *, only_in: str, area_cm2: float) -> UncoveredRegion:
    extent = measure_region(points)
    return UncoveredRegion(
        id=region_id,
        only_in=only_in,
        area_cm2=area_cm2,
        centroid_m=extent.centroid_m.round(6).tolist(),
        radius_m=round(extent.radius_m, 6),
    )


def mock_diff_response(heatmap_url: str, base_model_url: str, new_model_url: str) -> DiffResponse:
    mesh = build_base_mesh()
    vertices = mesh.vertices
    signed = _signed_change_mm(vertices)
    rim = np.linalg.norm(vertices - _RIM, axis=1) < _RIM_RADIUS
    wall = np.linalg.norm(vertices - _WALL, axis=1) < _WALL_RADIUS
    # Both scans include the item's bottom, so the uncovered example is a side patch the new scan missed.
    missed_side = vertices[:, 0] < -0.04
    return DiffResponse(
        is_mock=True,
        heatmap_url=heatmap_url,
        base_model_url=base_model_url,
        new_model_url=new_model_url,
        heatmap_legend=_LEGEND,
        histogram=Histogram(bin_edges_mm=_BIN_EDGES_MM, counts=_COUNTS),
        stats=Stats(
            changed_fraction=0.031,
            max_change_mm=_MAX_CHANGE_MM,
            noise_floor_mm=0.42,
            threshold_mm=_THRESHOLD_MM,
            icp_fitness=0.962,
            icp_rmse_mm=0.81,
            diff_time_s=3.4,
        ),
        regions=[
            _region(
                "r1",
                vertices[rim],
                signed[rim],
                label="normal_wear",
                damage_type="normal_wear",
                area_cm2=2.6,
                confidence=0.78,
                reason="Shallow, spread-out change near the rim consistent with handling wear.",
            ),
            _region(
                "r2",
                vertices[wall],
                signed[wall],
                label="needs_review",
                damage_type="dent_damage",
                area_cm2=0.9,
                confidence=0.71,
                reason="Localized 4.9 mm depression with a sharp edge on the side wall.",
            ),
        ],
        uncovered_regions=[
            _uncovered("u1", vertices[missed_side], only_in="base", area_cm2=28.3),
        ],
        verdict="needs_review",
        verdict_confidence=0.66,
        verdict_reason="One region looks like a dent; a person should confirm it.",
        base_fingerprint=_BASE_FINGERPRINT,
        new_fingerprint=_NEW_FINGERPRINT,
        diff_id="mock-diff-0001",
        compared_fraction=0.94,
    )
