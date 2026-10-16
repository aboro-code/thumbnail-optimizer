"""TrainedModelScoringStrategy: serves the pairwise model from training/train.py (ADR-001)."""

import json
from pathlib import Path

import numpy as np

from app.services.scoring_engine import CTRScoringStrategy, HeuristicCVScoringStrategy

DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[2] / "artifacts" / "pairwise_model.json"


class TrainedModelScoringStrategy(CTRScoringStrategy):
    """Scores a thumbnail as 100 * P(people prefer it over the average survey thumbnail).

    The model learns utility u = w · (x - center) / scale from pairwise votes, so the
    average thumbnail lands at 50 and a higher score always means "more likely to win
    a head-to-head", which is what the A/B ranking needs.
    """

    def __init__(self, model: dict):
        self.center = np.array(model["center"])
        self.scale = np.array(model["scale"])
        self.weights = np.array(model["weights"])

    @classmethod
    def from_file(cls, path=DEFAULT_MODEL_PATH):
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    def score(self, features: dict) -> float:
        x = np.array(
            [
                features["contrast"],
                features["vividness"],
                min(features["face_count"], 1),
                features["clutter"],
            ],
            dtype=float,
        )
        utility = float(((x - self.center) / self.scale) @ self.weights)
        return round(100.0 / (1.0 + np.exp(-utility)), 1)


def select_scoring_strategy(name: str, model_path=DEFAULT_MODEL_PATH) -> CTRScoringStrategy:
    if name == "heuristic":
        return HeuristicCVScoringStrategy()
    if name == "trained":
        return TrainedModelScoringStrategy.from_file(model_path)
    raise ValueError(f"unknown SCORING_STRATEGY {name!r}; expected 'heuristic' or 'trained'")
