import numpy as np
import pytest

from training.evaluate import accuracy
from training.train import fit, prob_left


def make_pair(left, right, votes_left, votes_right):
    return {
        "left": np.array(left, dtype=float),
        "right": np.array(right, dtype=float),
        "votes_left": votes_left,
        "votes_right": votes_right,
    }


def contrast_preferred_pairs():
    # People always prefer the higher-contrast thumbnail; other features are noise.
    rng = np.random.default_rng(0)
    pairs = []
    for _ in range(30):
        a, b = rng.uniform(30, 90, size=2)
        other = rng.uniform(0, 1, size=(2, 3))
        left = [a, *other[0]]
        right = [b, *other[1]]
        pairs.append(make_pair(left, right, 15, 3) if a > b else make_pair(left, right, 3, 15))
    return pairs


def test_fit_learns_the_feature_people_prefer():
    model = fit(contrast_preferred_pairs())

    weights = model["weights"]
    assert weights[0] > 0
    assert abs(weights[0]) == max(abs(w) for w in weights)


def test_fit_is_deterministic():
    pairs = contrast_preferred_pairs()

    assert fit(pairs) == fit(pairs)


def test_prediction_is_symmetric_when_sides_are_swapped():
    model = fit(contrast_preferred_pairs())
    a, b = np.array([80.0, 0.5, 1.0, 0.1]), np.array([40.0, 0.5, 0.0, 0.2])

    assert prob_left(model, a, b) + prob_left(model, b, a) == pytest.approx(1.0)


def test_accuracy_skips_tied_pairs_and_never_credits_a_non_pick():
    pairs = [
        make_pair([0] * 4, [0] * 4, 10, 2),  # left won
        make_pair([0] * 4, [0] * 4, 2, 10),  # right won
        make_pair([0] * 4, [0] * 4, 6, 6),  # tie: excluded
    ]

    assert accuracy([0.9, 0.5, 0.1], pairs) == (1, 2)
