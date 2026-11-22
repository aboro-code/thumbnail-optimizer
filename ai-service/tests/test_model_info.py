from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.api import model_info
from app.main import app

client = TestClient(app)


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def test_reports_strategy_and_installed_models():
    payload = {"models": [{"name": "llama3.2:1b"}, {"name": "nomic-embed-text:latest"}]}
    with patch.object(model_info.httpx, "get", return_value=_FakeResponse(payload)):
        body = client.get("/api/v1/model-info").json()

    assert body["scoring_strategy"] == "heuristic"
    assert body["strategy_class"] == "HeuristicCVScoringStrategy"
    assert body["llm"]["reachable"] is True
    assert body["llm"]["model_installed"] is True
    assert body["llm"]["embed_model_installed"] is True


def test_flags_missing_model():
    payload = {"models": [{"name": "llama3.2:3b"}]}
    with patch.object(model_info.httpx, "get", return_value=_FakeResponse(payload)):
        body = client.get("/api/v1/model-info").json()

    assert body["llm"]["reachable"] is True
    assert body["llm"]["model_installed"] is False


def test_unreachable_ollama_is_not_an_error():
    with patch.object(model_info.httpx, "get", side_effect=httpx.ConnectError("down")):
        response = client.get("/api/v1/model-info")

    assert response.status_code == 200
    assert response.json()["llm"]["reachable"] is False
    assert response.json()["llm"]["model_installed"] is False
