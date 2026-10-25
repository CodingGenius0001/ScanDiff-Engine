"""Group distance outliers into regions."""

from dataclasses import dataclass
from typing import Literal

import numpy as np
import open3d as o3d
from scipy.spatial import cKDTree
from sklearn.cluster import DBSCAN

from scandiff import config
from scandiff.distance import outward_normals
from scandiff.preprocess import MM

CM2 = 1e-4

RegionKind = Literal["dent", "added", "missing"]


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


@dataclass(frozen=True)
class RegionGeom:
    """One changed region, measured in the base scan frame.

    Depths are millimeters: |signed distance| for dents and added material,
    distance to the nearest new point for missing parts. `indices` are into the
    new cloud for dents and added material, into the base cloud for missing parts.
    `sharpness` is the mean slope of the depth across the region's edge, in mm
    of depth per mm along the surface. `spread` is the RMS distance from the
    centroid over that of a flat disc of the same area: 1 is a compact patch,
    larger is elongated or scattered. `aspect_ratio` is length over width, from
    the spread of its points along their two main directions: about 1 for a
    round patch, large for a scratch. `anchor_m` is the region's point nearest
    its centroid, which on a curved region can lie off the surface, and
    `normal` the mean outward normal there; photos use both to find a view.
    """

    kind: RegionKind
    indices: np.ndarray
    area_cm2: float
    max_depth_mm: float
    mean_depth_mm: float
    extent: RegionExtent
    point_count: int
    sharpness: float
    spread: float
    aspect_ratio: float
    anchor_m: np.ndarray
    normal: np.ndarray
    before_crop_url: str | None = None
    after_crop_url: str | None = None

    @property
    def severity(self) -> float:
        return self.area_cm2 * self.max_depth_mm


@dataclass(frozen=True)
class _Surface:
    """One cloud, with what measuring regions on it needs."""

    points: np.ndarray
    # Unsigned, fitted to the nearest few points; for areas and slopes.
    normals: np.ndarray
    outward: np.ndarray
    areas: np.ndarray
    depth: np.ndarray
    tree: cKDTree


def find_regions(
    new_aligned: o3d.geometry.PointCloud,
    base: o3d.geometry.PointCloud,
    d_signed: np.ndarray,
    d_reverse: np.ndarray,
    threshold_mm: float,
    new_mask: np.ndarray | None = None,
    base_mask: np.ndarray | None = None,
) -> list[RegionGeom]:
    """Changed regions between two aligned clouds, most severe (area x max depth) first.

    `d_signed` and `d_reverse` come from `signed_distances(new_aligned, base)`,
    in meters. The candidates are the new points with |d_signed| over the
    threshold, plus the base points with d_reverse over it, which may be a
    missing part. They are clustered together with DBSCAN, and each cluster is
    one of two things. Usually its new points are the change: they are split by
    sign into dents and added material, each clustered again so every region
    stays connected, and its base points are the far side of that change (the
    base surface over a dent, or under a glued-on part). When its base points
    outweigh its changed new surface MISSING_AREA_RATIO times, a part is gone:
    the base points become missing regions, and the new points are the scar
    where it was attached. Regions under MIN_REGION_CM2 are dropped.
    `new_mask` and `base_mask` limit the candidates to points both scans
    captured (see coverage.py).
    """
    threshold = threshold_mm * MM
    new = _surface(new_aligned, np.abs(d_signed))
    old = _surface(base, np.asarray(d_reverse))
    changed = np.flatnonzero((new.depth > threshold) & (True if new_mask is None else new_mask))
    unmatched = np.flatnonzero((old.depth > threshold) & (True if base_mask is None else base_mask))
    if len(changed) + len(unmatched) == 0:
        return []

    labels = _cluster(np.vstack([new.points[changed], old.points[unmatched]]))
    new_labels, base_labels = labels[: len(changed)], labels[len(changed) :]
    regions = []
    for label in np.unique(labels[labels >= 0]):
        moved = changed[new_labels == label]
        far_side = unmatched[base_labels == label]
        if old.areas[far_side].sum() > config.MISSING_AREA_RATIO * new.areas[moved].sum():
            regions += [_measure("missing", old, piece) for piece in _components(old.points, far_side)]
            continue
        for kind, part in (("dent", moved[d_signed[moved] < 0]), ("added", moved[d_signed[moved] > 0])):
            regions += [_measure(kind, new, piece) for piece in _components(new.points, part)]

    regions = [region for region in regions if region.area_cm2 >= config.MIN_REGION_CM2]
    return sorted(regions, key=lambda region: region.severity, reverse=True)


def point_areas(normals: np.ndarray, voxel_m: float = config.VOXEL_MM * MM) -> np.ndarray:
    """Surface area each point of a voxel-downsampled cloud stands for, m².

    A plane with unit normal n crosses (|nx| + |ny| + |nz|) / voxel² voxels per
    unit area, and downsampling keeps one point per voxel. A flat count of
    voxel² overstates tilted surface by up to sqrt(3).
    """
    return voxel_m**2 / np.abs(normals).sum(axis=1)


def cloud_point_areas(cloud: o3d.geometry.PointCloud) -> np.ndarray:
    """`point_areas` for every point of a voxel-downsampled cloud, m²."""
    points = np.asarray(cloud.points)
    return point_areas(_local_normals(points, cKDTree(points)))


def _surface(cloud: o3d.geometry.PointCloud, depth: np.ndarray) -> _Surface:
    points = np.asarray(cloud.points)
    tree = cKDTree(points)
    normals = _local_normals(points, tree)
    return _Surface(points, normals, outward_normals(cloud), point_areas(normals), depth, tree)


def _local_normals(points: np.ndarray, tree: cKDTree) -> np.ndarray:
    """Unsigned normal of the plane through each point's AREA_NEIGHBORS nearest points.

    The cloud's own normals average over NORMAL_RADIUS_MM, so on a feature
    only a few voxels across they lean at every edge, which undercounts its
    area: by 27% on a 1 cm cube, against 12% with these.
    """
    _, nearest = tree.query(points, k=min(config.AREA_NEIGHBORS, len(points)))
    neighborhoods = points[nearest] - points[nearest].mean(axis=1, keepdims=True)
    return np.linalg.svd(neighborhoods, full_matrices=False)[2][:, 2]


def _cluster(points: np.ndarray) -> np.ndarray:
    """DBSCAN labels; -1 is noise."""
    eps = config.REGION_EPS_VOXELS * config.VOXEL_MM * MM
    return DBSCAN(eps=eps, min_samples=config.REGION_MIN_SAMPLES).fit_predict(points)


def _components(points: np.ndarray, indices: np.ndarray) -> list[np.ndarray]:
    """`indices` split into connected clusters, without noise."""
    if len(indices) < config.REGION_MIN_SAMPLES:
        return []
    labels = _cluster(points[indices])
    return [indices[labels == label] for label in np.unique(labels[labels >= 0])]


def _measure(kind: RegionKind, surface: _Surface, indices: np.ndarray) -> RegionGeom:
    areas = surface.areas[indices]
    area = float(areas.sum())
    depth_mm = surface.depth[indices] / MM
    points = surface.points[indices]
    extent = measure_region(points)
    from_centroid = np.linalg.norm(points - extent.centroid_m, axis=1)
    rms_m = np.sqrt(np.mean(from_centroid**2))
    normal = surface.outward[indices].sum(axis=0)
    return RegionGeom(
        kind=kind,
        indices=indices,
        area_cm2=area / CM2,
        max_depth_mm=float(depth_mm.max()),
        mean_depth_mm=float(np.average(depth_mm, weights=areas)),
        extent=extent,
        point_count=len(indices),
        sharpness=_edge_sharpness(surface, indices),
        # A flat disc of area A has an RMS radius of sqrt(A / 2 pi).
        spread=float(rms_m / np.sqrt(area / (2 * np.pi))),
        aspect_ratio=_aspect_ratio(points),
        anchor_m=points[np.argmin(from_centroid)],
        normal=normal / max(np.linalg.norm(normal), 1e-12),
    )


def _aspect_ratio(points: np.ndarray) -> float:
    """Length over width: the ratio of the spread along the two main directions."""
    if len(points) < 3:
        return 1.0
    spreads = np.linalg.svd(points - points.mean(axis=0), compute_uv=False)
    return float(spreads[0] / max(spreads[1], 1e-12))


def _edge_sharpness(surface: _Surface, indices: np.ndarray) -> float:
    """Mean slope of the depth at the region's edge points, mm per mm.

    An edge point has a neighbor outside the region. Its slope is the
    least-squares gradient of the depth over its neighbors, in the tangent
    plane, so the depth's own offset along the normal does not count as slope.
    """
    radius = config.REGION_GRADIENT_RADIUS_VOXELS * config.VOXEL_MM * MM
    inside = np.zeros(len(surface.points), dtype=bool)
    inside[indices] = True
    slopes = []
    for index, near in zip(indices, surface.tree.query_ball_point(surface.points[indices], radius)):
        near = np.asarray(near)
        if inside[near].all() or len(near) < 4:
            continue
        tangent = _tangent_basis(surface.normals[index])
        offsets = (surface.points[near] - surface.points[index]) @ tangent.T
        rises = surface.depth[near] - surface.depth[index]
        gradient = np.linalg.lstsq(offsets, rises, rcond=None)[0]
        slopes.append(np.linalg.norm(gradient))
    return float(np.mean(slopes)) if slopes else 0.0


def _tangent_basis(normal: np.ndarray) -> np.ndarray:
    """Two orthonormal rows perpendicular to `normal`."""
    helper = np.eye(3)[np.argmin(np.abs(normal))]
    first = np.cross(normal, helper)
    first /= np.linalg.norm(first)
    return np.array([first, np.cross(normal, first) / np.linalg.norm(normal)])
