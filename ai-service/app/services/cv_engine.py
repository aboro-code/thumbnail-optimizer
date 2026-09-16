"""CV feature extraction (contrast, vividness, face presence, clutter). Per docs/PRD.md §8.2."""

import cv2
import numpy as np

_face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def extract_thumbnail_features(image: np.ndarray) -> dict:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Contrast: standard deviation of pixel intensities
    contrast_score = float(np.std(gray))

    # Color vividness: mean saturation channel
    vividness_score = float(np.mean(hsv[:, :, 1]))

    # Face presence: Haar cascade detector
    faces = _face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
    face_count = len(faces)

    # Visual clutter proxy: edge density via Canny
    edges = cv2.Canny(gray, 100, 200)
    clutter_score = float(np.mean(edges) / 255.0)

    return {
        "contrast": contrast_score,
        "vividness": vividness_score,
        "face_count": face_count,
        "clutter": clutter_score,
    }
