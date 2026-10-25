"""Which parts of the surface each scan actually captured.

Object Capture closes surfaces it never saw, such as an item's bottom, with
made-up flat patches. Two such patches never agree, so comparing them flags
damage that is not there. A point is compared only when key photos from both
scans see it; everything else is reported as uncovered.
"""

from dataclasses import dataclass

import numpy as np
import open3d as o3d
from sklearn.cluster import DBSCAN

from scandiff import config
from scandiff.distance import outward_normals
from scandiff.photos import ScanView, project_points
from scandiff.preprocess import MM
from scandiff.regions import CM2, RegionExtent, measure_region

OnlyIn = str  # "base", "new" or "neither", as in the contract's UncoveredRegion


@dataclass(frozen=True)
class UncoveredPatch:
    only_in: OnlyIn
    extent: RegionExtent
    area_cm2: float


@dataclass(frozen=True)
class Coverage:
    """Masks of the points both scans captured, and what was left out."""

    base_compared: np.ndarray
    new_compared: np.ndarray
    # Share of the base surface's area that was compared.
    compared_fraction: float
    uncovered: list[UncoveredPatch]


def seen(points: np.ndarray, normals: np.ndarray, scan: ScanView, slack_m: float | np.ndarray) -> np.ndarray:
    """Which points one of `scan`'s key photos sees. Points and outward normals are in the base frame.

    A point is seen when it projects inside a photo, faces that camera with a
    cosine of at least COVERAGE_MIN_FACING, and no mesh surface sits more than
    OCCLUSION_TOLERANCE_MM plus `slack_m` in front of it. The slack is how far
    the point may lie off this scan's surface: 0 for the scan's own points,
    their distance to this scan for the other scan's.
    """
    local = scan.from_base(points)
    local_normals = normals @ np.linalg.inv(scan.to_base)[:3, :3].T
    slack = np.broadcast_to(config.OCCLUSION_TOLERANCE_MM * MM + np.asarray(slack_m, dtype=float), len(local))
    result = np.zeros(len(local), dtype=bool)
    for photo in scan.photos:
        _, inside = project_points(local, photo)
        to_camera = photo.center_world - local
        distance = np.linalg.norm(to_camera, axis=1)
        facing = np.einsum("ij,ij->i", local_normals, to_camera) / distance >= config.COVERAGE_MIN_FACING
        candidates = np.flatnonzero(inside & facing & ~result)
        if len(candidates):
            hits = scan.first_hits(photo.center_world, local[candidates])
            result[candidates] = hits >= distance[candidates] - slack[candidates]
    return result


def coverage(
    base: o3d.geometry.PointCloud,
    new_aligned: o3d.geometry.PointCloud,
    d_signed: np.ndarray,
    d_reverse: np.ndarray,
    base_view: ScanView,
    new_view: ScanView,
    base_areas: np.ndarray,
) -> Coverage:
    """What both scans captured, from `signed_distances(new_aligned, base)` and each scan's photos.

    `base_areas` is each base point's surface area (regions.cloud_point_areas).
    Uncovered base surface is grouped into patches by which scan, if either,
    saw it; patches under MIN_UNCOVERED_CM2 are left out.
    """
    base_points = np.asarray(base.points)
    base_normals = outward_normals(base)
    new_points = np.asarray(new_aligned.points)
    new_normals = outward_normals(new_aligned)

    base_in_base = seen(base_points, base_normals, base_view, 0.0)
    base_in_new = seen(base_points, base_normals, new_view, d_reverse)
    new_in_new = seen(new_points, new_normals, new_view, 0.0)
    new_in_base = seen(new_points, new_normals, base_view, np.abs(d_signed))

    base_compared = base_in_base & base_in_new
    uncovered = []
    for only_in, mask in (
        ("base", base_in_base & ~base_in_new),
        ("new", ~base_in_base & base_in_new),
        ("neither", ~base_in_base & ~base_in_new),
    ):
        for indices in _patches(base_points, mask):
            area_cm2 = float(base_areas[indices].sum()) / CM2
            if area_cm2 >= config.MIN_UNCOVERED_CM2:
                uncovered.append(UncoveredPatch(only_in, measure_region(base_points[indices]), area_cm2))
    return Coverage(
        base_compared=base_compared,
        new_compared=new_in_new & new_in_base,
        compared_fraction=float(base_areas[base_compared].sum() / base_areas.sum()),
        uncovered=sorted(uncovered, key=lambda patch: patch.area_cm2, reverse=True),
    )


def _patches(points: np.ndarray, mask: np.ndarray) -> list[np.ndarray]:
    indices = np.flatnonzero(mask)
    if len(indices) < config.REGION_MIN_SAMPLES:
        return []
    eps = config.REGION_EPS_VOXELS * config.VOXEL_MM * MM
    labels = DBSCAN(eps=eps, min_samples=config.REGION_MIN_SAMPLES).fit_predict(points[indices])
    return [indices[labels == label] for label in np.unique(labels[labels >= 0])]
