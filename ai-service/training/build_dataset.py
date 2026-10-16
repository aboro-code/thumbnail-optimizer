"""Dataset pipeline: survey votes + composite pair images -> data/processed/pairs.csv.

Each survey image shows two thumbnails side by side (LEFT / RIGHT). This script
crops each side back to the bare thumbnail, runs the same CV feature extractor
the live service uses, and joins the features with the aggregated votes.

Run from ai-service/:  python -m training.build_dataset
"""

import csv
import io
import zipfile
from pathlib import Path

import cv2
import numpy as np

from app.services.cv_engine import extract_thumbnail_features

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = AI_SERVICE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
IMAGES_DIR = DATA_DIR / "images"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"

FEATURES = ["contrast", "vividness", "face_count", "clutter"]

# Survey composite layout (996x422): two 480x360 panels on a white background.
PANEL_TOP, PANEL_SIZE = 14, (480, 360)  # (width, height)
PANEL_LEFT_X, PANEL_RIGHT_X = 14, 502

# A 16:9 thumbnail in a 480x360 panel leaves 45px black bars top and bottom.
LETTERBOX_BAR = 45
# A 9:16 (Shorts) thumbnail fills columns 139..340 and the sides are a dimmed,
# blurred copy, so there is a sharp vertical edge at both boundaries.
PILLAR_LEFT, PILLAR_RIGHT = 139, 341
PILLAR_EDGE_RATIO = 5.0
DARK_LEVEL = 25


def load_votes(csv_file) -> dict:
    """Count Left/Right votes per question. Respondent columns are never kept."""
    reader = csv.DictReader(csv_file)
    questions = [c for c in reader.fieldnames if c.strip().isdigit()]
    votes = {int(q): {"left": 0, "right": 0} for q in questions}
    for row in reader:
        for q in questions:
            answer = row[q].strip().lower()
            if answer in ("left", "right"):
                votes[int(q)][answer] += 1
    return votes


def open_survey_csv(path: Path):
    """Accept the Google Forms export either as .csv or zipped."""
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as zf:
            name = next(n for n in zf.namelist() if n.endswith(".csv"))
            return io.StringIO(zf.read(name).decode("utf-8-sig"))
    return open(path, encoding="utf-8-sig", newline="")


def crop_thumbnail(panel: np.ndarray) -> np.ndarray:
    """Strip the letterbox bars or pillarbox fill the survey added around a thumbnail."""
    gray = cv2.cvtColor(panel, cv2.COLOR_BGR2GRAY)

    top, bottom = gray[:LETTERBOX_BAR], gray[-LETTERBOX_BAR:]
    if (top < DARK_LEVEL).mean() > 0.98 and (bottom < DARK_LEVEL).mean() > 0.98:
        return panel[LETTERBOX_BAR:-LETTERBOX_BAR]

    col_steps = np.abs(np.diff(gray.astype(float), axis=1)).mean(axis=0)
    baseline = np.median(col_steps) or 1.0
    left_edge = col_steps[PILLAR_LEFT - 1] / baseline
    right_edge = col_steps[PILLAR_RIGHT - 1] / baseline
    if left_edge > PILLAR_EDGE_RATIO and right_edge > PILLAR_EDGE_RATIO:
        return panel[:, PILLAR_LEFT:PILLAR_RIGHT]

    return panel


def split_composite(image: np.ndarray) -> tuple:
    width, height = PANEL_SIZE
    rows = slice(PANEL_TOP, PANEL_TOP + height)
    left = image[rows, PANEL_LEFT_X : PANEL_LEFT_X + width]
    right = image[rows, PANEL_RIGHT_X : PANEL_RIGHT_X + width]
    return crop_thumbnail(left), crop_thumbnail(right)


def build_rows(votes: dict, images_dir: Path, crops_dir: Path) -> list:
    crops_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for pair_id in sorted(votes):
        image = cv2.imread(str(images_dir / f"pair-{pair_id:02d}.jpg"))
        if image is None:
            raise FileNotFoundError(f"missing image for pair {pair_id}")

        row = {"pair_id": pair_id}
        for side, thumb in zip(("left", "right"), split_composite(image)):
            crop_name = f"pair-{pair_id:02d}-{side}.png"
            cv2.imwrite(str(crops_dir / crop_name), thumb)
            row[f"{side}_image"] = crop_name
            features = extract_thumbnail_features(thumb)
            for name in FEATURES:
                row[f"{side}_{name}"] = round(features[name], 4)

        left_votes, right_votes = votes[pair_id]["left"], votes[pair_id]["right"]
        total = left_votes + right_votes
        row.update(
            votes_left=left_votes,
            votes_right=right_votes,
            vote_share_left=round(left_votes / total, 4) if total else "",
            # 1 = left preferred, 0 = right preferred, blank = tie (no signal)
            label="" if left_votes == right_votes else int(left_votes > right_votes),
        )
        rows.append(row)
    return rows


COLUMNS = (
    ["pair_id", "left_image", "right_image"]
    + [f"left_{f}" for f in FEATURES]
    + [f"right_{f}" for f in FEATURES]
    + ["votes_left", "votes_right", "vote_share_left", "label"]
)


def main():
    survey = next(RAW_DIR.glob("*.csv*"), None)
    if survey is None:
        raise SystemExit(f"no survey export found in {RAW_DIR}")

    with open_survey_csv(survey) as f:
        votes = load_votes(f)
    rows = build_rows(votes, IMAGES_DIR, INTERIM_DIR / "thumbnails")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    out = PROCESSED_DIR / "pairs.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    ties = sum(r["label"] == "" for r in rows)
    print(f"wrote {len(rows)} pairs ({len(rows) - ties} labelled, {ties} ties) to {out}")


if __name__ == "__main__":
    main()
