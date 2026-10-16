import numpy as np
import pytest

from app.services.scoring_engine import CTRScoringStrategy, HeuristicCVScoringStrategy
from app.services.trained_scoring import TrainedModelScoringStrategy, select_scoring_strategy
from training.train import prob_left, thumbnail_vector

MODEL = {
    "center": [60.0, 90.0, 0.5, 0.1],
    "scale": [10.0, 40.0, 0.5, 0.05],
    "weights": [0.2, 0.1, 0.2, -0.1],
}
AVERAGE = {"contrast": 60.0, "vividness": 90.0, "face_count": 0.5, "clutter": 0.1}
STRONG = {"contrast": 85.0, "vividness": 150.0, "face_count": 2, "clutter": 0.03}
WEAK = {"contrast": 30.0, "vividness": 30.0, "face_count": 0, "clutter": 0.3}


def test_is_a_ctr_scoring_strategy():
    assert isinstance(TrainedModelScoringStrategy(MODEL), CTRScoringStrategy)


def test_average_thumbnail_scores_50():
    assert TrainedModelScoringStrategy(MODEL).score(AVERAGE) == 50.0


def test_score_is_bounded_and_deterministic():
    strategy = TrainedModelScoringStrategy(MODEL)

    for features in (STRONG, WEAK):
        assert 0.0 <= strategy.score(features) <= 100.0
        assert strategy.score(features) == strategy.score(features)


def test_higher_score_matches_the_pairwise_preference():
    strategy = TrainedModelScoringStrategy(MODEL)
    prefers_strong = prob_left(MODEL, thumbnail_vector(STRONG), thumbnail_vector(WEAK)) > 0.5

    assert prefers_strong
    assert strategy.score(STRONG) > strategy.score(WEAK)


def test_loads_the_committed_model_artifact():
    strategy = TrainedModelScoringStrategy.from_file()

    assert strategy.weights.shape == (4,)
    assert np.all(strategy.scale > 0)


def test_select_scoring_strategy():
    assert isinstance(select_scoring_strategy("heuristic"), HeuristicCVScoringStrategy)
    assert isinstance(select_scoring_strategy("trained"), TrainedModelScoringStrategy)
    with pytest.raises(ValueError):
        select_scoring_strategy("cnn")
