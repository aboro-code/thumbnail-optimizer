import pytest

from app.services.scoring_engine import (
    CTRScoringStrategy,
    HeuristicCVScoringStrategy,
    derive_explanation_signals,
)

BASE_FEATURES = {"contrast": 40.0, "vividness": 75.0, "face_count": 0, "clutter": 0.2}


def test_is_a_ctr_scoring_strategy():
    assert isinstance(HeuristicCVScoringStrategy(), CTRScoringStrategy)


def test_cannot_instantiate_the_abstract_interface():
    with pytest.raises(TypeError):
        CTRScoringStrategy()


def test_score_is_deterministic():
    strategy = HeuristicCVScoringStrategy()
    first = strategy.score(BASE_FEATURES)
    second = strategy.score(BASE_FEATURES)
    assert first == second


def test_score_is_bounded_0_to_100():
    strategy = HeuristicCVScoringStrategy()

    low = strategy.score({"contrast": 0, "vividness": 0, "face_count": 0, "clutter": 1.0})
    high = strategy.score({"contrast": 1000, "vividness": 1000, "face_count": 5, "clutter": 0})

    assert 0.0 <= low <= 100.0
    assert 0.0 <= high <= 100.0
    assert high == 100.0


def test_higher_contrast_increases_score():
    strategy = HeuristicCVScoringStrategy()
    low_contrast = strategy.score({**BASE_FEATURES, "contrast": 10.0})
    high_contrast = strategy.score({**BASE_FEATURES, "contrast": 80.0})
    assert high_contrast > low_contrast


def test_face_presence_increases_score():
    strategy = HeuristicCVScoringStrategy()
    no_face = strategy.score({**BASE_FEATURES, "face_count": 0})
    with_face = strategy.score({**BASE_FEATURES, "face_count": 1})
    assert with_face > no_face


def test_additional_faces_beyond_one_do_not_add_further_bonus():
    strategy = HeuristicCVScoringStrategy()
    one_face = strategy.score({**BASE_FEATURES, "face_count": 1})
    three_faces = strategy.score({**BASE_FEATURES, "face_count": 3})
    assert one_face == three_faces


def test_higher_clutter_decreases_score():
    strategy = HeuristicCVScoringStrategy()
    low_clutter = strategy.score({**BASE_FEATURES, "clutter": 0.0})
    high_clutter = strategy.score({**BASE_FEATURES, "clutter": 1.0})
    assert high_clutter < low_clutter


def test_explanation_signals_always_returns_at_least_one_signal():
    signals = derive_explanation_signals(BASE_FEATURES)
    assert len(signals) >= 1


def test_explanation_signals_flag_a_detected_face():
    signals = derive_explanation_signals({**BASE_FEATURES, "face_count": 1})
    assert "clear focal face present" in signals


def test_explanation_signals_flag_no_face():
    signals = derive_explanation_signals({**BASE_FEATURES, "face_count": 0})
    assert "no face detected" in signals


def test_explanation_signals_flag_high_contrast():
    signals = derive_explanation_signals({**BASE_FEATURES, "contrast": 70})
    assert "high-contrast image" in signals


def test_explanation_signals_flag_clutter():
    signals = derive_explanation_signals({**BASE_FEATURES, "clutter": 0.5})
    assert "cluttered composition" in signals
