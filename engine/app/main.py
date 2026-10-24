"""FastAPI app."""

from fastapi import FastAPI, HTTPException, status

from app.schemas import DiffRequest, DiffResponse

app = FastAPI(title="ScanDiff")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/diff", response_model=DiffResponse)
def diff(body: DiffRequest) -> DiffResponse:
    """Compare two scans. The pipeline is not wired yet."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f"Diff is not implemented for {body.base_id} -> {body.new_id}",
    )
