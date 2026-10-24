"""Find a region in a scan's key photos and crop it."""

import io
from dataclasses import dataclass, field, replace
from pathlib import Path

import numpy as np
import open3d as o3d
import trimesh
from PIL import Image, ImageOps

from app.schemas import PhotoMeta, ScanMetadata
from scandiff import config
from scandiff.io import intrinsics_for_image
from scandiff.preprocess import MM
from scandiff.regions import RegionGeom
from scandiff.storage import upload_file

# ARKit cameras look down -Z with +Y up; OpenCV projection wants +Z forward and +Y down.
ARKIT_TO_OPENCV = np.diag([1.0, -1.0, -1.0])


@dataclass(frozen=True)
class Photo:
    """One key photo, ready to project into.

    `T_cam_to_world` is in the scan's own frame, meters. `K` is scaled to the
    JPEG as loaded, which is `width` x `height` pixels.
    """

    file: str
    path: Path
    T_cam_to_world: np.ndarray
    K: np.ndarray
    width: int
    height: int
    # Whether the JPEG's EXIF rotation is applied when the image is opened.
    exif_transposed: bool = False

    def open(self) -> Image.Image:
        image = Image.open(self.path)
        image.load()
        return ImageOps.exif_transpose(image) if self.exif_transposed else image

    @property
    def center_world(self) -> np.ndarray:
        return self.T_cam_to_world[:3, 3]


def load_photo(photo: PhotoMeta, scan_dir: Path) -> Photo:
    """`photo` with intrinsics fit to its JPEG.

    The EXIF rotation is applied only when the metadata's frame size matches
    the rotated image; otherwise the raw pixel grid is used, which is what the
    app's intrinsics describe.
    """
    path = scan_dir / photo.file
    with Image.open(path) as raw:
        raw.load()
        image, transposed = raw, False
        rotated = ImageOps.exif_transpose(raw)
        if rotated.size != raw.size and rotated.size == (photo.image_width, photo.image_height):
            image, transposed = rotated, True
        K = intrinsics_for_image(photo, image)
        width, height = image.size
    return Photo(photo.file, path, photo.T_cam_to_world, K, width, height, transposed)


def load_photos(scan_dir: Path, metadata: ScanMetadata) -> list[Photo]:
    return [load_photo(photo, scan_dir) for photo in metadata.photos]


def project_points(points_world: np.ndarray, photo: Photo) -> tuple[np.ndarray, np.ndarray]:
    """Pixel (u, v) of each point, and whether it is in front of the camera and inside the JPEG."""
    uv, in_front = _project(points_world, photo)
    u, v = uv.T
    inside = in_front & (u >= 0) & (u < photo.width) & (v >= 0) & (v < photo.height)
    return uv, inside


def project(point_world: np.ndarray, photo: Photo) -> tuple[float, float] | None:
    """Pixel (u, v) of one point in the scan's frame, or None if it is behind the camera or off the JPEG."""
    uv, inside = project_points(point_world, photo)
    if not inside[0]:
        return None
    return float(uv[0, 0]), float(uv[0, 1])


def _project(points_world: np.ndarray, photo: Photo) -> tuple[np.ndarray, np.ndarray]:
    """Pixel (u, v) of each point, wherever it lands, and whether it is in front of the camera."""
    points = np.atleast_2d(np.asarray(points_world, dtype=float))
    homogeneous = np.column_stack([points, np.ones(len(points))])
    p_cam = (np.linalg.inv(photo.T_cam_to_world) @ homogeneous.T)[:3]
    x, y, z = ARKIT_TO_OPENCV @ p_cam
    in_front = z > 0
    safe_z = np.where(in_front, z, 1.0)
    u = photo.K[0, 0] * x / safe_z + photo.K[0, 2]
    v = photo.K[1, 1] * y / safe_z + photo.K[1, 2]
    return np.column_stack([u, v]), in_front


@dataclass
class ScanView:
    """One scan's key photos and mesh, both in the scan's own frame.

    `to_base` maps that frame into the base scan's frame, where regions are
    measured: the identity for the base scan, `AlignResult.transform` for the new one.
    """

    photos: list[Photo]
    mesh: trimesh.Trimesh
    to_base: np.ndarray = field(default_factory=lambda: np.eye(4))
    _scene: o3d.t.geometry.RaycastingScene = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._scene = o3d.t.geometry.RaycastingScene()
        self._scene.add_triangles(
            np.asarray(self.mesh.vertices, dtype=np.float32), np.asarray(self.mesh.faces, dtype=np.uint32)
        )

    def from_base(self, points: np.ndarray) -> np.ndarray:
        """Points from the base frame into this scan's frame."""
        homogeneous = np.column_stack([np.atleast_2d(points), np.ones(len(np.atleast_2d(points)))])
        return (np.linalg.inv(self.to_base) @ homogeneous.T).T[:, :3]

    def first_hit(self, origin: np.ndarray, target: np.ndarray) -> float:
        """Distance from `origin` toward `target` to the first mesh surface; inf if none."""
        direction = (target - origin) / np.linalg.norm(target - origin)
        rays = o3d.core.Tensor(np.concatenate([origin, direction])[None].astype(np.float32))
        return float(self._scene.cast_rays(rays)["t_hit"].numpy()[0])


def best_view(region: RegionGeom, scan: ScanView) -> Photo | None:
    """The photo that shows the region best, or None if none does.

    The region's anchor must project into the photo, its normal must face the
    camera (cosine at least PHOTO_MIN_FACING), and the mesh must not block the
    line of sight. Among those, the photo with the anchor nearest its center
    wins. A hit counts as blocking only if it is more than
    OCCLUSION_TOLERANCE_MM plus the region's depth in front of the anchor: in
    the other scan, the anchor sits up to that depth under its surface.
    """
    anchor = scan.from_base(region.anchor_m)[0]
    normal = np.linalg.inv(scan.to_base)[:3, :3] @ region.normal
    tolerance = (config.OCCLUSION_TOLERANCE_MM + region.max_depth_mm) * MM
    best, best_offset = None, np.inf
    for photo in scan.photos:
        pixel = project(anchor, photo)
        if pixel is None:
            continue
        to_camera = photo.center_world - anchor
        distance = float(np.linalg.norm(to_camera))
        if normal @ to_camera / distance < config.PHOTO_MIN_FACING:
            continue
        if scan.first_hit(photo.center_world, anchor) < distance - tolerance:
            continue
        offset = np.hypot(pixel[0] - photo.width / 2, pixel[1] - photo.height / 2)
        if offset < best_offset:
            best, best_offset = photo, offset
    return best


def crop(region: RegionGeom, photo: Photo, scan: ScanView) -> Image.Image:
    """CROP_SIZE_PX square of the photo around the region, turned so world up is up.

    The region's bbox corners are projected, and the square around them is
    padded by CROP_PADDING, at least CROP_MIN_PX across, and kept inside the
    photo. Photos are stored in raw sensor orientation, usually sideways, so
    the crop is turned by quarter turns until the world's +Y points up.
    """
    lo, hi = region.extent.bbox_min_m, region.extent.bbox_max_m
    corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
    uv, in_front = _project(scan.from_base(corners), photo)
    if not in_front.any():
        uv = _project(scan.from_base(region.anchor_m), photo)[0]
    else:
        uv = uv[in_front]
    center = (uv.min(axis=0) + uv.max(axis=0)) / 2
    side = max(np.ptp(uv, axis=0).max() * (1 + config.CROP_PADDING), config.CROP_MIN_PX)
    side = min(side, photo.width, photo.height)
    left = np.clip(center[0] - side / 2, 0, photo.width - side)
    top = np.clip(center[1] - side / 2, 0, photo.height - side)
    image = photo.open().convert("RGB").crop((round(left), round(top), round(left + side), round(top + side)))
    turn = _upright_turn(scan.from_base(region.anchor_m)[0], photo)
    if turn is not None:
        image = image.transpose(turn)
    return image.resize((config.CROP_SIZE_PX, config.CROP_SIZE_PX), Image.Resampling.LANCZOS)


def _upright_turn(point: np.ndarray, photo: Photo) -> Image.Transpose | None:
    """The quarter turn that makes the world's +Y point up in the image at `point`, or None if it already does."""
    ends = _project(np.array([point, point + [0.0, config.CROP_UP_PROBE_MM * MM, 0.0]]), photo)[0]
    du, dv = ends[1] - ends[0]
    if abs(du) > abs(dv):
        # Up points left: turn the image clockwise. Right: counterclockwise.
        return Image.Transpose.ROTATE_270 if du < 0 else Image.Transpose.ROTATE_90
    return Image.Transpose.ROTATE_180 if dv > 0 else None


CropPair = tuple[Image.Image | None, Image.Image | None]


def crop_pair(region: RegionGeom, base: ScanView, new: ScanView) -> CropPair:
    """(before, after): the region cropped from each scan's best view, or None where no photo shows it."""
    pair = []
    for scan in (base, new):
        photo = best_view(region, scan)
        pair.append(None if photo is None else crop(region, photo, scan))
    return pair[0], pair[1]


def upload_crops(region: RegionGeom, pair: CropPair, diff_id: str, number: int) -> RegionGeom:
    """`region` with its crop pair uploaded as JPEGs and the URLs set. A missing crop keeps a None URL."""
    urls = {}
    for side, image in zip(("before", "after"), pair):
        if image is None:
            continue
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=config.CROP_JPEG_QUALITY)
        urls[f"{side}_crop_url"] = upload_file(buffer.getvalue(), f"diffs/{diff_id}/regions/{number}_{side}.jpg")
    return replace(region, **urls)
