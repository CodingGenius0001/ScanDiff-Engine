"""The whole comparison (app.pipeline.compare) on synthetic scans with known changes.

Each scan is a mesh plus key photos taken from known poses around it, written
the way the app writes them: JPEGs, column-major camera_transform and
intrinsics. Coverage, alignment, distances, regions, classification and the
verdict all run for real; only uploads go to a temporary folder and vision is off.
"""

from datetime import datetime, timezone

import numpy as np
import pytest
import trimesh
from PIL import Image

from app import scan_models
from app.pipeline import LoadedScan, compare
from app.schemas import DiffResponse, PhotoMeta, ScanMetadata
from scandiff import classify, storage

EXTENTS = np.array([0.12, 0.08, 0.06])
TOP = EXTENTS[2] / 2
IMAGE_W, IMAGE_H, FOCAL = 640, 480, 500.0
CAMERA_DISTANCE = 0.4
DENT_AT, DENT_RADIUS, DENT_DEPTH = np.array([0.03, 0.01]), 0.012, 0.006


@pytest.fixture(autouse=True)
def local_results(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "STATIC_DIR", tmp_path / "static")
    monkeypatch.setattr(scan_models, "GLB_CACHE_DIR", tmp_path / "glb")
    monkeypatch.setattr(classify, "vision_provider", lambda: None)


def _deform(vertices):
    """Taper and shear, so the object has no symmetry for alignment to confuse."""
    v = vertices.copy()
    v[:, 0] *= 1 + 0.25 * v[:, 1] / EXTENTS[1]
    v[:, 2] += 0.15 * v[:, 0]
    return v


def _object(dent=False, chunk=False, noise_mm=0.0, seed=0):
    """The test object, about 12 x 8 x 6 cm, meshed at 3 mm, optionally changed."""
    mesh = trimesh.creation.box(extents=EXTENTS).subdivide_to_size(max_edge=0.003)
    mesh.merge_vertices()
    v = mesh.vertices.copy()
    if dent:
        # A 6 mm deep round dent in the top face, easing out to its rim.
        top = np.isclose(v[:, 2], TOP)
        r = np.linalg.norm(v[:, :2] - DENT_AT, axis=1)
        v[top, 2] -= DENT_DEPTH * np.clip(1 - (r[top] / DENT_RADIUS) ** 2, 0, None)
    if chunk:
        # A corner cut off flat: up to about 15 mm of material gone.
        corner = np.sign([1, 1, 1]) * EXTENTS / 2
        normal = corner / np.linalg.norm(corner)
        plane = normal @ corner - 0.015
        beyond = v @ normal - plane
        v[beyond > 0] -= np.outer(beyond[beyond > 0], normal)
    if noise_mm:
        rng = np.random.default_rng(seed)
        v += rng.normal(0, noise_mm / 1000, v.shape)
    return trimesh.Trimesh(_deform(v), mesh.faces, process=False)


def _look_at(center, target=np.zeros(3)):
    """ARKit camera-to-world pose: the camera looks down its -Z axis at `target`."""
    back = center - target
    back /= np.linalg.norm(back)
    up = np.array([0.0, 1.0, 0.0]) if abs(back[1]) < 0.95 else np.array([0.0, 0.0, 1.0])
    right = np.cross(up, back)
    right /= np.linalg.norm(right)
    pose = np.eye(4)
    pose[:3, 0], pose[:3, 1], pose[:3, 2], pose[:3, 3] = right, np.cross(back, right), back, center
    return pose


def _ring_poses(azimuths_deg=range(0, 360, 30), elevations_deg=(-35, 0, 35), poles=True):
    poses = []
    for elevation in np.radians(elevations_deg):
        for azimuth in np.radians(list(azimuths_deg)):
            direction = [np.cos(elevation) * np.cos(azimuth), np.sin(elevation), np.cos(elevation) * np.sin(azimuth)]
            poses.append(_look_at(CAMERA_DISTANCE * np.array(direction)))
    if poles:
        poses += [_look_at(np.array([0.0, CAMERA_DISTANCE, 0.001])), _look_at(np.array([0.0, -CAMERA_DISTANCE, 0.001]))]
    return poses


def _scan(folder, mesh, poses, item_id="widget-001", scan_id="SCAN", transform=None):
    """Write key photos and metadata for `mesh` the way the app does; `transform` moves mesh and cameras together."""
    folder.mkdir(parents=True)
    if transform is not None:
        mesh = mesh.copy()
        mesh.apply_transform(transform)
        poses = [transform @ pose for pose in poses]
    K = np.array([[FOCAL, 0, IMAGE_W / 2], [0, FOCAL, IMAGE_H / 2], [0, 0, 1]])
    rng = np.random.default_rng(len(poses))
    photos = []
    for number, pose in enumerate(poses, start=1):
        name = f"photo_{number:02d}.jpg"
        pixels = rng.integers(90, 160, (IMAGE_H, IMAGE_W, 3), dtype=np.uint8)
        Image.fromarray(pixels).save(folder / name, quality=70)
        photos.append(
            PhotoMeta(
                file=name,
                camera_transform=pose.flatten(order="F").tolist(),
                intrinsics=K.flatten(order="F").tolist(),
                image_width=IMAGE_W,
                image_height=IMAGE_H,
            )
        )
    metadata = ScanMetadata(
        created_at=datetime(2026, 10, 24, tzinfo=timezone.utc),
        created_by="test",
        device="synthetic",
        item_id=item_id,
        kind="baseline" if scan_id.startswith("BASE") else "check",
        model_file="model.usdz",
        model_sha256=f"{abs(hash(scan_id)):064x}"[-64:],
        scan_id=scan_id,
        photos=photos,
    )
    return LoadedScan(metadata, mesh, folder)


@pytest.fixture(scope="module")
def base_mesh():
    return _object()


@pytest.fixture
def base(tmp_path, base_mesh):
    return _scan(tmp_path / "base", base_mesh, _ring_poses(), scan_id="BASE")


def _compare(base, new) -> DiffResponse:
    result = compare(base, new, diff_id="test")
    # Every response must also survive a round trip through the published contract.
    return DiffResponse.model_validate_json(result.model_dump_json())


def test_mesh_is_dense_enough_to_compare(base_mesh):
    assert len(base_mesh.vertices) >= 5_000
    assert base_mesh.is_watertight


def test_identical_scans_are_accepted_with_no_regions(base, tmp_path, base_mesh):
    new = _scan(tmp_path / "new", base_mesh, _ring_poses(), scan_id="NEW")

    result = _compare(base, new)

    assert result.verdict == "accept", result.verdict_reason
    assert result.triage == "no_change"
    assert result.regions == []
    assert result.stats.max_change_mm < 1.0
    assert result.compared_fraction > 0.9
    assert result.stats.icp_rmse_mm < 0.5


def test_a_rigidly_moved_rescan_is_accepted(base, tmp_path, base_mesh):
    # The phone's frame differs per scan: rotate 40 degrees about a tilted axis and move 30 cm.
    transform = trimesh.transformations.rotation_matrix(np.radians(40), [0.3, 1.0, 0.2])
    transform[:3, 3] = [0.30, -0.05, 0.12]
    new = _scan(tmp_path / "new", base_mesh, _ring_poses(), scan_id="NEW", transform=transform)

    result = _compare(base, new)

    assert result.verdict == "accept", result.verdict_reason
    assert result.regions == []
    assert result.compared_fraction > 0.9


def test_sensor_noise_under_the_threshold_is_accepted(base, tmp_path):
    new = _scan(tmp_path / "new", _object(noise_mm=0.3, seed=7), _ring_poses(), scan_id="NEW")

    result = _compare(base, new)

    assert result.verdict == "accept", result.verdict_reason
    assert result.regions == []
    assert result.stats.max_change_mm < result.stats.threshold_mm * 1.5


def test_a_dent_is_found_where_it_is_and_about_as_deep(base, tmp_path):
    new = _scan(tmp_path / "new", _object(dent=True), _ring_poses(), scan_id="NEW")

    result = _compare(base, new)

    assert result.verdict != "accept", result.verdict_reason
    assert result.triage in ("damage", "inconclusive")
    dent = max(result.regions, key=lambda region: region.max_depth_mm)
    assert dent.kind in ("dent", "missing")
    assert dent.max_depth_mm == pytest.approx(DENT_DEPTH * 1000, abs=1.5)
    expected = _deform(np.array([[*DENT_AT, TOP]]))[0]
    assert np.linalg.norm(np.array(dent.centroid_m) - expected) < DENT_RADIUS
    assert all(np.array(dent.bbox_min_m) <= np.array(dent.bbox_max_m))


def test_a_missing_chunk_is_flagged(base, tmp_path):
    new = _scan(tmp_path / "new", _object(chunk=True), _ring_poses(), scan_id="NEW")

    result = _compare(base, new)

    assert result.verdict != "accept", result.verdict_reason
    deepest = max(result.regions, key=lambda region: region.max_depth_mm)
    assert deepest.max_depth_mm > 6.0
    corner = _deform(np.array([EXTENTS / 2]))[0]
    assert np.linalg.norm(np.array(deepest.centroid_m) - corner) < 0.03


def test_low_coverage_is_inconclusive_not_damage(base, tmp_path, base_mesh):
    # The check scan only saw one side of the item.
    poses = _ring_poses(azimuths_deg=(-20, 0, 20), elevations_deg=(0,), poles=False)
    new = _scan(tmp_path / "new", base_mesh, poses, scan_id="NEW")

    result = _compare(base, new)

    assert result.verdict == "inconclusive"
    assert result.triage == "inconclusive"
    assert result.compared_fraction < 0.5
    assert "captured in both scans" in result.verdict_reason
    assert result.regions == []
    assert result.uncovered_regions
    assert result.heatmap_url is None and result.stats is None


def test_different_item_ids_are_inconclusive(base, tmp_path, base_mesh):
    new = _scan(tmp_path / "new", base_mesh, _ring_poses(), item_id="other-001", scan_id="NEW")

    result = _compare(base, new)

    assert result.verdict == "inconclusive"
    assert "different items" in result.verdict_reason
    assert result.base_fingerprint and result.new_fingerprint


def test_a_different_sized_object_is_inconclusive(base, tmp_path, base_mesh):
    bigger = base_mesh.copy()
    bigger.apply_scale(1.5)
    new = _scan(tmp_path / "new", bigger, _ring_poses(), scan_id="NEW")

    result = _compare(base, new)

    assert result.verdict == "inconclusive"
    assert "Bounding boxes differ" in result.verdict_reason
