"""Upload metadata, camera parsing, and model loading."""

import hashlib
import logging
from pathlib import Path

import numpy as np
import pytest
from PIL import Image
from pydantic import ValidationError

from app.schemas import PhotoMeta, ScanMetadata
from scandiff.errors import ChecksumMismatch, UnsupportedFormat
from scandiff.io import intrinsics_for_image, load_mesh, load_model

FIXTURE = Path(__file__).parent / "fixtures" / "metadata.json"

IDENTITY_TRANSFORM = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
]
INTRINSICS = [100.0, 0.0, 0.0, 0.0, 80.0, 0.0, 50.0, 40.0, 1.0]


def test_sample_metadata_parses_cameras():
    metadata = ScanMetadata.model_validate_json(FIXTURE.read_text())

    assert metadata.kind == "baseline"
    assert metadata.units == "m"
    assert metadata.textures == []
    assert len(metadata.photos) == 9

    for photo in metadata.photos:
        transform = photo.T_cam_to_world
        assert transform.shape == (4, 4)
        assert photo.K.shape == (3, 3)
        assert photo.K[2, 2] == pytest.approx(1.0)

    position = metadata.photos[0].T_cam_to_world[:3, 3]
    assert position == pytest.approx([0.029, 0.199, -0.313], abs=1e-3)
    assert metadata.photos[0].K[0, 2] == pytest.approx(2037.4, abs=0.1)
    assert np.allclose(
        metadata.photos[0].K,
        [[2888.5503, 0.0, 2037.4142], [0.0, 2888.5503, 1511.8813], [0.0, 0.0, 1.0]],
    )


def test_transform_must_end_with_one_and_be_a_rotation():
    broken = IDENTITY_TRANSFORM.copy()
    broken[-1] = 0.0
    with pytest.raises(ValidationError):
        PhotoMeta(file="photo_01.jpg", camera_transform=broken, intrinsics=INTRINSICS)

    reflected = [
        -1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]
    photo = PhotoMeta(file="photo_01.jpg", camera_transform=reflected, intrinsics=INTRINSICS)
    with pytest.raises(ValueError, match="row-major"):
        _ = photo.T_cam_to_world


def test_jpeg_scale_and_hash_and_mesh(tmp_path, caplog):
    photo = PhotoMeta(file="photo_01.jpg", camera_transform=IDENTITY_TRANSFORM, intrinsics=INTRINSICS)
    image = Image.new("RGB", (25, 20))
    with caplog.at_level(logging.WARNING):
        scaled = intrinsics_for_image(photo, image)
    assert scaled[0, 0] == pytest.approx(25.0)
    assert scaled[0, 2] == pytest.approx(12.5)
    assert scaled[1, 1] == pytest.approx(20.0)
    assert scaled[1, 2] == pytest.approx(10.0)
    assert "scaling intrinsics" in caplog.text

    full = intrinsics_for_image(photo, Image.new("RGB", (100, 80)))
    assert full[0, 0] == pytest.approx(100.0)

    mesh_path = _write_usdz(tmp_path / "model.usdz")
    digest = hashlib.sha256(mesh_path.read_bytes()).hexdigest()
    metadata = ScanMetadata(
        created_at="2026-10-24T17:28:07Z",
        created_by="iPhone",
        device="iPhone18,2, iOS 27.0",
        item_id="coffe-maker-1",
        kind="pickup",
        model_file=mesh_path.name,
        model_sha256=digest,
        scan_id="scan",
        photos=[photo],
    )
    loaded = load_model(mesh_path, metadata)
    assert loaded.points.shape == (3, 3)
    assert loaded.points[0, 0] == pytest.approx(1.5)
    assert loaded.face_counts.tolist() == [3]
    assert loaded.face_indices.tolist() == [0, 1, 2]

    metadata.model_sha256 = "0" * 64
    with pytest.raises(ChecksumMismatch):
        load_model(mesh_path, metadata)

    obj = tmp_path / "model.obj"
    obj.write_text("o empty\n")
    with pytest.raises(UnsupportedFormat, match="OBJ"):
        load_mesh(obj)


def _write_usdz(path: Path) -> Path:
    from pxr import Gf, Usd, UsdGeom, UsdUtils

    usda = path.with_suffix(".usda")
    stage = Usd.Stage.CreateNew(str(usda))
    UsdGeom.SetStageMetersPerUnit(stage, 0.01)
    world = UsdGeom.Xform.Define(stage, "/World")
    world.AddTranslateOp().Set(Gf.Vec3d(50, 0, 0))
    mesh = UsdGeom.Mesh.Define(stage, "/World/Mesh")
    mesh.CreatePointsAttr([(100, 0, 0), (200, 0, 0), (100, 100, 0)])
    mesh.CreateFaceVertexCountsAttr([3])
    mesh.CreateFaceVertexIndicesAttr([0, 1, 2])
    mesh.CreateExtentAttr([(-100, 0, 0), (100, 100, 0)])
    stage.SetDefaultPrim(world.GetPrim())
    stage.GetRootLayer().Save()
    UsdUtils.CreateNewUsdzPackage(str(usda), str(path))
    return path
