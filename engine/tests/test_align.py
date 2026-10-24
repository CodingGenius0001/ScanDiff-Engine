"""Global registration plus ICP."""

import numpy as np
import open3d as o3d
import pytest
import trimesh

from scandiff.align import align, global_register, refine
from scandiff.errors import AlignmentFailed
from scandiff.preprocess import clean, to_point_cloud

N_POINTS = 60_000


def _cloud(mesh):
    return clean(to_point_cloud(mesh, N_POINTS))


def _box():
    return _cloud(trimesh.creation.box(extents=[0.10, 0.06, 0.03]))


def _moved(cloud, seed, noise_m=0.0):
    """Rotate 90 degrees about a random axis and translate 20 cm."""
    rng = np.random.default_rng(seed)
    axis = rng.normal(size=3)
    transform = trimesh.transformations.rotation_matrix(np.pi / 2, axis / np.linalg.norm(axis))
    direction = rng.normal(size=3)
    transform[:3, 3] = 0.2 * direction / np.linalg.norm(direction)
    moved = o3d.geometry.PointCloud(cloud)
    if noise_m:
        points = np.asarray(moved.points) + rng.normal(0, noise_m, (len(moved.points), 3))
        moved.points = o3d.utility.Vector3dVector(points)
    moved.transform(transform)
    return moved


def _mean_distance_mm(cloud, reference):
    return 1000 * float(np.mean(np.asarray(cloud.compute_point_cloud_distance(reference))))


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_align_recovers_a_moved_box(seed):
    base = _box()
    new = _moved(base, seed)

    result = align(new, base)

    assert result.rmse_mm < 1.0
    assert result.fitness > 0.99
    assert result.method in {"ransac", "fgr"}
    assert _mean_distance_mm(result.aligned, base) < 1.0
    assert np.allclose(np.asarray(new.transform(result.transform).points), result.aligned.points)


def test_align_handles_a_noisy_rescan():
    base = _box()
    new = _moved(base, seed=4, noise_m=0.0005)

    result = align(new, base)

    assert result.fitness > 0.9
    assert result.rmse_mm < 1.5
    assert _mean_distance_mm(result.aligned, base) < 1.5


def test_align_rejects_a_different_shape():
    base = _box()
    torus = _cloud(trimesh.creation.torus(major_radius=0.05, minor_radius=0.015))

    with pytest.raises(AlignmentFailed, match="alignment failed, please re-scan"):
        align(torus, base)


def test_refine_tightens_a_rough_start():
    base = _box()
    rough = np.eye(4)
    rough[:3, 3] = [0.004, -0.003, 0.002]
    new = o3d.geometry.PointCloud(base)
    new.transform(np.linalg.inv(rough))

    transform, fitness, rmse_mm = refine(new, base, np.eye(4))

    assert fitness > 0.99
    assert rmse_mm < 0.1
    assert np.allclose(transform[:3, 3], rough[:3, 3], atol=1e-4)


def test_global_register_returns_a_4x4_transform():
    base = _box()

    transform = global_register(_moved(base, seed=5), base, voxel_mm=2.0)

    assert transform.shape == (4, 4)
    assert np.allclose(transform[3], [0, 0, 0, 1])


def test_align_accepts_a_correct_alignment_with_large_real_change():
    # Like a power cord wrapped around the item: extra material 3.5 mm off most of the
    # surface, so under 60% of the new points are within 2 mm of the base.
    base = _box()
    points = np.asarray(base.points)
    normals = np.asarray(base.normals)
    wrapped = points[:, 0] > -0.03
    layer = points[wrapped] + normals[wrapped] * 0.0035
    new = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(np.vstack([points, layer])))
    new.normals = o3d.utility.Vector3dVector(np.vstack([normals, normals[wrapped]]))
    new = _moved(new, seed=6)

    result = align(new, base)

    assert result.fitness < 0.6
    assert result.gate_fitness >= 0.99
    # The original surface lands back on the base, in whichever of the box's symmetric poses.
    original = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(np.asarray(result.aligned.points)[: len(points)]))
    assert _mean_distance_mm(original, base) < 0.5
