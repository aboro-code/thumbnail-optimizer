# CLAUDE.md

Context for Claude Code sessions working in this repository.

## Project
Thumbnail Optimizer — an OJT project (Multimodal AI track: Computer Vision + LLM) that predicts click-through-rate performance for candidate thumbnails, explains the prediction, and lets creators validate it with a built-in A/B testing workflow.

The full spec — business/product requirements, architecture, database design, API spec, security, testing, roadmap, ADRs — is in `docs/PRD.md`. Read it before making architectural decisions; this file only summarizes what's needed for day-to-day work.

## Tech Stack
- **Frontend (`frontend/`):** React + Tailwind CSS + Chart.js + Axios
- **Backend (`backend/`):** Node.js + Express — auth, REST API, MongoDB access, business logic (JWT auth, RBAC: Creator/Manager/Admin)
- **AI Service (`ai-service/`):** Python + FastAPI — CV feature extraction (OpenCV), CTR scoring engine, LangChain/OpenAI RAG explanation pipeline. Called internally by the Express backend, never directly by the frontend.
- **Database:** MongoDB (collections: `users`, `thumbnails`, `predictions`, `ab_tests`, `ab_test_variants`)

## Repository Layout
```
thumbnail-optimizer/
├── .github/workflows/     # CI (lint + test on push)
├── backend/
│   ├── src/routes/        # auth.js, thumbnails.js, predictions.js, abtests.js
│   ├── src/models/        # Mongoose schemas: User.js, Thumbnail.js, ABTest.js
│   ├── src/middleware/    # auth.js (JWT/RBAC)
│   ├── src/config/        # db.js
│   └── tests/
├── ai-service/
│   ├── app/api/           # FastAPI routers
│   ├── app/services/      # cv_engine.py, scoring_engine.py, rag_explainer.py
│   ├── app/models/        # Pydantic schemas
│   └── tests/
├── frontend/src/
├── docs/PRD.md            # full project documentation
└── docker-compose.yml
```

## Roadmap (docs/PRD.md §13.2) — work in order
1. **Week 1–2 (current):** scope, scaffold, JWT auth, core Mongoose/data models, dataset-sourcing decision.
2. **Week 3–4:** CV feature extraction + `HeuristicCVScoringStrategy` (ai-service), wired to the Express API.
3. **Week 5–6:** A/B testing module, dashboard, RAG explanation engine, evaluation against §2.6/§11.
4. **Week 7:** Reporting/export (PDF/CSV), UI polish, accessibility pass.
5. **Week 8:** Final integration, deployment, model card, demo prep.

Don't jump ahead of the current week's scope unless explicitly asked — a mentor is tracking progress against this roadmap.

## Design Notes Worth Remembering
- CTR scoring is built behind a `CTRScoringStrategy` interface (Strategy pattern) so the MVP heuristic (`HeuristicCVScoringStrategy`) can later be swapped for `TrainedModelScoringStrategy` without touching callers — see ADR-001 in the PRD.
- The AI service is stateless and isolated from the web-facing layer on purpose (ADR-002): CV/LLM logic stays in Python, auth/API/DB stays in Node.
- Prediction scores must be deterministic — identical input features yield identical output scores.

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

## Current Scope Boundary
As of this file's creation, only the repository scaffold exists. Do **not** start building the CV scoring engine (`ai-service/app/services/cv_engine.py`, `scoring_engine.py`) or the A/B testing module until Week 3–4 / Week 5–6 respectively, per the roadmap above — unless the user explicitly asks to get ahead of schedule.
