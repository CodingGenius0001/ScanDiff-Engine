"""The web viewer's DiffResponse contract stays generated from the models."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import DiffResponse

client = TestClient(app)
SCHEMA_PATH = Path(__file__).resolve().parents[1] / "contract" / "diff_response.schema.json"


def _schema_text() -> str:
    return json.dumps(DiffResponse.model_json_schema(), indent=2) + "\n"


def test_schema_example_is_the_mock_response():
    response = client.get("/schema/example")

    assert response.status_code == 200
    result = DiffResponse.model_validate(response.json())
    assert result.diff_id == "mock-diff-0001"
    assert result.heatmap_legend.colormap == "diverging_blue_gray_red"
    assert "centroid_m" in response.json()["regions"][0]
    assert "radius_m" in response.json()["regions"][0]
    assert "bbox_min_m" in response.json()["regions"][0]
    uncovered = response.json()["uncovered_regions"][0]
    assert "centroid_m" in uncovered
    assert "radius_m" in uncovered
    assert "centroid" not in uncovered
    assert response.json()["base_model_url"]
    assert response.json()["new_model_url"]


def test_diff_response_schema_stays_current():
    """Rewrite the exported schema from the model so the web types cannot drift."""
    SCHEMA_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = _schema_text()
    if not SCHEMA_PATH.exists() or SCHEMA_PATH.read_text() != payload:
        SCHEMA_PATH.write_text(payload)
    assert SCHEMA_PATH.read_text() == payload
    assert "centroid_m" in payload
    assert "base_model_url" in payload
    assert "new_model_url" in payload
    assert "heatmap_legend" in payload
    assert "diverging_blue_gray_red" in payload
    assert "Not a blue-to-red magnitude ramp." in payload
