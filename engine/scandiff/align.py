"""Align a scan to a reference."""

from dataclasses import dataclass

import numpy as np
import open3d as o3d

from scandiff import config
from scandiff.errors import AlignmentFailed
from scandiff.preprocess import MM

reg = o3d.pipelines.registration


@dataclass(frozen=True)
class AlignResult:
    """`transform` maps the new scan into the base scan's frame."""

    transform: np.ndarray
    fitness: float
    rmse_mm: float
    # Which global registration won: "ransac" or "fgr".
    method: str
    # The new cloud, already in the base frame.
    aligned: o3d.geometry.PointCloud


def global_register(
    source: o3d.geometry.PointCloud, target: o3d.geometry.PointCloud, voxel_mm: float
) -> np.ndarray:
    """Rough 4x4 transform from source to target, from any starting pose."""
    return _best_global(source, target, voxel_mm)[0]


def _best_global(
    source: o3d.geometry.PointCloud, target: o3d.geometry.PointCloud, voxel_mm: float
) -> tuple[np.ndarray, str]:
    """Run RANSAC and fast global registration on FPFH features; keep the better fit."""
    voxel = voxel_mm * config.GLOBAL_VOXEL_FACTOR * MM
    distance = voxel * config.GLOBAL_DISTANCE_FACTOR
    source_down, source_fpfh = _features(source, voxel)
    target_down, target_fpfh = _features(target, voxel)

    o3d.utility.random.seed(config.RANDOM_SEED)
    ransac = reg.registration_ransac_based_on_feature_matching(
        source_down,
        target_down,
        source_fpfh,
        target_fpfh,
        mutual_filter=True,
        max_correspondence_distance=distance,
        estimation_method=reg.TransformationEstimationPointToPoint(False),
        ransac_n=3,
        checkers=[
            reg.CorrespondenceCheckerBasedOnEdgeLength(config.RANSAC_EDGE_LENGTH_RATIO),
            reg.CorrespondenceCheckerBasedOnDistance(distance),
        ],
        criteria=reg.RANSACConvergenceCriteria(config.RANSAC_MAX_ITERATIONS, config.RANSAC_CONFIDENCE),
    )
    fgr = reg.registration_fgr_based_on_feature_matching(
        source_down,
        target_down,
        source_fpfh,
        target_fpfh,
        reg.FastGlobalRegistrationOption(maximum_correspondence_distance=distance),
    )

    # Score both the same way, since each method reports fitness on its own terms.
    candidates = [(ransac.transformation, "ransac"), (fgr.transformation, "fgr")]
    scores = [
        reg.evaluate_registration(source_down, target_down, distance, transform)
        for transform, _ in candidates
    ]
    best = max(range(len(candidates)), key=lambda i: (scores[i].fitness, -scores[i].inlier_rmse))
    return np.asarray(candidates[best][0]).copy(), candidates[best][1]


def _features(
    cloud: o3d.geometry.PointCloud, voxel: float
) -> tuple[o3d.geometry.PointCloud, reg.Feature]:
    down = cloud.voxel_down_sample(voxel)
    down.estimate_normals(
        o3d.geometry.KDTreeSearchParamHybrid(
            radius=voxel * config.GLOBAL_NORMAL_RADIUS_FACTOR, max_nn=config.NORMAL_MAX_NN
        )
    )
    fpfh = reg.compute_fpfh_feature(
        down,
        o3d.geometry.KDTreeSearchParamHybrid(
            radius=voxel * config.FPFH_RADIUS_FACTOR, max_nn=config.FPFH_MAX_NN
        ),
    )
    return down, fpfh


def refine(
    source: o3d.geometry.PointCloud,
    target: o3d.geometry.PointCloud,
    init_transform: np.ndarray,
) -> tuple[np.ndarray, float, float]:
    """Point-to-plane ICP over shrinking correspondence distances.

    Returns the transform, and the fitness and inlier RMSE (mm) at the finest distance.
    """
    if not target.has_normals():
        target = o3d.geometry.PointCloud(target)
        target.estimate_normals(
            o3d.geometry.KDTreeSearchParamHybrid(
                radius=config.NORMAL_RADIUS_MM * MM, max_nn=config.NORMAL_MAX_NN
            )
        )
    transform = np.asarray(init_transform, dtype=float)
    result = None
    for distance_mm in config.ICP_DISTANCES_MM:
        result = reg.registration_icp(
            source,
            target,
            distance_mm * MM,
            transform,
            reg.TransformationEstimationPointToPlane(),
            reg.ICPConvergenceCriteria(max_iteration=config.ICP_MAX_ITERATIONS),
        )
        transform = np.asarray(result.transformation).copy()
    return transform, float(result.fitness), float(result.inlier_rmse) / MM


def align(new: o3d.geometry.PointCloud, base: o3d.geometry.PointCloud) -> AlignResult:
    """Bring `new` into `base`'s frame: global registration, then ICP.

    Raises AlignmentFailed when the result is below config.MIN_FITNESS or above
    config.MAX_RMSE_MM.
    """
    rough, method = _best_global(new, base, config.VOXEL_MM)
    transform, fitness, rmse_mm = refine(new, base, rough)
    if fitness < config.MIN_FITNESS or rmse_mm > config.MAX_RMSE_MM:
        raise AlignmentFailed(
            f"alignment failed, please re-scan (fitness {fitness:.2f}, RMSE {rmse_mm:.2f} mm)"
        )
    aligned = o3d.geometry.PointCloud(new)
    aligned.transform(transform)
    return AlignResult(
        transform=transform, fitness=fitness, rmse_mm=rmse_mm, method=method, aligned=aligned
    )
