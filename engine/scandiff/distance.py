"""Point-to-surface distances between aligned scans."""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import open3d as o3d
from scipy.spatial import cKDTree

from scandiff import config
from scandiff.align import align
from scandiff.preprocess import MM

# Scales the median absolute deviation to a standard deviation for normal noise.
MAD_TO_SIGMA = 1.4826


def signed_distances(
    new_aligned: o3d.geometry.PointCloud, base: o3d.geometry.PointCloud
) -> tuple[np.ndarray, np.ndarray]:
    """Distances between two clouds already in the same frame, in meters.

    Returns `(signed, reverse)`:
    - `signed`, one per new point: offset from the nearest base point along that
      point's outward normal. Positive is added material, negative a dent.
    - `reverse`, one per base point: unsigned distance to the nearest new point.
      A removed part shows here, as base points with no new point nearby.
    """
    new_points = np.asarray(new_aligned.points)
    base_points = np.asarray(base.points)
    normals = outward_normals(base)

    _, nearest = cKDTree(base_points).query(new_points)
    signed = np.einsum("ij,ij->i", new_points - base_points[nearest], normals[nearest])
    reverse, _ = cKDTree(new_points).query(base_points)
    return signed, reverse


def outward_normals(cloud: o3d.geometry.PointCloud) -> np.ndarray:
    """The cloud's normals, all on the outside of the surface.

    Normals from `preprocess.clean` already follow the mesh winding. Missing
    normals are estimated and made consistent with each other. Either way, if
    most of them point toward the centroid, the whole set is flipped: a
    centroid test per point would break on concave parts like a mug's inside.
    """
    if not cloud.has_normals():
        cloud = o3d.geometry.PointCloud(cloud)
        cloud.estimate_normals(
            o3d.geometry.KDTreeSearchParamHybrid(
                radius=config.NORMAL_RADIUS_MM * MM, max_nn=config.NORMAL_MAX_NN
            )
        )
        cloud.orient_normals_consistent_tangent_plane(config.NORMAL_ORIENT_K)
    points = np.asarray(cloud.points)
    normals = np.asarray(cloud.normals).copy()
    outward = np.einsum("ij,ij->i", normals, points - points.mean(axis=0))
    if np.mean(outward > 0) < 0.5:
        normals *= -1
    return normals


def calibrate_noise_floor(
    pairs: list[tuple[o3d.geometry.PointCloud, o3d.geometry.PointCloud]],
) -> dict:
    """Scan-to-scan noise from pairs of scans of the same unchanged object.

    Each pair is aligned (second onto first) and compared. Each pair's sigma
    comes from the median absolute deviation of its signed distances, so a few
    bad points don't inflate it; the overall sigma pools their variances. The
    percentiles are over all distances. The threshold is their 95th
    percentile, at least MIN_THRESHOLD_MM. Distances in the result are millimeters.
    """
    if not pairs:
        raise ValueError("calibration needs at least one pair of scans")
    per_pair = []
    pooled = []
    for scan_a, scan_b in pairs:
        result = align(scan_b, scan_a)
        signed_mm = signed_distances(result.aligned, scan_a)[0] / MM
        pooled.append(signed_mm)
        per_pair.append(
            {**_noise_summary(signed_mm), "icp_fitness": result.fitness, "icp_rmse_mm": result.rmse_mm}
        )

    # Pool variances, not raw distances: one MAD over a quiet pair and a noisy
    # pair follows the median pair and understates the noise.
    summary = _noise_summary(np.concatenate(pooled))
    points = np.array([pair["points"] for pair in per_pair], dtype=float)
    variances = np.array([pair["sigma_mm"] ** 2 for pair in per_pair])
    summary["sigma_mm"] = float(np.sqrt(np.average(variances, weights=points)))
    return {
        **summary,
        "threshold_mm": max(config.MIN_THRESHOLD_MM, summary["p95_mm"]),
        "min_threshold_mm": config.MIN_THRESHOLD_MM,
        "pairs": per_pair,
    }


def _noise_summary(signed_mm: np.ndarray) -> dict:
    mad = float(np.median(np.abs(signed_mm - np.median(signed_mm))))
    p95, p99 = np.percentile(np.abs(signed_mm), [95, 99])
    return {
        "sigma_mm": MAD_TO_SIGMA * mad,
        "p95_mm": float(p95),
        "p99_mm": float(p99),
        "points": int(len(signed_mm)),
    }


def write_calibration(calibration: dict, path: Path = config.CALIBRATION_PATH) -> Path:
    """Save a calibrate_noise_floor result where config reads it at startup."""
    stamped = {"created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **calibration}
    path.write_text(json.dumps(stamped, indent=2) + "\n")
    return path


def stats(
    d_signed: np.ndarray,
    d_reverse: np.ndarray,
    threshold: float,
    point_area: float | np.ndarray,
    base_point_area: float | np.ndarray | None = None,
) -> dict:
    """Summary of a comparison. Distances and threshold in meters; results in mm.

    `point_area` is the surface area each new point stands for (m², one value
    or one per point), so fractions are shares of surface, not of points.
    `base_point_area` does the same for the base points behind `d_reverse`;
    without it, base points count equally, which is right after voxel
    downsampling. Fractions are of the new surface, which matches the base
    surface wherever the scans agree.
    """
    weights = np.broadcast_to(np.asarray(point_area, dtype=float), d_signed.shape)
    changed = np.abs(d_signed) > threshold
    changed_area = float(weights[changed].sum())
    dents = changed & (d_signed < 0)

    base_weights = np.broadcast_to(
        np.asarray(1.0 if base_point_area is None else base_point_area, dtype=float), d_reverse.shape
    )
    unmatched = d_reverse > threshold

    signed_mm = d_signed / MM
    if changed.any():
        mean_change_mm = float(np.average(np.abs(signed_mm[changed]), weights=weights[changed]))
        dent_share = float(weights[dents].sum()) / changed_area
    else:
        mean_change_mm = 0.0
        dent_share = 0.0
    return {
        "histogram": _histogram(signed_mm),
        "threshold_mm": threshold / MM,
        "changed_fraction": changed_area / float(weights.sum()),
        "max_change_mm": float(max(np.abs(d_signed).max(initial=0.0), d_reverse.max(initial=0.0))) / MM,
        "max_dent_mm": -float(d_signed.min(initial=0.0)) / MM,
        "max_added_mm": float(d_signed.max(initial=0.0)) / MM,
        "mean_change_mm": mean_change_mm,
        "dent_share": dent_share,
        "added_share": 1.0 - dent_share if changed.any() else 0.0,
        # Base surface with no new point within the threshold: removed parts,
        # and also the base side of dents deeper than the threshold.
        "unmatched_base_fraction": float(base_weights[unmatched].sum()) / float(base_weights.sum()),
    }


def _histogram(signed_mm: np.ndarray) -> dict:
    """Fixed bins from -HISTOGRAM_RANGE_MM to +HISTOGRAM_RANGE_MM, plus overflow counts."""
    span = config.HISTOGRAM_RANGE_MM
    bins = int(round(2 * span / config.HISTOGRAM_BIN_MM))
    counts, edges = np.histogram(signed_mm, bins=bins, range=(-span, span))
    return {
        "bin_edges_mm": edges.round(6).tolist(),
        "counts": counts.tolist(),
        "below_range": int(np.count_nonzero(signed_mm < -span)),
        "above_range": int(np.count_nonzero(signed_mm > span)),
    }
