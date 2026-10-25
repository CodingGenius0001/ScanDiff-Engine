"""A single scan's model as GLB, for viewing a scan before there is a second one to compare."""

import logging
from pathlib import Path

import trimesh

from app.schemas import ScanMetadata
from scandiff import storage
from scandiff.errors import UploadFailed
from scandiff.io import load_mesh

logger = logging.getLogger(__name__)

GLB_CACHE_DIR = storage.DATA_DIR.parent / "glb"
# Part of each cached file's name. Bump it when the conversion changes, so old files are not served.
GLB_FORMAT_VERSION = 1
# Name of the converted model in the scan's own folder in the scans bucket.
STORED_GLB_NAME = "model.glb"


def scan_model_glb(scan_id: str) -> Path:
    """GLB of the scan's model in meters, +Y up, in the scan's own frame.

    The first request for a model also stores the GLB next to the scan's
    original files in Supabase. A failed upload is logged and the GLB is still served.
    """
    model, metadata = storage.fetch_model(scan_id)
    path = converted_glb(model, metadata)
    try:
        publish_glb(path, metadata)
    except UploadFailed as exc:
        logger.warning("could not store %s in Supabase: %s", path.name, exc)
    return path


def converted_glb(model: Path | None, metadata: ScanMetadata, mesh: trimesh.Trimesh | None = None) -> Path:
    """The model as GLB, cached by its sha256, so a scan is converted once and a re-uploaded model gets a new file.

    Pass `mesh` instead of `model` when the model is already loaded.
    """
    path = GLB_CACHE_DIR / f"{metadata.model_sha256.lower()}-v{GLB_FORMAT_VERSION}.glb"
    if not path.is_file():
        mesh = mesh if mesh is not None else load_mesh(model, require_density=False)
        # Vertex normals let the viewer shade the low-detail mesh smoothly.
        storage.write_atomic(path, mesh.export(file_type="glb", include_normals=True))
    return path


def publish_glb(path: Path, metadata: ScanMetadata) -> str:
    """Store a converted GLB as <item_id>/<scan_id>/model.glb in the scans bucket and return its URL.

    Each model is uploaded once: the URL is kept next to the cached GLB, in a
    .url file. Delete it (or the whole cache) to upload again.
    """
    record = path.with_suffix(".url")
    if record.is_file():
        return record.read_text().strip()
    url = storage.upload_file(
        path.read_bytes(), f"{metadata.item_id}/{metadata.scan_id}/{STORED_GLB_NAME}", bucket=storage.scans_bucket()
    )
    storage.write_atomic(record, url.encode())
    return url
