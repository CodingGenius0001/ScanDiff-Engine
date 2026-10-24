import re

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import DiffResponse

client = TestClient(app)
BODY = {"base_id": "scan_a", "new_id": "scan_b"}


def test_diff_returns_mock_response():
    response = client.post("/diff", json=BODY)

    assert response.status_code == 200
    result = DiffResponse.model_validate(response.json())
    assert result.verdict == "needs_review"
    assert len(result.histogram.counts) == 20
    assert len(result.histogram.bin_edges_mm) == 21
    assert sorted(r.label for r in result.regions) == ["needs_review", "normal_wear"]
    assert sorted(r.damage_type for r in result.regions) == ["dent_damage", "normal_wear"]
    assert [u.only_in for u in result.uncovered_regions] == ["base"]
    for fingerprint in (result.base_fingerprint, result.new_fingerprint):
        assert re.fullmatch(r"[0-9a-f]{64}", fingerprint)


def test_mock_query_param_returns_mock_response():
    response = client.post("/diff?mock=true", json=BODY)

    assert response.status_code == 200
    assert response.json()["diff_id"] == "mock-diff-0001"


def test_heatmap_url_serves_a_glb():
    heatmap_url = client.post("/diff", json=BODY).json()["heatmap_url"]

    response = client.get(heatmap_url)

    assert response.status_code == 200
    assert response.content[:4] == b"glTF"


def test_cors_allows_any_origin():
    response = client.post("/diff", json=BODY, headers={"Origin": "http://localhost:5173"})

    assert response.headers["access-control-allow-origin"] == "*"
