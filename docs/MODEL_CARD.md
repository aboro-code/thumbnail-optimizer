# Model Card: Thumbnail CTR Scoring

Covers the two scoring strategies behind `POST /api/v1/score` in the AI service and the local LLM that writes the explanations. The format follows Mitchell et al., *Model Cards for Model Reporting* (2019).

## 1. Model details

| | Heuristic (default) | Trained pairwise model |
|---|---|---|
| Class | `HeuristicCVScoringStrategy` | `TrainedModelScoringStrategy` |
| Selected by | `SCORING_STRATEGY=heuristic` | `SCORING_STRATEGY=trained` |
| Type | Weighted rule over 4 CV features | Bradley-Terry pairwise logistic regression, L2 (λ = 1), fitted with Newton's method |
| Artifact | Code only (`app/services/scoring_engine.py`) | `ai-service/artifacts/pairwise_model.json` (version 1) |
| Output | CTR score 0–100, deterministic | CTR score 0–100, deterministic |

Both sit behind the `CTRScoringStrategy` interface (Strategy pattern, ADR-001), so switching is one environment variable and no caller changes. The admin page (**Admin → Model**) shows which strategy is active.

**Explanation generator (not a scorer):** local RAG.
- **Retrieval:** `nomic-embed-text` embeds the detected signals and the 8 best-practice passages; the top 2 passages by cosine similarity are kept.
- **Generation:** `llama3.2:1b` (about 1.2B parameters) writes one sentence grounded in those passages.
- **Where it runs:** both models run on the machine through Ollama; no remote API is called.
- **Effect on the score:** none. The explanation never changes the score.

## 2. Intended use

- **Intended:** helping a creator compare 2–10 candidate thumbnails for the *same* video before publishing, then checking the pick with a real A/B test in the app.
- **Users:** content creators and the managers of creator teams.
- **Not intended:**
  - predicting absolute CTR on a platform;
  - comparing thumbnails for different videos (votes there reflect interest in the topic, not design);
  - any decision about people. The face feature only checks that a face is present; it never identifies anyone.

## 3. Features (`app/services/cv_engine.py`, OpenCV)

| Feature | Computed as | Heuristic weight |
|---|---|---|
| `contrast` | Standard deviation of the greyscale image | Up to +30 (full at ≥ 80) |
| `vividness` | Mean HSV saturation | Up to +20 (full at ≥ 150) |
| `face_count` | Haar cascade (frontal face) | +25 if at least one face |
| `clutter` | Share of Canny edge pixels (100/200) | Up to −15 |

Heuristic score = 40 + contrast + vividness + face − clutter, clipped to the range 0–100. The weights are hand-set from published thumbnail guidance (PRD §9.2), not learned.

## 4. Training data (trained model only)

- **Source:** our own survey. Respondents saw two thumbnails side by side and voted LEFT or RIGHT.
- **Size:** 20 pairs, 360 votes; 17 pairs had a clear majority ("decided").
- **Privacy:** respondent columns, including emails, are dropped when votes are counted (`training/build_dataset.py`). The raw export and the thumbnail images are never committed.
- **Fingerprint:** the artifact records the SHA-256 of `pairs.csv`, so the exact training data can be checked.

## 5. Evaluation (`python -m training.evaluate`, 2026-10-16)

Accuracy is measured on the 17 decided survey pairs: does the model prefer the thumbnail that most people voted for?

| Model | Accuracy | Log-loss per vote |
|---|---|---|
| **Heuristic (default)** | **12/17 (71%)** | n/a (hard picks only) |
| Trained pairwise, leave-one-out | 9/17 (53%) | 0.726 |
| Majority baseline (always "right") | 9/17 (53%) | 0.693 |

**What this means:**
- The trained model does **not** beat the baseline, so the heuristic stays the default (decision D-23).
- With 17 pairs, one pair is worth about 6 percentage points. Even 12/17 is not statistically conclusive: it would happen by chance about 7% of the time.
- The learned weights have the **same signs** as the hand-set ones (contrast, vividness and face positive; clutter negative). The data independently agrees with the heuristic's design.

**Online check:** every A/B test closed in the app records whether the AI's top pick actually won. The dashboard shows this as "AI prediction accuracy", and the admin analytics show it system-wide.

**Latency (CPU):**
- Feature extraction: about 21 ms.
- Full `/score` with the local LLM: about 3 s warm. The first call after start-up takes about 30 s while the model loads.

## 6. Limitations and risks

- **Small data.** The trained model's weights are not reliable yet.
- **Design only.** The model can't judge topic, title, text meaning or brand, which often drive real clicks more than design does.
- **Face detection** uses a frontal Haar cascade. It misses profile or stylised faces and can fire on face-like patterns. Detection quality may vary across skin tones and lighting. Nobody has audited it for this.
- **Fixed thresholds.** Contrast, saturation and clutter thresholds were tuned for 16:9 YouTube-style images.
- **LLM text.** The explanation can be vague, and wording varies between runs. It is grounded in retrieved guidance but not fact-checked. If Ollama is down, a template sentence built from the signals is used instead.

## 7. Ethical considerations

- Faces are only counted. No identity, age, gender or emotion is inferred.
- Survey respondents' personal data never leaves the raw export, and that export is not in the repository.
- No user data is sent to a third-party AI service: the LLM and embeddings run locally (mentor requirement: no remote LLM, under 10B parameters).

## 8. How to improve it

1. Collect 100+ decided pairs, ideally two thumbnails for the **same** video.
2. Use the app's own closed A/B tests (real impressions and clicks) as training labels.
3. Add features: text area (OCR), face size, brightness.
4. Only with thousands of labelled thumbnails: CNN embeddings (MobileNet/ResNet18) plus a small head (PRD §9.3).
