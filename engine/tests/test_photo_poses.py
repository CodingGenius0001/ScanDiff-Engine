"""Camera poses and intrinsics in metadata.json: what the app really sends, and malformed dumps."""

import hashlib
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
import trimesh
from PIL import Image
from scipy.spatial.transform import Rotation

from app import pipeline, scan_models
from app.main import app
from app.schemas import PhotoMeta, ScanMetadata
from scandiff import storage

K = np.array([[2888.0, 0, 2037.0], [0, 2888.0, 1512.0], [0, 0, 1]])


def _pose(rotvec=(0.3, -1.1, 0.4), translation=(0.03, 0.2, -0.31)):
    pose = np.eye(4)
    pose[:3, :3] = Rotation.from_rotvec(rotvec).as_matrix()
    pose[:3, 3] = translation
    return pose


def _photo(name="photo_01.jpg", transform=None, intrinsics=None):
    return {
        "file": name,
        "camera_transform": (_pose() if transform is None else transform).flatten(order="F").tolist(),
        "intrinsics": (K if intrinsics is None else intrinsics).flatten(order="F").tolist(),
    }


def _metadata(photos):
    return {
        "created_at": "2026-10-24T00:00:00Z",
        "created_by": "u",
        "device": "iPhone18,2",
        "item_id": "mug-002",
        "kind": "check",
        "model_file": "model.usdz",
        "model_sha256": "00" * 32,
        "scan_id": "SCAN-1",
        "photos": photos,
    }


def test_unsolved_key_photos_are_dropped_not_fatal():
    # ScanBundle.swift writes 16 zeros for a key photo whose pose reconstruction did not solve.
    unsolved = {"file": "photo_02.jpg", "camera_transform": [0.0] * 16, "intrinsics": K.flatten(order="F").tolist()}

    metadata = ScanMetadata.model_validate(_metadata([_photo(), unsolved, _photo("photo_03.jpg")]))

    assert [photo.file for photo in metadata.photos] == ["photo_01.jpg", "photo_03.jpg"]


def test_a_scan_whose_poses_all_failed_parses_with_no_photos():
    unsolved = {"file": "photo_01.jpg", "camera_transform": [0.0] * 16, "intrinsics": K.flatten(order="F").tolist()}

    assert ScanMetadata.model_validate(_metadata([unsolved])).photos == []


def test_row_major_camera_transforms_are_caught():
    # Parsed column-major, a row-major dump's 3x3 is R transposed, still a rotation; the bottom row gives it away.
    photo = PhotoMeta.model_validate(_photo() | {"camera_transform": _pose().flatten(order="C").tolist()})

    with pytest.raises(ValueError, match="row-major"):
        _ = photo.T_cam_to_world


def test_row_major_intrinsics_are_caught():
    photo = PhotoMeta.model_validate(_photo() | {"intrinsics": K.flatten(order="C").tolist()})

    with pytest.raises(ValueError, match="row-major"):
        _ = photo.K


def test_a_scaled_rotation_is_caught():
    scaled = _pose()
    scaled[:3, :3] *= 1.1
    photo = PhotoMeta.model_validate(_photo(transform=scaled))

    with pytest.raises(ValueError, match="rotation"):
        _ = photo.T_cam_to_world


def test_a_malformed_pose_makes_the_diff_inconclusive_not_a_server_error(tmp_path, monkeypatch):
    scaled = _pose()
    scaled[:3, :3] *= 1.1
    folder = tmp_path / "mug-002" / "SCAN-1"
    folder.mkdir(parents=True)
    mesh = trimesh.creation.box(extents=[0.12, 0.08, 0.06]).subdivide_to_size(max_edge=0.003)
    mesh.export(folder / "model.obj")
    Image.new("RGB", (64, 48), "gray").save(folder / "photo_01.jpg")
    raw = _metadata([_photo(transform=scaled)]) | {
        "model_file": "model.obj",
        "model_sha256": hashlib.sha256((folder / "model.obj").read_bytes()).hexdigest(),
    }
    (folder / "metadata.json").write_text(json.dumps(raw))
    monkeypatch.setattr(storage, "STATIC_DIR", tmp_path / "static")
    monkeypatch.setattr(scan_models, "GLB_CACHE_DIR", tmp_path / "glb")

    def fetch_scan(scan_id):
        return folder / "model.obj", storage.read_metadata(folder / "metadata.json")

    monkeypatch.setattr(storage, "fetch_scan", fetch_scan)
    monkeypatch.setattr("app.main.run_diff", pipeline.run_diff)
    client = TestClient(app, raise_server_exceptions=False)
    session = client.get("/health").json()["session_id"]

    response = client.post("/diff", json={"base_id": "a", "new_id": "b"}, headers={"X-Session-ID": session})

    assert response.status_code == 200
    assert response.json()["verdict"] == "inconclusive"
    assert "rotation" in response.json()["verdict_reason"]


def test_real_capture_still_parses():
    from pathlib import Path

    fixture = Path(__file__).parent / "fixtures" / "metadata.json"
    metadata = ScanMetadata.model_validate_json(fixture.read_text())

    assert len(metadata.photos) == 9
    assert all(np.allclose(photo.T_cam_to_world[3], [0, 0, 0, 1]) for photo in metadata.photos)


@pytest.mark.parametrize("damage", ["missing", "corrupt"])
def test_a_missing_or_corrupt_key_photo_is_inconclusive_not_a_server_error(tmp_path, monkeypatch, damage):
    folder = tmp_path / "SCAN-1"
    folder.mkdir()
    mesh = trimesh.creation.box(extents=[0.12, 0.08, 0.06]).subdivide_to_size(max_edge=0.003)
    if damage == "corrupt":
        (folder / "photo_01.jpg").write_bytes(b"not a jpeg")
    metadata = ScanMetadata.model_validate(_metadata([_photo()]))
    scan = pipeline.LoadedScan(metadata, mesh, folder)
    monkeypatch.setattr(storage, "STATIC_DIR", tmp_path / "static")

    result = pipeline.compare(scan, scan, diff_id="d")

    assert result.verdict == "inconclusive"
    assert "photo_01.jpg" in result.verdict_reason
