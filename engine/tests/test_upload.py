"""Upload metadata, camera parsing, and model loading."""

import hashlib
import logging
from pathlib import Path

import numpy as np
import pytest
import trimesh
from PIL import Image
from pydantic import ValidationError

from app.schemas import PhotoMeta, ScanMetadata
from scandiff.errors import ChecksumMismatch, ScanTooSparse, UnsupportedFormat
from scandiff.io import intrinsics_for_image, load_mesh, load_model, read_usd_mesh

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
    photo = PhotoMeta(
        file="photo_01.jpg",
        camera_transform=IDENTITY_TRANSFORM,
        intrinsics=INTRINSICS,
        image_width=100,
        image_height=80,
    )
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

    # Like the first real scan: a full-frame 4032x3024 JPEG, no frame size, cx off center.
    off_center = [2890.4, 0.0, 0.0, 0.0, 2890.4, 0.0, 2039.1, 1508.9, 1.0]
    legacy = PhotoMeta(file="photo_02.jpg", camera_transform=IDENTITY_TRANSFORM, intrinsics=off_center)
    caplog.clear()
    with caplog.at_level(logging.WARNING):
        unscaled = intrinsics_for_image(legacy, Image.new("RGB", (4032, 3024)))
    assert np.allclose(unscaled, legacy.K)
    assert "no image_width/image_height" in caplog.text

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
    loaded = read_usd_mesh(mesh_path)
    assert loaded.vertices.shape == (3, 3)
    assert loaded.vertices[0, 0] == pytest.approx(1.5)
    assert loaded.faces.tolist() == [[0, 1, 2]]

    with pytest.raises(ScanTooSparse, match="vertices"):
        load_model(mesh_path, metadata)

    metadata.model_sha256 = "0" * 64
    with pytest.raises(ChecksumMismatch):
        load_model(mesh_path, metadata)

    obj = tmp_path / "model.obj"
    obj.write_text("o empty\n")
    with pytest.raises(ScanTooSparse):
        load_mesh(obj)

    with pytest.raises(UnsupportedFormat, match="supported formats"):
        load_mesh(tmp_path / "model.stl")


def test_usdz_quads_are_triangulated(tmp_path):
    side = 80
    grid = np.stack(np.meshgrid(np.arange(side), np.arange(side), indexing="ij"), axis=-1)
    points = [(float(x), float(y), 0.0) for x, y in grid.reshape(-1, 2)]
    corner = (np.arange(side - 1)[:, None] * side + np.arange(side - 1)[None, :]).ravel()
    quads = np.stack([corner, corner + side, corner + side + 1, corner + 1], axis=1)
    path = _write_usdz(
        tmp_path / "grid.usdz",
        points=points,
        counts=[4] * len(quads),
        indices=quads.ravel().tolist(),
        meters_per_unit=0.002,
        offset=(0, 0, 0),
    )

    mesh = load_mesh(path)

    assert len(mesh.vertices) == side * side
    assert len(mesh.faces) == 2 * len(quads)
    assert mesh.area == pytest.approx((0.002 * (side - 1)) ** 2)


def test_usdz_z_up_becomes_y_up(tmp_path):
    y_up = read_usd_mesh(_write_usdz(tmp_path / "y.usdz"))
    z_up = read_usd_mesh(_write_usdz(tmp_path / "z.usdz", points=((0, 0, 100), (100, 0, 100), (0, 100, 100)), offset=(0, 0, 0), up_axis="Z"))

    assert y_up.vertices[0].tolist() == pytest.approx([1.5, 0.0, 0.0])
    assert np.allclose(z_up.vertices, [[0, 1, 0], [1, 1, 0], [0, 1, -1]])


@pytest.mark.parametrize("suffix", [".obj", ".ply", ".glb"])
def test_load_mesh_merges_scene_geometry(tmp_path, suffix):
    sphere = trimesh.creation.icosphere(subdivisions=5, radius=0.05)
    box = trimesh.creation.box(extents=[0.02, 0.02, 0.02])
    box.apply_translation([0.1, 0, 0])
    scene = trimesh.Scene()
    scene.add_geometry(sphere, geom_name="body")
    scene.add_geometry(box, geom_name="handle")
    path = tmp_path / f"scan{suffix}"
    scene.export(path)

    mesh = load_mesh(path)

    assert isinstance(mesh, trimesh.Trimesh)
    assert mesh.area == pytest.approx(sphere.area + box.area, rel=1e-3)


def test_load_mesh_rejects_tiny_surface(tmp_path):
    sphere = trimesh.creation.icosphere(subdivisions=5, radius=0.002)
    path = tmp_path / "speck.ply"
    sphere.export(path)

    with pytest.raises(ScanTooSparse, match="surface"):
        load_mesh(path)


def _write_usdz(
    path: Path,
    points=((100, 0, 0), (200, 0, 0), (100, 100, 0)),
    counts=(3,),
    indices=(0, 1, 2),
    meters_per_unit=0.01,
    offset=(50, 0, 0),
    up_axis="Y",
) -> Path:
    from pxr import Gf, Usd, UsdGeom, UsdUtils

    usda = path.with_suffix(".usda")
    stage = Usd.Stage.CreateNew(str(usda))
    UsdGeom.SetStageMetersPerUnit(stage, meters_per_unit)
    UsdGeom.SetStageUpAxis(stage, up_axis)
    world = UsdGeom.Xform.Define(stage, "/World")
    world.AddTranslateOp().Set(Gf.Vec3d(*offset))
    mesh = UsdGeom.Mesh.Define(stage, "/World/Mesh")
    mesh.CreatePointsAttr(list(points))
    mesh.CreateFaceVertexCountsAttr(list(counts))
    mesh.CreateFaceVertexIndicesAttr(list(indices))
    stage.SetDefaultPrim(world.GetPrim())
    stage.GetRootLayer().Save()
    UsdUtils.CreateNewUsdzPackage(str(usda), str(path))
    return path
