"""Group distance outliers into regions."""

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class RegionExtent:
    """Size of one region in the base scan frame."""

    centroid_m: np.ndarray
    radius_m: float
    bbox_min_m: np.ndarray
    bbox_max_m: np.ndarray


def measure_region(points: np.ndarray) -> RegionExtent:
    """Radius and axis-aligned bbox of a region's points.

    `points` is (N, 3) in the base scan frame, meters. The centroid is the mean
    of those points. `radius_m` is the max distance from that centroid to any
    point. The bbox is axis-aligned in the same frame.
    """
    pts = np.asarray(points, dtype=float)
    if pts.ndim != 2 or pts.shape[1] != 3 or len(pts) == 0:
        raise ValueError("region points must have shape (N, 3) with N >= 1")
    centroid = pts.mean(axis=0)
    radius = float(np.linalg.norm(pts - centroid, axis=1).max())
    return RegionExtent(
        centroid_m=centroid,
        radius_m=radius,
        bbox_min_m=pts.min(axis=0),
        bbox_max_m=pts.max(axis=0),
    )
