"""Projecting into key photos, choosing a view, and cropping."""

import io

import numpy as np
import pytest
import trimesh
from PIL import Image, ImageDraw

from app.schemas import PhotoMeta
from scandiff import config
from scandiff.photos import Photo, ScanView, best_view, crop, crop_pair, load_photo, project, upload_crops
from scandiff.regions import RegionExtent, RegionGeom

WIDTH, HEIGHT = 640, 480
K = np.array([[1000.0, 0.0, 320.0], [0.0, 1000.0, 240.0], [0.0, 0.0, 1.0]])


def _look_at(eye, target=(0.0, 0.0, 0.0), up=(0.0, 1.0, 0.0)) -> np.ndarray:
    """ARKit camera-to-world pose at `eye`, looking down its -Z at `target`, with its +Y toward `up`."""
    eye = np.asarray(eye, dtype=float)
    back = eye - target
    back /= np.linalg.norm(back)
    right = np.cross(up, back)
    right /= np.linalg.norm(right)
    pose = np.eye(4)
    pose[:3, :3] = np.column_stack([right, np.cross(back, right), back])
    pose[:3, 3] = eye
    return pose


def _photo_meta(pose: np.ndarray, file: str = "photo_01.jpg") -> PhotoMeta:
    """What the app sends: flat column-major dumps of the pose and intrinsics."""
    return PhotoMeta(
        file=file,
        camera_transform=pose.T.flatten().tolist(),
        intrinsics=K.T.flatten().tolist(),
        image_width=WIDTH,
        image_height=HEIGHT,
    )


def _photo(tmp_path, pose, image=None, file="photo.jpg") -> Photo:
    (image or Image.new("RGB", (WIDTH, HEIGHT), "gray")).save(tmp_path / file)
    return load_photo(_photo_meta(pose, file), tmp_path)


def test_point_projects_to_the_expected_pixel(tmp_path):
    photo = _photo(tmp_path, _look_at([0.0, 0.0, 1.0]))

    # 1 m in front of the camera: 0.1 m right is 100 px right, 0.05 m up is 50 px up.
    assert project(np.array([0.1, 0.05, 0.0]), photo) == pytest.approx((420.0, 190.0))
    assert project(np.array([0.0, 0.0, 2.0]), photo) is None  # behind the camera
    assert project(np.array([0.5, 0.0, 0.0]), photo) is None  # off the right edge


def test_side_camera_and_downscaled_jpeg(tmp_path):
    # Looking down -X from +X: the camera's right is world -Z.
    side = _photo(tmp_path, _look_at([1.0, 0.0, 0.0]))
    assert project(np.array([0.0, 0.05, 0.1]), side) == pytest.approx((220.0, 190.0))

    # A half-size JPEG of the same frame: every pixel coordinate halves.
    Image.new("RGB", (WIDTH // 2, HEIGHT // 2)).save(tmp_path / "small.jpg")
    small = load_photo(_photo_meta(_look_at([1.0, 0.0, 0.0]), "small.jpg"), tmp_path)
    assert (small.width, small.height) == (WIDTH // 2, HEIGHT // 2)
    assert project(np.array([0.0, 0.05, 0.1]), small) == pytest.approx((110.0, 95.0))


def _region(anchor, normal, half=0.005) -> RegionGeom:
    anchor = np.asarray(anchor, dtype=float)
    return RegionGeom(
        kind="dent",
        indices=np.arange(1),
        area_cm2=1.0,
        max_depth_mm=4.0,
        mean_depth_mm=3.5,
        extent=RegionExtent(anchor, half, anchor - half, anchor + half),
        point_count=1,
        sharpness=0.5,
        spread=1.0,
        aspect_ratio=1.0,
        anchor_m=anchor,
        normal=np.asarray(normal, dtype=float),
    )


def test_best_view_is_centered_facing_and_unblocked(tmp_path):
    cube = trimesh.creation.box(extents=[0.05, 0.05, 0.05])
    region = _region([0.0, 0.0, 0.025], [0.0, 0.0, 1.0])
    front = _photo(tmp_path, _look_at([0.0, 0.0, 0.5]), file="front.jpg")
    off_center = _photo(tmp_path, _look_at([0.1, 0.0, 0.5], target=(0.1, 0.0, 0.0)), file="off.jpg")
    behind = _photo(tmp_path, _look_at([0.0, 0.0, -0.5]), file="behind.jpg")
    grazing = _photo(tmp_path, _look_at([0.5, 0.0, 0.03], target=(0.0, 0.0, 0.025)), file="grazing.jpg")

    assert best_view(region, ScanView([behind, grazing, off_center, front], cube)) is front
    assert best_view(region, ScanView([behind, grazing, off_center], cube)) is off_center
    assert best_view(region, ScanView([behind, grazing], cube)) is None

    # A plate 10 cm in front of the face blocks the front camera.
    plate = trimesh.creation.box(extents=[0.2, 0.2, 0.002])
    plate.apply_translation([0.0, 0.0, 0.125])
    assert best_view(region, ScanView([front], trimesh.util.concatenate([cube, plate]))) is None


def test_best_view_maps_the_region_into_the_new_scans_frame(tmp_path):
    cube = trimesh.creation.box(extents=[0.05, 0.05, 0.05])
    front = _photo(tmp_path, _look_at([0.0, 0.0, 0.5]), file="front.jpg")
    # The new scan sits 1 m along +X in its own frame; to_base moves it back onto the base.
    shifted = cube.copy()
    shifted.apply_translation([1.0, 0.0, 0.0])
    moved_front = _photo(tmp_path, _look_at([1.0, 0.0, 0.5], target=(1.0, 0.0, 0.0)), file="moved.jpg")
    to_base = np.eye(4)
    to_base[0, 3] = -1.0
    region = _region([0.0, 0.0, 0.025], [0.0, 0.0, 1.0])

    assert best_view(region, ScanView([front, moved_front], shifted, to_base)) is moved_front


def test_crop_is_square_centered_and_upright(tmp_path):
    region = _region([0.0, 0.0, 0.025], [0.0, 0.0, 1.0])
    # Rolled a quarter turn, like a phone held portrait: world up points left in the raw image.
    pose = _look_at([0.0, 0.0, 0.5], up=(1.0, 0.0, 0.0))
    probe = Photo("probe.jpg", tmp_path / "probe.jpg", pose, K, WIDTH, HEIGHT)
    above = project(np.array([0.0, 0.01, 0.025]), probe)
    below = project(np.array([0.0, -0.01, 0.025]), probe)
    assert above[0] < below[0]

    image = Image.new("RGB", (WIDTH, HEIGHT), "gray")
    draw = ImageDraw.Draw(image)
    for (u, v), color in ((above, "green"), (below, "blue")):
        draw.ellipse([u - 8, v - 8, u + 8, v + 8], fill=color)
    photo = _photo(tmp_path, pose, image)

    result = crop(region, photo, ScanView([photo], trimesh.creation.box(extents=[0.05] * 3)))

    assert result.size == (config.CROP_SIZE_PX, config.CROP_SIZE_PX)
    pixels = np.asarray(result).astype(int)
    center = config.CROP_SIZE_PX // 2
    column = pixels[:, center]
    green_rows = np.flatnonzero((column[:, 1] > 100) & (column[:, 0] < 80) & (column[:, 2] < 80))
    blue_rows = np.flatnonzero((column[:, 2] > 150) & (column[:, 0] < 80))
    # Both marks sit on the center column, green (world up) above blue.
    assert len(green_rows) and len(blue_rows)
    assert green_rows.mean() < center < blue_rows.mean()


def test_crop_pairs_upload_and_missing_views_stay_empty(tmp_path, monkeypatch):
    uploads = {}

    def fake_upload(data: bytes, path: str) -> str:
        uploads[path] = data
        return f"https://example.test/{path}"

    monkeypatch.setattr("scandiff.photos.upload_file", fake_upload)
    cube = trimesh.creation.box(extents=[0.05] * 3)
    front = _photo(tmp_path, _look_at([0.0, 0.0, 0.5]), file="front.jpg")
    seen = _region([0.0, 0.0, 0.025], [0.0, 0.0, 1.0])
    underside = _region([0.0, -0.025, 0.0], [0.0, -1.0, 0.0])

    view = ScanView([front], cube)
    first, second = (
        upload_crops(region, crop_pair(region, view, view), "d1", number)
        for number, region in enumerate([seen, underside], start=1)
    )

    assert first.before_crop_url == "https://example.test/diffs/d1/regions/1_before.jpg"
    assert first.after_crop_url == "https://example.test/diffs/d1/regions/1_after.jpg"
    assert second.before_crop_url is None and second.after_crop_url is None
    assert sorted(uploads) == ["diffs/d1/regions/1_after.jpg", "diffs/d1/regions/1_before.jpg"]
    assert Image.open(io.BytesIO(uploads["diffs/d1/regions/1_before.jpg"])).size == (config.CROP_SIZE_PX,) * 2
