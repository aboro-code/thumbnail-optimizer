import io
import os

import httpx
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

JPEG_BYTES = b"\xff\xd8\xff\xe0" + bytes(100)


class _FakeOllamaResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return {"response": "This thumbnail scores well due to its strong contrast and clear face."}


def test_score_rejects_unsupported_content_type():
    response = client.post(
        "/api/v1/score",
        files={"file": ("a.svg", io.BytesIO(b"<svg></svg>"), "image/svg+xml")},
    )
    assert response.status_code == 400


def test_score_rejects_oversized_file():
    oversized = JPEG_BYTES + bytes(10 * 1024 * 1024)
    response = client.post(
        "/api/v1/score",
        files={"file": ("big.jpg", io.BytesIO(oversized), "image/jpeg")},
    )
    assert response.status_code == 400


def test_score_rejects_an_undecodable_file():
    response = client.post(
        "/api/v1/score",
        files={"file": ("a.jpg", io.BytesIO(JPEG_BYTES), "image/jpeg")},
    )
    assert response.status_code == 400
    assert "decode" in response.json()["detail"].lower()


def test_score_returns_a_prediction_for_a_real_image(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _FakeOllamaResponse())

    with open(os.path.join(FIXTURES_DIR, "face_sample.jpg"), "rb") as f:
        response = client.post(
            "/api/v1/score",
            files={"file": ("face_sample.jpg", f, "image/jpeg")},
            data={"content_title": "Demo video"},
        )

    assert response.status_code == 200
    body = response.json()
    assert 0.0 <= body["ctr_score"] <= 100.0
    assert len(body["explanation_signals"]) >= 1
    assert "clear focal face present" in body["explanation_signals"]
    assert body["explanation_text"] == "This thumbnail scores well due to its strong contrast and clear face."


def test_score_still_works_if_the_local_model_is_unreachable(monkeypatch):
    def raise_connect_error(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx, "post", raise_connect_error)

    with open(os.path.join(FIXTURES_DIR, "face_sample.jpg"), "rb") as f:
        response = client.post(
            "/api/v1/score",
            files={"file": ("face_sample.jpg", f, "image/jpeg")},
        )

    assert response.status_code == 200
    body = response.json()
    assert "clear focal face present" in body["explanation_text"]
