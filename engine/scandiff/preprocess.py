"""Prepare loaded scans before alignment."""

import numpy as np
import open3d as o3d
import trimesh

from scandiff import config
from scandiff.errors import ScaleMismatch, ScanTooSparse

MM = 0.001


def to_point_cloud(
    mesh: trimesh.Trimesh, n_points: int = config.SAMPLE_POINTS
) -> o3d.geometry.PointCloud:
    """Sample the surface evenly by area.

    Each point takes its face's normal. If the mesh has vertex colors, each
    point gets the color interpolated across its face.
    """
    points, face_index = trimesh.sample.sample_surface_even(
        mesh, n_points, seed=config.RANDOM_SEED
    )
    if len(points) < config.SAMPLE_EVEN_MIN_FRACTION * n_points:
        points, face_index = trimesh.sample.sample_surface(
            mesh, n_points, seed=config.RANDOM_SEED
        )

    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points))
    cloud.normals = o3d.utility.Vector3dVector(mesh.face_normals[face_index])

    if mesh.visual.kind == "vertex":
        corner_colors = mesh.visual.vertex_colors[mesh.faces[face_index], :3] / 255.0
        barycentric = trimesh.triangles.points_to_barycentric(mesh.triangles[face_index], points)
        colors = np.einsum("nk,nkc->nc", barycentric, corner_colors)
        cloud.colors = o3d.utility.Vector3dVector(np.clip(colors, 0.0, 1.0))
    return cloud


def clean(pcd: o3d.geometry.PointCloud) -> o3d.geometry.PointCloud:
    """Downsample, drop outliers and optionally the table, then recompute normals.

    Raises ScanTooSparse if fewer than config.MIN_POINTS points are left.
    """
    pcd = pcd.voxel_down_sample(config.VOXEL_MM * MM)
    pcd, _ = pcd.remove_statistical_outlier(
        nb_neighbors=config.OUTLIER_NB_NEIGHBORS, std_ratio=config.OUTLIER_STD_RATIO
    )
    if config.REMOVE_GROUND_PLANE:
        o3d.utility.random.seed(config.RANDOM_SEED)
        _, plane = pcd.segment_plane(
            distance_threshold=config.PLANE_DISTANCE_MM * MM,
            ransac_n=3,
            num_iterations=config.PLANE_RANSAC_ITERATIONS,
        )
        pcd = pcd.select_by_index(plane, invert=True)

    if len(pcd.points) < config.MIN_POINTS:
        raise ScanTooSparse(
            f"{len(pcd.points)} points left after cleaning; at least {config.MIN_POINTS} are needed."
        )
    _estimate_normals(pcd)
    return pcd


def _estimate_normals(pcd: o3d.geometry.PointCloud) -> None:
    """Re-estimate normals and point them all to the same side of the surface."""
    # Normals sampled from faces follow the mesh winding, so they point outward.
    # When they are there, flip each new normal to agree with them.
    reference = np.asarray(pcd.normals).copy() if pcd.has_normals() else None
    pcd.estimate_normals(
        o3d.geometry.KDTreeSearchParamHybrid(
            radius=config.NORMAL_RADIUS_MM * MM, max_nn=config.NORMAL_MAX_NN
        )
    )
    if reference is None:
        pcd.orient_normals_consistent_tangent_plane(config.NORMAL_ORIENT_K)
        return
    normals = np.asarray(pcd.normals)
    flip = np.einsum("ij,ij->i", normals, reference) < 0
    normals[flip] *= -1
    pcd.normals = o3d.utility.Vector3dVector(normals)


def scale_check(base: o3d.geometry.PointCloud, new: o3d.geometry.PointCloud) -> dict:
    """Compare the two scans' oriented bounding box extents, sorted so rotation doesn't matter.

    `ratios` is new / base per axis, smallest axis first. `warning` is set when
    any axis differs by more than config.SCALE_TOLERANCE. Past
    config.SCALE_MISMATCH this raises ScaleMismatch instead.
    """
    base_extents = _sorted_extents(base)
    new_extents = _sorted_extents(new)
    ratios = new_extents / base_extents
    worst = float(np.max(np.abs(ratios - 1.0)))

    if worst > config.SCALE_MISMATCH:
        raise ScaleMismatch(
            f"Bounding boxes differ by {worst:.0%} on one axis; "
            "these look like different objects or units."
        )
    warning = None
    if worst > config.SCALE_TOLERANCE:
        warning = (
            f"Bounding boxes differ by {worst:.1%} on one axis; "
            "check the units or whether one scan missed part of the item."
        )
    return {
        "base_extents_mm": (base_extents / MM).tolist(),
        "new_extents_mm": (new_extents / MM).tolist(),
        "ratios": ratios.tolist(),
        "warning": warning,
    }


def _sorted_extents(pcd: o3d.geometry.PointCloud) -> np.ndarray:
    """Box extents, measured between percentiles so scan noise doesn't inflate them."""
    # The minimal box is slow on round items, whose points are all on the hull,
    # so orient the box on an evenly spread subset. PCA is not used because its
    # axes are arbitrary for square or round cross-sections.
    subset = pcd.farthest_point_down_sample(min(config.OBB_SUBSET_POINTS, len(pcd.points)))
    box = subset.get_minimal_oriented_bounding_box()
    local = (np.asarray(pcd.points) - box.center) @ np.asarray(box.R)
    low, high = np.percentile(
        local, [config.EXTENT_PERCENTILE, 100 - config.EXTENT_PERCENTILE], axis=0
    )
    return np.sort(high - low)
