import io

import numpy as np

from training.build_dataset import (
    LETTERBOX_BAR,
    PILLAR_LEFT,
    PILLAR_RIGHT,
    crop_thumbnail,
    load_votes,
    split_composite,
)


def noisy_image(height, width, seed=0):
    rng = np.random.default_rng(seed)
    return rng.integers(60, 255, size=(height, width, 3), dtype=np.uint8)


def test_load_votes_counts_answers_and_ignores_respondent_columns():
    export = io.StringIO(
        '"Timestamp","Username","1","2"\n'
        '"t1","a@example.com","Left","Right"\n'
        '"t2","b@example.com","Left","Left"\n'
        '"t3","c@example.com","Right",""\n'
    )
    votes = load_votes(export)

    assert votes == {1: {"left": 2, "right": 1}, 2: {"left": 1, "right": 1}}


def test_crop_removes_letterbox_bars():
    panel = np.zeros((360, 480, 3), dtype=np.uint8)
    panel[LETTERBOX_BAR:-LETTERBOX_BAR] = noisy_image(360 - 2 * LETTERBOX_BAR, 480)

    assert crop_thumbnail(panel).shape[:2] == (270, 480)


def test_crop_removes_pillarbox_fill_around_vertical_thumbnail():
    panel = np.full((360, 480, 3), 30, dtype=np.uint8)  # dimmed fill
    panel[:, PILLAR_LEFT:PILLAR_RIGHT] = noisy_image(360, PILLAR_RIGHT - PILLAR_LEFT)

    assert crop_thumbnail(panel).shape[:2] == (360, PILLAR_RIGHT - PILLAR_LEFT)


def test_crop_keeps_a_panel_with_no_padding():
    panel = noisy_image(360, 480)

    assert crop_thumbnail(panel).shape[:2] == (360, 480)


def test_split_composite_returns_left_and_right_panels():
    composite = np.full((422, 996, 3), 255, dtype=np.uint8)
    composite[14:374, 14:494] = noisy_image(360, 480, seed=1)
    composite[14:374, 502:982] = noisy_image(360, 480, seed=2)

    left, right = split_composite(composite)

    assert np.array_equal(left, composite[14:374, 14:494])
    assert np.array_equal(right, composite[14:374, 502:982])
