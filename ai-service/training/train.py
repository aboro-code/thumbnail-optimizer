"""Training pipeline: fit a pairwise (Bradley-Terry) model on data/processed/pairs.csv.

Model: each thumbnail gets a utility u = w · x, where x are its scaled CV features.
The chance people prefer LEFT over RIGHT is

    P(left) = sigmoid(u_left - u_right) = sigmoid(w · (x_left - x_right))

Every vote is one observation, so a 16-2 pair counts more than a 10-8 pair and ties
still pull the two utilities together. Fitted with L2-regularised Newton's method in
plain numpy: 4 weights, deterministic, no extra dependency.

Run from ai-service/:  python -m training.train
"""

import csv
import hashlib
import json
from pathlib import Path

import numpy as np

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
PAIRS_CSV = AI_SERVICE_DIR / "data" / "processed" / "pairs.csv"
MODEL_PATH = AI_SERVICE_DIR / "artifacts" / "pairwise_model.json"

FEATURES = ["contrast", "vividness", "has_face", "clutter"]
L2_STRENGTH = 1.0  # fixed up front, not tuned on the evaluation data


def thumbnail_vector(features: dict) -> np.ndarray:
    """Same inputs the heuristic uses; face presence is capped at 1 like the heuristic."""
    return np.array(
        [
            float(features["contrast"]),
            float(features["vividness"]),
            float(min(int(features["face_count"]), 1)),
            float(features["clutter"]),
        ]
    )


def load_pairs(path: Path = PAIRS_CSV) -> list:
    pairs = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            side = lambda s: {k: row[f"{s}_{k}"] for k in ("contrast", "vividness", "face_count", "clutter")}
            pairs.append(
                {
                    "pair_id": int(row["pair_id"]),
                    "left": thumbnail_vector(side("left")),
                    "right": thumbnail_vector(side("right")),
                    "votes_left": int(row["votes_left"]),
                    "votes_right": int(row["votes_right"]),
                }
            )
    return pairs


def fit(pairs: list, l2: float = L2_STRENGTH, iterations: int = 50) -> dict:
    # Scale each feature by its spread across all thumbnails so weights are comparable.
    thumbnails = np.array([p[s] for p in pairs for s in ("left", "right")])
    scale = thumbnails.std(axis=0)
    scale[scale == 0] = 1.0

    diffs = np.array([(p["left"] - p["right"]) / scale for p in pairs])
    wins = np.array([p["votes_left"] for p in pairs], dtype=float)
    totals = np.array([p["votes_left"] + p["votes_right"] for p in pairs], dtype=float)

    w = np.zeros(len(FEATURES))
    for _ in range(iterations):
        prob = 1.0 / (1.0 + np.exp(-diffs @ w))
        gradient = diffs.T @ (totals * prob - wins) + l2 * w
        hessian = diffs.T @ (diffs * (totals * prob * (1 - prob))[:, None]) + l2 * np.eye(len(w))
        step = np.linalg.solve(hessian, gradient)
        w -= step
        if np.abs(step).max() < 1e-10:
            break

    # center = the average survey thumbnail; serving scores it at 50 (see trained_scoring.py)
    return {
        "features": FEATURES,
        "center": thumbnails.mean(axis=0).tolist(),
        "scale": scale.tolist(),
        "weights": w.tolist(),
        "l2": l2,
    }


def prob_left(model: dict, left: np.ndarray, right: np.ndarray) -> float:
    diff = (left - right) / np.array(model["scale"])
    return float(1.0 / (1.0 + np.exp(-diff @ np.array(model["weights"]))))


def main():
    pairs = load_pairs()
    model = fit(pairs)
    model.update(
        model_type="pairwise_bradley_terry",
        version=1,
        trained_on={
            "pairs": len(pairs),
            "votes": sum(p["votes_left"] + p["votes_right"] for p in pairs),
            "pairs_csv_sha256": hashlib.sha256(PAIRS_CSV.read_bytes()).hexdigest(),
        },
    )

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")

    print(f"trained on {len(pairs)} pairs -> {MODEL_PATH}")
    for name, weight in zip(FEATURES, model["weights"]):
        print(f"  {name:<10} {weight:+.3f}")


if __name__ == "__main__":
    main()
