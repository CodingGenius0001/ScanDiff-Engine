"""Loading uploads."""

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from app.schemas import PhotoMeta, ScanMetadata
from scandiff.errors import ChecksumMismatch, UnsupportedFormat

logger = logging.getLogger(__name__)

_USD_SUFFIXES = {".usdz", ".usd", ".usda", ".usdc"}
_OBJ_HINT = "Ask the app to also send an OBJ."


@dataclass(frozen=True)
class LoadedMesh:
    """Triangle-or-ngon mesh in meters."""

    points: np.ndarray
    face_indices: np.ndarray
    face_counts: np.ndarray


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_model_sha256(path: Path, expected: str) -> None:
    actual = file_sha256(path)
    if actual.lower() != expected.lower():
        raise ChecksumMismatch(
            f"model sha256 mismatch for {path.name}: expected {expected}, got {actual}"
        )


def intrinsics_for_image(photo: PhotoMeta, image: Image.Image) -> np.ndarray:
    """Intrinsics for this JPEG.

    Missing `image_width` / `image_height` means the full camera frame is
    `(round(2*cx), round(2*cy))`. A smaller JPEG is a downscale of that frame:
    fx, fy, cx, and cy are scaled to match, and a warning is logged.
    """
    matrix = photo.K.copy()
    jpeg_w, jpeg_h = image.size
    frame_w = photo.image_width
    frame_h = photo.image_height
    if frame_w is None:
        frame_w = int(round(2 * float(matrix[0, 2])))
    if frame_h is None:
        frame_h = int(round(2 * float(matrix[1, 2])))

    scale_x = jpeg_w / frame_w if jpeg_w < frame_w else 1.0
    scale_y = jpeg_h / frame_h if jpeg_h < frame_h else 1.0
    if scale_x == 1.0 and scale_y == 1.0:
        return matrix

    logger.warning(
        "%s is %dx%d, smaller than the %dx%d camera frame; scaling intrinsics by %.4f, %.4f",
        photo.file,
        jpeg_w,
        jpeg_h,
        frame_w,
        frame_h,
        scale_x,
        scale_y,
    )
    matrix[0, 0] *= scale_x
    matrix[0, 2] *= scale_x
    matrix[1, 1] *= scale_y
    matrix[1, 2] *= scale_y
    return matrix


def load_jpeg_intrinsics(photo: PhotoMeta, path: Path) -> np.ndarray:
    with Image.open(path) as image:
        image.load()
        return intrinsics_for_image(photo, image)


def load_model(path: Path, metadata: ScanMetadata) -> LoadedMesh:
    """Check `model_sha256`, then read the USDZ into a mesh in meters."""
    verify_model_sha256(path, metadata.model_sha256)
    return load_mesh(path)


def load_mesh(path: Path) -> LoadedMesh:
    if path.suffix.lower() not in _USD_SUFFIXES:
        raise UnsupportedFormat(f"Cannot read {path.name}. {_OBJ_HINT}")
    try:
        from pxr import Gf, Usd, UsdGeom
    except ImportError as exc:
        raise UnsupportedFormat(f"Cannot read {path.name}. {_OBJ_HINT}") from exc
    try:
        return _read_usd_mesh(path, Usd, UsdGeom, Gf)
    except UnsupportedFormat:
        raise
    except Exception as exc:
        raise UnsupportedFormat(f"Cannot read {path.name}. {_OBJ_HINT}") from exc


def _read_usd_mesh(path: Path, Usd, UsdGeom, Gf) -> LoadedMesh:
    stage = Usd.Stage.Open(str(path))
    if not stage:
        raise UnsupportedFormat(f"Cannot read {path.name}. {_OBJ_HINT}")

    meters_per_unit = float(UsdGeom.GetStageMetersPerUnit(stage))
    cache = UsdGeom.XformCache()
    point_blocks: list[np.ndarray] = []
    counts: list[int] = []
    indices: list[int] = []
    offset = 0

    for prim in stage.Traverse():
        if not prim.IsA(UsdGeom.Mesh):
            continue
        mesh = UsdGeom.Mesh(prim)
        raw_points = mesh.GetPointsAttr().Get()
        raw_counts = mesh.GetFaceVertexCountsAttr().Get()
        raw_indices = mesh.GetFaceVertexIndicesAttr().Get()
        if not raw_points or not raw_counts or raw_indices is None:
            continue
        world = cache.GetLocalToWorldTransform(prim)
        transformed = [
            world.Transform(Gf.Vec3d(float(point[0]), float(point[1]), float(point[2])))
            for point in raw_points
        ]
        block = np.array([(point[0], point[1], point[2]) for point in transformed], dtype=float)
        block *= meters_per_unit
        point_blocks.append(block)
        counts.extend(int(count) for count in raw_counts)
        indices.extend(int(index) + offset for index in raw_indices)
        offset += len(block)

    if not point_blocks:
        raise UnsupportedFormat(f"Cannot read {path.name}. {_OBJ_HINT}")

    return LoadedMesh(
        points=np.vstack(point_blocks),
        face_indices=np.array(indices, dtype=np.int64),
        face_counts=np.array(counts, dtype=np.int64),
    )
