"""Sampling, cleaning, and the scale check."""

import numpy as np
import open3d as o3d
import pytest
import trimesh

from scandiff import config
from scandiff.errors import ScaleMismatch, ScanTooSparse
from scandiff.preprocess import clean, scale_check, to_point_cloud

N_POINTS = 30_000


def _sphere(radius=0.05):
    return trimesh.creation.icosphere(subdivisions=4, radius=radius)


def _box_cloud(extents, rotation_seed=None):
    box = trimesh.creation.box(extents=extents)
    if rotation_seed is not None:
        box.apply_transform(trimesh.transformations.random_rotation_matrix(
            np.random.default_rng(rotation_seed).random(3)
        ))
    return clean(to_point_cloud(box, N_POINTS))


def _outward_fraction(cloud):
    points = np.asarray(cloud.points)
    return np.mean(np.einsum("ij,ij->i", np.asarray(cloud.normals), points) > 0)


def test_to_point_cloud_keeps_face_normals():
    cloud = to_point_cloud(_sphere(), N_POINTS)

    assert len(cloud.points) == N_POINTS
    assert not cloud.has_colors()
    assert _outward_fraction(cloud) == 1.0


def test_to_point_cloud_interpolates_vertex_colors():
    mesh = _sphere()
    colors = np.zeros((len(mesh.vertices), 4), dtype=np.uint8)
    colors[:, 0] = 255
    colors[:, 3] = 255
    colors[mesh.vertices[:, 2] > 0, 2] = 255
    mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=colors)

    cloud = to_point_cloud(mesh, N_POINTS)

    sampled = np.asarray(cloud.colors)
    points = np.asarray(cloud.points)
    assert np.allclose(sampled[:, 0], 1.0)
    assert np.allclose(sampled[points[:, 2] < -0.01, 2], 0.0)
    assert np.allclose(sampled[points[:, 2] > 0.01, 2], 1.0)


def test_to_point_cloud_falls_back_when_even_sampling_is_short(monkeypatch):
    mesh = _sphere()
    monkeypatch.setattr(
        trimesh.sample, "sample_surface_even", lambda mesh, count, seed=None: (np.zeros((10, 3)), np.zeros(10, int))
    )

    cloud = to_point_cloud(mesh, N_POINTS)

    assert len(cloud.points) == N_POINTS


def test_clean_downsamples_drops_outliers_and_orients_normals():
    cloud = to_point_cloud(_sphere(), N_POINTS)
    outliers = np.random.default_rng(0).uniform(0.2, 0.3, size=(50, 3))
    cloud.points.extend(o3d.utility.Vector3dVector(outliers))
    cloud.normals.extend(o3d.utility.Vector3dVector(np.tile([0.0, 0.0, 1.0], (50, 1))))

    cleaned = clean(cloud)

    points = np.asarray(cleaned.points)
    assert config.MIN_POINTS <= len(points) < N_POINTS
    assert np.linalg.norm(points, axis=1).max() < 0.06
    assert _outward_fraction(cleaned) > 0.99


def test_clean_orients_normals_without_reference():
    points = np.asarray(to_point_cloud(_sphere(), N_POINTS).points)
    cloud = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(points))

    cleaned = clean(cloud)

    fraction = _outward_fraction(cleaned)
    assert fraction > 0.99 or fraction < 0.01


def test_clean_removes_ground_plane_when_enabled(monkeypatch):
    radius = 0.05
    table = trimesh.creation.box(extents=[0.3, 0.3, 0.001])
    table.apply_translation([0, 0, -radius - 0.0005])
    scan = trimesh.util.concatenate([_sphere(radius), table])
    cloud = to_point_cloud(scan, 60_000)

    kept = np.asarray(clean(cloud).points)
    assert np.linalg.norm(kept, axis=1).max() > 0.1

    monkeypatch.setattr(config, "REMOVE_GROUND_PLANE", True)
    without_table = np.asarray(clean(cloud).points)
    assert np.linalg.norm(without_table, axis=1).max() < radius + 0.002


def test_clean_raises_when_too_sparse():
    cloud = to_point_cloud(_sphere(radius=0.005), N_POINTS)

    with pytest.raises(ScanTooSparse):
        clean(cloud)


def test_scale_check_ignores_rotation():
    base = _box_cloud([0.10, 0.06, 0.03])
    new = _box_cloud([0.10, 0.06, 0.03], rotation_seed=1)

    result = scale_check(base, new)

    assert result["warning"] is None
    assert result["ratios"] == pytest.approx([1.0, 1.0, 1.0], abs=0.02)
    assert result["base_extents_mm"] == pytest.approx([30, 60, 100], abs=2)


def test_scale_check_square_cross_section_ignores_rotation():
    base = _box_cloud([0.06, 0.06, 0.03])

    for seed in range(1, 4):
        result = scale_check(base, _box_cloud([0.06, 0.06, 0.03], rotation_seed=seed))
        assert result["warning"] is None


def test_scale_check_handles_round_items():
    cloud = clean(to_point_cloud(_sphere(), N_POINTS))

    result = scale_check(cloud, cloud)

    assert result["ratios"] == pytest.approx([1.0, 1.0, 1.0])
    assert result["base_extents_mm"] == pytest.approx([100, 100, 100], abs=3)


def test_scale_check_warns_past_tolerance():
    base = _box_cloud([0.10, 0.06, 0.03])
    new = _box_cloud([0.10, 0.06, 0.03 * 1.08], rotation_seed=2)

    result = scale_check(base, new)

    assert result["warning"] is not None
    assert result["ratios"][0] == pytest.approx(1.08, abs=0.02)


def test_scale_check_raises_on_mismatch():
    base = _box_cloud([0.10, 0.06, 0.03])
    new = _box_cloud([0.13, 0.078, 0.039])

    with pytest.raises(ScaleMismatch, match="different objects or units"):
        scale_check(base, new)
