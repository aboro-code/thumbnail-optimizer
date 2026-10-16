# Survey preference dataset

Human preference labels used to train and evaluate a `TrainedModelScoringStrategy`
(PRD ADR-001). Built by `python -m training.build_dataset`, run from `ai-service/`.

## Layout

```
data/
├── raw/          # Google Forms export (.csv or .csv.zip): NOT committed, contains respondent emails
├── images/       # pair-01.jpg … pair-20.jpg survey composites: NOT committed, third-party thumbnails
├── interim/
│   └── thumbnails/   # pair-NN-left.png / pair-NN-right.png crops: NOT committed (generated)
└── processed/
    └── pairs.csv     # one row per pair, features + votes (committed, no personal data)
```

## Source

- 18 respondents picked LEFT or RIGHT for 20 thumbnail pairs (survey, 2026-09-13/14).
- Each survey image is a 996×422 composite: two 480×360 panels on white, captioned LEFT / RIGHT.
- Panels hold either a 16:9 thumbnail with 45px black bars top and bottom, a 9:16 Shorts
  thumbnail padded with a dimmed blurred copy, or a 4:3 image that fills the panel.
  `crop_thumbnail` detects each case so the CV features describe the thumbnail, not the padding.

## `pairs.csv` columns

| Column | Meaning |
|---|---|
| `pair_id` | Survey question number (1–20) |
| `left_image`, `right_image` | Crop filenames in `interim/thumbnails/` |
| `left_*`, `right_*` | `cv_engine` features: `contrast`, `vividness`, `face_count`, `clutter` |
| `votes_left`, `votes_right` | Vote counts |
| `vote_share_left` | `votes_left / total`, how strongly people agreed |
| `label` | `1` = left preferred, `0` = right preferred, blank = tie |

## Known limitations

- 20 pairs, 3 exact ties → 17 labelled pairs. A pilot dataset, not enough to prove accuracy.
- Several pairs compare different subjects (e.g. a person vs a tablet), so votes partly reflect
  content interest, which the 4 CV features cannot see.
- Pairs 1 and 20 reuse the same left thumbnail.
- Because rows are pairs, any train/test split must split by pair, never by individual thumbnail.
