import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

JPEG_BYTES = b"\xff\xd8\xff\xe0" + bytes(100)


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


def test_score_stub_not_implemented_for_a_valid_image():
    response = client.post(
        "/api/v1/score",
        files={"file": ("a.jpg", io.BytesIO(JPEG_BYTES), "image/jpeg")},
    )
    assert response.status_code == 501
