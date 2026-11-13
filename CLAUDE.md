# CLAUDE.md

Context for Claude Code sessions working in this repository.

## Project
Thumbnail Optimizer — an OJT project (Multimodal AI track: Computer Vision + LLM) that predicts click-through-rate performance for candidate thumbnails, explains the prediction, and lets creators validate it with a built-in A/B testing workflow.

The full spec — business/product requirements, architecture, database design, API spec, security, testing, roadmap, ADRs — is in `docs/PRD.md`. Read it before making architectural decisions; this file only summarizes what's needed for day-to-day work.

## Tech Stack
- **Frontend (`frontend/`):** React 18 + Vite + React Router + Tailwind CSS v3 + Axios
- **Backend (`backend/`):** Node.js + Express — auth, REST API, MongoDB access, business logic (JWT auth, Google sign-in, per-user rate limiting, RBAC: Creator/Manager/Admin)
- **AI Service (`ai-service/`):** Python + FastAPI — CV feature extraction (OpenCV), CTR scoring strategies, and a RAG explanation pipeline running a **local** LLM through Ollama (`llama3.2:1b` + `nomic-embed-text`). Called internally by the Express backend, never directly by the frontend. Never use a remote/paid LLM API or a model of 10B+ parameters (mentor requirement).
- **Database:** MongoDB (collections: `users`, `thumbnails`, `predictions`, `abtests`; A/B variants are embedded in each `abtests` document)

## Repository Layout
```
thumbnail-optimizer/
├── .github/workflows/     # CI: backend (lint + jest), ai-service (pytest), frontend (build)
├── backend/
│   ├── src/routes/        # auth.js, thumbnails.js, predictions.js, abtests.js
│   ├── src/models/        # Mongoose schemas: User.js, Thumbnail.js, Prediction.js, ABTest.js
│   ├── src/middleware/    # auth.js (JWT, per-user rate limit, RBAC), upload.js
│   ├── src/config/        # db.js, uploadDir.js
│   ├── scripts/           # create-admin.js (the only way to create an Admin)
│   └── tests/
├── ai-service/
│   ├── app/api/           # FastAPI routers
│   ├── app/services/      # cv_engine.py, scoring_engine.py, trained_scoring.py, knowledge_base.py, rag_explainer.py
│   ├── app/models/        # Pydantic schemas
│   ├── training/          # build_dataset.py, train.py, evaluate.py (offline pipeline)
│   ├── artifacts/         # pairwise_model.json (trained weights)
│   ├── data/              # survey dataset; raw/, images/, interim/ are gitignored
│   └── tests/
├── frontend/src/          # pages/, components/, lib/
├── docs/PRD.md            # full project documentation
└── docker-compose.yml
```

## Roadmap (docs/PRD.md §13.2) — work in order
1. **Week 1–2 (done):** scope, scaffold, JWT auth, core Mongoose/data models, dataset-sourcing decision.
2. **Week 3–4 (done):** CV feature extraction + `HeuristicCVScoringStrategy` (ai-service), wired to the Express API.
3. **Week 5–6 (done, plus the model-training pipeline):** A/B testing module, dashboard, RAG explanation engine, evaluation against §2.6/§11.
4. **Week 7 (current):** Reporting/export (PDF/CSV), UI polish, accessibility pass.
5. **Week 8:** Final integration, deployment, model card, demo prep.

Don't jump ahead of the current week's scope unless explicitly asked — a mentor is tracking progress against this roadmap.

## Design Notes Worth Remembering
- CTR scoring is built behind a `CTRScoringStrategy` interface (Strategy pattern, ADR-001). `SCORING_STRATEGY=heuristic|trained` selects `HeuristicCVScoringStrategy` (default; it won the evaluation) or `TrainedModelScoringStrategy` without touching callers.
- The AI service is stateless and isolated from the web-facing layer on purpose (ADR-002): CV/LLM logic stays in Python, auth/API/DB stays in Node.
- Prediction scores must be deterministic — identical input features yield identical output scores.
- Explanations degrade gracefully: if Ollama is down, scoring still works and the explanation falls back to a template sentence.

## Commit Policy
This is an OJT project and commit history/cadence is monitored by the mentor. Commit **small and often** — at every meaningful checkpoint (a working route, a passing test, a completed model, a config fix), not in large batches at the end of a session.

Use **Conventional Commits** style for every commit message:
- `feat: ...` — a new feature or capability
- `fix: ...` — a bug fix
- `docs: ...` — documentation-only changes (including PRD/README updates)
- `chore: ...` — tooling, config, dependency, or scaffold changes with no behavior change
- `test: ...` — adding or updating tests
- `refactor: ...` — code change that neither fixes a bug nor adds a feature

Keep the subject line short and imperative ("add JWT middleware", not "added" or "adds"). Prefer several focused commits over one large one covering unrelated changes.

Only commit when the user explicitly says to; propose the commit split and messages first.

## Never Commit
- `local-docs/` (study guide, video scripts): local only, ignored via `.git/info/exclude`.
- `ai-service/data/raw/`, `images/`, `interim/`: the survey export contains respondent emails and the images are third-party thumbnails (already in `.gitignore`).
- `AGENTS.md`, `demo/`: untracked on purpose.
