import os

import cv2
import numpy as np

from app.services.cv_engine import extract_thumbnail_features

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def solid_color_image(color=(128, 128, 128), size=(200, 200)):
    img = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    img[:] = color
    return img


def checkerboard_image(size=(200, 200), square=20):
    img = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    for y in range(0, size[1], square):
        for x in range(0, size[0], square):
            if ((x // square) + (y // square)) % 2 == 0:
                img[y : y + square, x : x + square] = (255, 255, 255)
    return img


def test_feature_ranges_on_a_flat_image():
    img = solid_color_image()
    features = extract_thumbnail_features(img)

    assert features["contrast"] == 0.0  # a flat color has zero intensity variation
    assert 0.0 <= features["vividness"] <= 255.0
    assert 0.0 <= features["clutter"] <= 1.0
    assert features["face_count"] >= 0


def test_checkerboard_has_high_contrast_and_clutter():
    img = checkerboard_image()
    features = extract_thumbnail_features(img)

    assert features["contrast"] > 50
    assert features["clutter"] > 0.05


def test_finds_a_face_in_a_real_photo():
    img = cv2.imread(os.path.join(FIXTURES_DIR, "face_sample.jpg"))
    assert img is not None

    features = extract_thumbnail_features(img)
    assert features["face_count"] >= 1


def test_no_face_in_a_synthetic_image():
    img = checkerboard_image()
    features = extract_thumbnail_features(img)
    assert features["face_count"] == 0


def test_deterministic_output():
    img = cv2.imread(os.path.join(FIXTURES_DIR, "face_sample.jpg"))
    first = extract_thumbnail_features(img)
    second = extract_thumbnail_features(img)
    assert first == second
