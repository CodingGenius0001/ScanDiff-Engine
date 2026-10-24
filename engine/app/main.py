"""FastAPI app."""

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.mock import (
    SAMPLE_BASE_GLB_NAME,
    SAMPLE_GLB_NAME,
    SAMPLE_NEW_GLB_NAME,
    STATIC_DIR,
    ensure_sample_glb,
    mock_diff_response,
)
from app.schemas import DiffRequest, DiffResponse

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
