"""FastAPI app."""

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.mock import (
    SAMPLE_BASE_GLB_NAME,
    SAMPLE_GLB_NAME,
    SAMPLE_NEW_GLB_NAME,
    STATIC_DIR,
    ensure_sample_glb,
    mock_diff_response,
)
from app.scan_models import scan_model_glb
from app.schemas import DiffRequest, DiffResponse
from scandiff.errors import (
    ChecksumMismatch,
    InvalidMetadata,
    ScanNotFound,
    StorageNotConfigured,
    UnsupportedFormat,
)

# Flip to True once the real pipeline is wired into /diff.
PIPELINE_READY = False

ensure_sample_glb()

app = FastAPI(title="ScanDiff")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _mock(request: Request) -> DiffResponse:
    static = request.url_for
    return mock_diff_response(
        str(static("static", path=SAMPLE_GLB_NAME)),
        str(static("static", path=SAMPLE_BASE_GLB_NAME)),
        str(static("static", path=SAMPLE_NEW_GLB_NAME)),
    )


@app.get("/schema/example", response_model=DiffResponse)
def schema_example(request: Request) -> DiffResponse:
    """Mock DiffResponse, one example of every contract field."""
    return _mock(request)


@app.post("/diff", response_model=DiffResponse)
def diff(body: DiffRequest, request: Request, mock: bool = False) -> DiffResponse:
    """Compare two scans. Returns a fake response until the pipeline is wired, or with ?mock=true."""
    if mock or not PIPELINE_READY:
        return _mock(request)
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"Diff is not implemented for {body.base_id} -> {body.new_id}",
    )


@app.get(
    "/scans/{scan_id}/model.glb",
    response_class=FileResponse,
    responses={
        200: {"content": {"model/gltf-binary": {}}, "description": "The scan's model as GLB."},
        404: {"description": "No scan with that id in the scans bucket."},
        422: {"description": "The scan's metadata or model is invalid or does not match its checksum."},
        503: {"description": "Supabase is not configured on the engine."},
    },
)
def scan_model(scan_id: str) -> FileResponse:
    """One scan's model as GLB: meters, +Y up, in that scan's own frame.

    `scan_id` is `scans.id`, in any case. When this scan is the base of a diff,
    this is the diff's frame, so the GLB lines up with /diff's heat map and
    regions. A new scan's own frame is not aligned to its base; /diff's
    `new_model_url` is.
    """
    try:
        path = scan_model_glb(scan_id)
    except StorageNotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except ScanNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except (InvalidMetadata, ChecksumMismatch, UnsupportedFormat) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return FileResponse(path, media_type="model/gltf-binary")
