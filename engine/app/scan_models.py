"""A single scan's model as GLB, for viewing a scan before there is a second one to compare."""

from pathlib import Path

from scandiff import storage
from scandiff.io import load_mesh

GLB_CACHE_DIR = storage.DATA_DIR.parent / "glb"
# Part of each cached file's name. Bump it when the conversion changes, so old files are not served.
GLB_FORMAT_VERSION = 1


def scan_model_glb(scan_id: str) -> Path:
    """GLB of the scan's model in meters, +Y up, in the scan's own frame.

    Converted files are cached by the model's sha256, so a scan is converted
    once, and a re-uploaded model gets a new file.
    """
    model, metadata = storage.fetch_model(scan_id)
    path = GLB_CACHE_DIR / f"{metadata.model_sha256.lower()}-v{GLB_FORMAT_VERSION}.glb"
    if not path.is_file():
        mesh = load_mesh(model, require_density=False)
        # Vertex normals let the viewer shade the low-detail mesh smoothly.
        storage.write_atomic(path, mesh.export(file_type="glb", include_normals=True))
    return path
