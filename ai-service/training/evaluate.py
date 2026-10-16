"""Evaluation: trained pairwise model vs the current heuristic on the survey pairs.

The trained model is scored with leave-one-out cross-validation: for each pair, fit
on the other 19 and predict the held-out one, so no pair is ever judged by a model
that saw its votes. The heuristic needs no training, so it is scored directly.

Accuracy counts only the 17 non-tied pairs. Log-loss uses every vote, so it rewards
being confident on lopsided pairs and cautious on close ones (0.693 = coin flip).

Run from ai-service/:  python -m training.evaluate
"""

import math

from app.services.scoring_engine import HeuristicCVScoringStrategy
from training.train import fit, load_pairs, prob_left

COIN_FLIP_LOG_LOSS = math.log(2)


def vote_log_loss(predictions: list, pairs: list) -> float:
    total_loss, total_votes = 0.0, 0
    for p_left, pair in zip(predictions, pairs):
        p_left = min(max(p_left, 1e-6), 1 - 1e-6)
        total_loss -= pair["votes_left"] * math.log(p_left) + pair["votes_right"] * math.log(1 - p_left)
        total_votes += pair["votes_left"] + pair["votes_right"]
    return total_loss / total_votes


def accuracy(predictions: list, pairs: list) -> tuple:
    decided = [(p, pair) for p, pair in zip(predictions, pairs) if pair["votes_left"] != pair["votes_right"]]
    # p == 0.5 is "no pick", which never counts as correct
    correct = sum(p != 0.5 and (p > 0.5) == (pair["votes_left"] > pair["votes_right"]) for p, pair in decided)
    return correct, len(decided)


def leave_one_out(pairs: list) -> list:
    predictions = []
    for i, held_out in enumerate(pairs):
        model = fit(pairs[:i] + pairs[i + 1 :])
        predictions.append(prob_left(model, held_out["left"], held_out["right"]))
    return predictions


def heuristic_predictions(pairs: list) -> list:
    heuristic = HeuristicCVScoringStrategy()
    as_features = lambda v: {"contrast": v[0], "vividness": v[1], "face_count": v[2], "clutter": v[3]}
    predictions = []
    for pair in pairs:
        left, right = heuristic.score(as_features(pair["left"])), heuristic.score(as_features(pair["right"]))
        # The heuristic only ranks, so it gets a hard pick (0.5 when it scores both equally).
        predictions.append(0.5 if left == right else float(left > right))
    return predictions


def main():
    pairs = load_pairs()
    decided = [p for p in pairs if p["votes_left"] != p["votes_right"]]
    right_wins = sum(p["votes_right"] > p["votes_left"] for p in decided)

    trained = leave_one_out(pairs)
    heuristic = heuristic_predictions(pairs)

    print(f"{len(pairs)} pairs, {len(decided)} with a winner\n")
    print(f"{'model':<34}{'accuracy':>12}{'log-loss':>10}")
    # The heuristic only gives hard picks, so it has no meaningful log-loss.
    for name, preds, loss in (
        ("trained pairwise (leave-one-out)", trained, f"{vote_log_loss(trained, pairs):.3f}"),
        ("heuristic (current)", heuristic, "n/a"),
    ):
        correct, n = accuracy(preds, pairs)
        print(f"{name:<34}{f'{correct}/{n} ({correct / n:.0%})':>12}{loss:>10}")
    print(f"{'always pick right (majority)':<34}{f'{right_wins}/{len(decided)} ({right_wins / len(decided):.0%})':>12}"
          f"{COIN_FLIP_LOG_LOSS:>10.3f}")

    print("\nper pair (P(left) from held-out model / heuristic pick / actual votes L-R):")
    for pair, p_trained, p_heur in zip(pairs, trained, heuristic):
        print(f"  pair {pair['pair_id']:>2}: {p_trained:.2f}  {'L' if p_heur > 0.5 else 'R' if p_heur < 0.5 else '='}"
              f"  {pair['votes_left']:>2}-{pair['votes_right']}")


if __name__ == "__main__":
    main()
