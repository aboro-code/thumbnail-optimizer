"""CTR scoring engine (CTRScoringStrategy / HeuristicCVScoringStrategy). Per docs/PRD.md §8.1, §8.2."""

from abc import ABC, abstractmethod


class CTRScoringStrategy(ABC):
    """Encapsulates how a CV feature dict becomes a CTR score, so the MVP
    heuristic can later be swapped for a trained model without touching
    callers (ADR-001)."""

    @abstractmethod
    def score(self, features: dict) -> float:
        """Return a predicted CTR score in [0, 100]."""


class HeuristicCVScoringStrategy(CTRScoringStrategy):
    """Weighted, rule-based combination of CV signals. Needs no labeled
    training data - the MVP strategy per ADR-001."""

    def score(self, features: dict) -> float:
        contrast_component = min(features["contrast"] / 80.0, 1.0) * 30
        vividness_component = min(features["vividness"] / 150.0, 1.0) * 20
        face_component = min(features["face_count"], 1) * 25
        clutter_penalty = min(features["clutter"], 1.0) * 15

        raw_score = contrast_component + vividness_component + face_component - clutter_penalty + 40
        return round(max(0.0, min(raw_score, 100.0)), 1)


def derive_explanation_signals(features: dict) -> list:
    """Plain-language labels for the raw CV features, so a score is never
    returned bare (BR-002). A placeholder for the LLM-grounded RAG
    explainer planned for Week 5-6 - simple thresholds, not a model."""
    signals = []

    if features["contrast"] >= 60:
        signals.append("high-contrast image")
    elif features["contrast"] < 20:
        signals.append("low contrast")

    if features["vividness"] >= 100:
        signals.append("vivid, saturated colors")
    elif features["vividness"] < 40:
        signals.append("muted colors")

    if features["face_count"] >= 1:
        signals.append("clear focal face present")
    else:
        signals.append("no face detected")

    if features["clutter"] >= 0.3:
        signals.append("cluttered composition")
    elif features["clutter"] < 0.1:
        signals.append("clean, uncluttered composition")

    return signals
