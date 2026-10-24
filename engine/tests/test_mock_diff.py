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
    assert result.base_model_url.endswith("/sample_base.glb")
    assert result.new_model_url.endswith("/sample_new.glb")
    assert result.heatmap_legend.colormap == "diverging_blue_gray_red"
    assert result.heatmap_legend.neutral_band_mm == result.stats.threshold_mm
    for region in result.regions:
        assert "centroid_m" in region.model_dump()
        assert "centroid" not in region.model_dump()
        assert 0.005 <= region.radius_m <= 0.03
        assert max(abs(value) for value in region.centroid_m) < 0.3
    for uncovered in result.uncovered_regions:
        assert "centroid_m" in uncovered.model_dump()
        assert "centroid" not in uncovered.model_dump()
        assert uncovered.radius_m > 0
        assert max(abs(value) for value in uncovered.centroid_m) < 0.3
    for fingerprint in (result.base_fingerprint, result.new_fingerprint):
        assert re.fullmatch(r"[0-9a-f]{64}", fingerprint)


def test_mock_query_param_returns_mock_response():
    response = client.post("/diff?mock=true", json=BODY)

    assert response.status_code == 200
    assert response.json()["diff_id"] == "mock-diff-0001"


def test_model_urls_serve_glbs():
    payload = client.post("/diff", json=BODY).json()

    for key in ("heatmap_url", "base_model_url", "new_model_url"):
        response = client.get(payload[key])
        assert response.status_code == 200
        assert response.content[:4] == b"glTF"


def test_cors_allows_any_origin():
    response = client.post("/diff", json=BODY, headers={"Origin": "http://localhost:5173"})

    assert response.headers["access-control-allow-origin"] == "*"
