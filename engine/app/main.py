"""FastAPI app."""

import os
import secrets
import threading
import time
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Request, status
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
from app.pipeline import run_diff
from app.scan_models import scan_model_glb
from app.schemas import DiffRequest, DiffResponse
from scandiff import config
from scandiff.errors import (
    ChecksumMismatch,
    InvalidMetadata,
    ScanNotFound,
    StorageNotConfigured,
    UnsupportedFormat,
    UploadFailed,
)

# Sessions: GET /health issues one, POST /diff requires it. Kept in memory, so a restart
# ends every session and clients reconnect. ENGINE_REQUIRE_SESSION=0 turns the check off.
SESSION_HEADER = "X-Session-ID"
_sessions: dict[str, float] = {}
_sessions_lock = threading.Lock()

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
    """Liveness check, and the start of a session.

    Send the returned `session_id` as the X-Session-ID header on POST /diff. It
    lasts SESSION_TTL_S after its last use; on a 401, call /health again.
    """
    session_id = secrets.token_urlsafe(24)
    now = time.monotonic()
    with _sessions_lock:
        for expired in [key for key, expiry in _sessions.items() if expiry < now]:
            del _sessions[expired]
        _sessions[session_id] = now + config.SESSION_TTL_S
    return {"status": "ok", "session_id": session_id}


def _require_session(session_id: str | None) -> None:
    if os.environ.get("ENGINE_REQUIRE_SESSION", "1") == "0":
        return
    now = time.monotonic()
    with _sessions_lock:
        if session_id and _sessions.get(session_id, 0.0) >= now:
            _sessions[session_id] = now + config.SESSION_TTL_S
            return
    raise HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        f"Missing or expired session. Call GET /health and send its session_id as the {SESSION_HEADER} header.",
    )


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


@app.post(
    "/diff",
    response_model=DiffResponse,
    responses={
        401: {"description": "No valid X-Session-ID header; call GET /health for a session_id."},
        404: {"description": "No scan with that id in the scans bucket."},
        502: {"description": "A result file could not be uploaded to Supabase Storage."},
        503: {"description": "Supabase is not configured on the engine."},
    },
)
def diff(
    body: DiffRequest,
    request: Request,
    mock: bool = False,
    x_session_id: Annotated[str | None, Header()] = None,
) -> DiffResponse:
    """Compare the new scan against the base scan. `?mock=true` returns the fixed example instead.

    Needs the X-Session-ID header from GET /health, except with ?mock=true.
    Takes several seconds: it downloads both scans, aligns them, measures and
    classifies every change, and uploads the heat map, both models and region
    crops. Scans that cannot be compared (unreadable, different items, failed
    alignment, too little overlap) return 200 with verdict "inconclusive" and a reason.
    """
    if mock:
        return _mock(request)
    _require_session(x_session_id)
    try:
        return run_diff(body.base_id, body.new_id)
    except StorageNotConfigured as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except ScanNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except UploadFailed as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


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
