"""Color distances into a heatmap.

The baked vertex colors are a signed scale: blue is a dent, gray is inside the
neutral band, and red is added material. Viewers read heatmap_legend rather than
recoloring the GLB.
"""

import numpy as np
import open3d as o3d
import trimesh

from app.schemas import COLORMAP
from scandiff import config
from scandiff.distance import signed_distances
from scandiff.preprocess import MM

DENT_RGB = (37, 99, 235)
NEUTRAL_RGB = (200, 200, 200)
ADDED_RGB = (220, 38, 38)


def diverging_colors(signed_mm: np.ndarray, neutral_mm: float, saturation_mm: float) -> np.ndarray:
    """RGBA per value: gray within ±neutral_mm, then blending linearly to blue
    (negative) or red (positive), fully saturated from ±saturation_mm."""
    signed_mm = np.asarray(signed_mm, dtype=float)
    span = max(saturation_mm - neutral_mm, 1e-9)
    strength = np.clip((np.abs(signed_mm) - neutral_mm) / span, 0.0, 1.0)[:, None]
    neutral = np.array(NEUTRAL_RGB, dtype=float)
    end = np.where((signed_mm < 0)[:, None], np.array(DENT_RGB, dtype=float), np.array(ADDED_RGB, dtype=float))
    colors = np.empty((len(signed_mm), 4), dtype=np.uint8)
    colors[:, :3] = np.round(neutral + (end - neutral) * strength).astype(np.uint8)
    colors[:, 3] = 255
    return colors


def heatmap_legend(threshold_mm: float) -> dict:
    """How to read make_heatmap's colors. Fits the API's HeatmapLegend, plus the color stops."""
    saturation_mm = config.HEATMAP_SATURATION_THRESHOLDS * threshold_mm
    return {
        "min_mm": -saturation_mm,
        "max_mm": saturation_mm,
        "threshold_mm": threshold_mm,
        "neutral_band_mm": threshold_mm,
        "colormap": COLORMAP,
        # Colors blend linearly between neighboring stops.
        "colors": [
            {"mm": -saturation_mm, "rgb": list(DENT_RGB)},
            {"mm": -threshold_mm, "rgb": list(NEUTRAL_RGB)},
            {"mm": threshold_mm, "rgb": list(NEUTRAL_RGB)},
            {"mm": saturation_mm, "rgb": list(ADDED_RGB)},
        ],
    }


def to_linear(colors: np.ndarray) -> np.ndarray:
    """sRGB uint8 RGBA to linear uint8 RGBA. glTF stores COLOR_0 in linear space, so viewers
    show sRGB values written as-is too light: gray turns near-white and tints wash out."""
    out = colors.copy()
    c = colors[:, :3].astype(float) / 255.0
    linear = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    out[:, :3] = np.round(linear * 255.0).astype(np.uint8)
    return out


def make_heatmap(
    new_mesh: trimesh.Trimesh,
    transform: np.ndarray,
    base_cloud: o3d.geometry.PointCloud,
    threshold_mm: float,
) -> bytes:
    """GLB of the new scan's surface in the base frame, colored by signed distance to the base.

    `transform` maps the new scan into the base frame (AlignResult.transform).
    The mesh is decimated to config.HEATMAP_MAX_FACES first, or a coarse one subdivided
    toward config.HEATMAP_MAX_EDGE_MM. A part removed since the base scan has no surface
    here; it shows in the reverse distances. Colors are stored linear, as glTF requires.
    """
    mesh = new_mesh.copy()
    mesh.apply_transform(transform)
    mesh = _decimate(mesh, config.HEATMAP_MAX_FACES)
    mesh = _subdivide(mesh, config.HEATMAP_MAX_EDGE_MM * MM, config.HEATMAP_MAX_FACES)
    vertices = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(mesh.vertices))
    signed_mm = signed_distances(vertices, base_cloud)[0] / MM
    saturation_mm = config.HEATMAP_SATURATION_THRESHOLDS * threshold_mm
    mesh.visual = trimesh.visual.ColorVisuals(
        mesh, vertex_colors=to_linear(diverging_colors(signed_mm, threshold_mm, saturation_mm))
    )
    return mesh.export(file_type="glb", include_normals=True)


def _decimate(mesh: trimesh.Trimesh, max_faces: int) -> trimesh.Trimesh:
    if len(mesh.faces) <= max_faces:
        return mesh
    simplified = o3d.geometry.TriangleMesh(
        o3d.utility.Vector3dVector(mesh.vertices), o3d.utility.Vector3iVector(mesh.faces)
    ).simplify_quadric_decimation(target_number_of_triangles=max_faces)
    return trimesh.Trimesh(
        vertices=np.asarray(simplified.vertices), faces=np.asarray(simplified.triangles), process=False
    )


def _subdivide(mesh: trimesh.Trimesh, max_edge_m: float, max_faces: int) -> trimesh.Trimesh:
    """Split every triangle into four (midpoints, so the shape is unchanged) while edges average
    over max_edge_m and the result stays within max_faces."""
    while len(mesh.faces) * 4 <= max_faces and mesh.edges_unique_length.mean() > max_edge_m:
        mesh = mesh.subdivide()
    return mesh
