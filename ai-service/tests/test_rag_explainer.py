import httpx
import pytest

from app.services.rag_explainer import generate_explanation


class FakeResponse:
    def __init__(self, json_body, status_code=200):
        self._json_body = json_body
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)

    def json(self):
        return self._json_body


def test_returns_the_local_models_text(monkeypatch):
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: FakeResponse({"response": "  A bold, high-contrast image.  "})
    )

    result = generate_explanation(85.0, ["high-contrast image", "clear focal face present"])

    assert result == "A bold, high-contrast image."


def test_falls_back_when_the_local_model_is_unreachable(monkeypatch):
    def raise_connect_error(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx, "post", raise_connect_error)

    result = generate_explanation(40.0, ["low contrast", "cluttered composition"])

    assert "low contrast" in result
    assert "cluttered composition" in result


def test_falls_back_on_a_malformed_response(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse({"unexpected": "shape"}))

    result = generate_explanation(50.0, ["no face detected"])

    assert "no face detected" in result


def test_fallback_with_no_signals_at_all(monkeypatch):
    def raise_connect_error(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx, "post", raise_connect_error)

    result = generate_explanation(50.0, [])

    assert result == "No strong visual signals were detected for this thumbnail."


def test_falls_back_when_the_model_returns_empty_text(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse({"response": "   "}))

    result = generate_explanation(50.0, ["muted colors"])

    assert "muted colors" in result
