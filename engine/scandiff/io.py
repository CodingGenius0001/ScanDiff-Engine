"""Loading uploads."""

import hashlib
import logging
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

from app.schemas import PhotoMeta, ScanMetadata
from scandiff import config
from scandiff.errors import ChecksumMismatch, ScanTooSparse, UnsupportedFormat

logger = logging.getLogger(__name__)

_USD_SUFFIXES = {".usdz", ".usd", ".usda", ".usdc"}
_TRIMESH_SUFFIXES = {".obj", ".ply", ".glb"}
_OBJ_HINT = "Ask the app to also send an OBJ."


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


def load_model(path: Path, metadata: ScanMetadata) -> trimesh.Trimesh:
    """Check `model_sha256`, then read the model into one mesh in meters."""
    verify_model_sha256(path, metadata.model_sha256)
    return load_mesh(path)


def load_mesh(path: str | Path) -> trimesh.Trimesh:
    """Read an OBJ, PLY, GLB, or USD(Z) file as one mesh in meters.

    Every geometry in the file is merged into the one mesh. OBJ, PLY, and GLB
    are taken to be meters already.
    """
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in _USD_SUFFIXES:
        mesh = read_usd_mesh(path)
    elif suffix in _TRIMESH_SUFFIXES:
        try:
            mesh = trimesh.load(path, force="mesh")
        except Exception as exc:
            raise UnsupportedFormat(f"Cannot read {path.name}.") from exc
    else:
        raise UnsupportedFormat(
            f"Cannot read {path.name}: supported formats are OBJ, PLY, GLB, and USDZ."
        )
    _check_density(mesh, path)
    return mesh


def _check_density(mesh: trimesh.Trimesh, path: Path) -> None:
    if len(mesh.vertices) < config.MIN_MESH_VERTICES:
        raise ScanTooSparse(
            f"{path.name} has {len(mesh.vertices)} vertices; "
            f"at least {config.MIN_MESH_VERTICES} are needed."
        )
    if mesh.area < config.MIN_SURFACE_AREA_M2:
        raise ScanTooSparse(
            f"{path.name} has {mesh.area * 1e4:.2f} cm² of surface; "
            f"at least {config.MIN_SURFACE_AREA_M2 * 1e4:.2f} cm² is needed."
        )


def read_usd_mesh(path: Path) -> trimesh.Trimesh:
    """Read every mesh prim in a USD(Z) file into one triangle mesh in meters."""
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


def _read_usd_mesh(path: Path, Usd, UsdGeom, Gf) -> trimesh.Trimesh:
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

    faces = _triangulate(np.array(counts, dtype=np.int64), np.array(indices, dtype=np.int64))
    return trimesh.Trimesh(vertices=np.vstack(point_blocks), faces=faces, process=False)


def _triangulate(counts: np.ndarray, indices: np.ndarray) -> np.ndarray:
    """Fan-triangulate USD faces. Faces with fewer than 3 corners are dropped."""
    starts = np.cumsum(counts) - counts
    per_face = np.clip(counts - 2, 0, None)
    first = np.repeat(starts, per_face)
    step = np.arange(per_face.sum()) - np.repeat(np.cumsum(per_face) - per_face, per_face)
    return np.stack(
        [indices[first], indices[first + step + 1], indices[first + step + 2]], axis=1
    )
