# Thumbnail Optimizer

> Predict, explain, and A/B-test candidate thumbnails before you publish: a full-stack MERN + Python AI application for content creators.

## Overview
Content creators routinely lose views to thumbnails chosen on instinct. Thumbnail Optimizer:

1. **Predicts:** scores each candidate thumbnail 0–100 from computer-vision features (contrast, colour vividness, face presence, clutter) and ranks them.
2. **Explains:** turns the features into plain-language signals and writes a short explanation with a **local** LLM, grounded in design guidelines (RAG).
3. **Validates:** runs an A/B test on the candidates, records impressions and clicks, declares the winner by measured CTR, and records whether the AI's prediction was right.

Full product and technical documentation lives in [`docs/PRD.md`](docs/PRD.md).

## Architecture
```
Browser (React, :5173) ──REST + JWT──▶ Express API (:5000) ──▶ MongoDB (:27017)
                                            │ internal HTTP
                                            ▼
                                   FastAPI AI service (:8000) ──▶ Ollama (:11434)
                                   OpenCV features → score →      llama3.2:1b
                                   signals → RAG explanation      nomic-embed-text
```
The frontend only talks to Express. The AI service is stateless and never touches the database (ADR-002).

## Tech Stack
- **Frontend:** React 18 + Vite, React Router, Tailwind CSS v3, Axios
- **Backend:** Node.js 20, Express, Mongoose, JWT + bcrypt, Google sign-in, Multer, express-rate-limit
- **AI service:** Python 3.10+, FastAPI, OpenCV, NumPy, httpx
- **LLM:** Ollama running locally: `llama3.2:1b` (generation) and `nomic-embed-text` (retrieval embeddings). No external AI API.
- **Database:** MongoDB
- **Tests / CI:** Jest + Supertest + mongodb-memory-server, pytest, GitHub Actions

## Scoring models
Scoring sits behind a `CTRScoringStrategy` interface (ADR-001), selected with `SCORING_STRATEGY`:

| Strategy | What it is | Status |
|---|---|---|
| `heuristic` | Hand-weighted formula over the four CV features | **Default** |
| `trained` | Pairwise (Bradley-Terry) model trained on a thumbnail preference survey | Available; scored lower than the heuristic in leave-one-out evaluation (9/17 vs 12/17 pairs) |

The training pipeline is in `ai-service/training/` (dataset → train → evaluate); see [`ai-service/data/README.md`](ai-service/data/README.md) for the dataset structure.

## Repository Structure
```
thumbnail-optimizer/
├── .github/workflows/ci.yml   # backend, ai-service and frontend jobs
├── backend/                   # Express API: auth, thumbnails, predictions, A/B tests
│   ├── src/                   # server.js, routes/, models/, middleware/, utils/, services/
│   ├── scripts/create-admin.js
│   └── tests/
├── ai-service/                # FastAPI CV + scoring + RAG service
│   ├── app/                   # api/, services/, models/, config.py
│   ├── training/              # build_dataset.py, train.py, evaluate.py
│   ├── artifacts/             # trained model weights (JSON)
│   ├── data/                  # survey dataset (raw data is gitignored)
│   └── tests/
├── frontend/src/              # pages/, components/, lib/
├── docs/                      # PRD.md, DEPLOYMENT.md, MODEL_CARD.md
├── docker-compose.yml         # full stack: mongo, ollama, ai-service, backend, frontend (nginx)
└── docker-compose.https.yml   # optional Caddy HTTPS front for a public server
```

## Roles and teams
- **Creator:** uploads, scores and tests their own thumbnails. Can join a manager's team with an invite code, at sign-up or on the Team page.
- **Manager:** sees their own data plus their team's. Shares an invite code and can close A/B tests for the team.
- **Admin:** sees everything. On the Admin page they manage users (role, team, deactivate), view system analytics, and check the model and LLM status. Admins can't sign up; they are created with `scripts/create-admin.js`.

## Quick Start with Docker (recommended)
```bash
cp .env.example .env              # set JWT_SECRET
docker compose up -d --build      # first run also downloads the Ollama models
docker compose exec backend node scripts/create-admin.js you@example.com
```
Then open http://localhost:8080. To deploy to a cloud VM with HTTPS, see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Quick Start (without Docker)

**Prerequisites:** Node.js 20.19+, Python 3.10+, MongoDB (e.g. Docker), [Ollama](https://ollama.com).

```bash
# 1. MongoDB
docker run -d --name thumbnail-mongo -p 27017:27017 mongo:7    # first time; later: docker start thumbnail-mongo

# 2. Ollama models
ollama pull llama3.2:1b
ollama pull nomic-embed-text

# 3. Backend (http://localhost:5000)
cd backend
cp .env.example .env            # set JWT_SECRET (and GOOGLE_CLIENT_ID for Google sign-in)
npm install
npm run dev

# 4. AI service (http://localhost:8000)
cd ai-service
python -m venv .venv
.venv\Scripts\activate          # Windows; source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload

# 5. Frontend (http://localhost:5173)
cd frontend
cp .env.example .env
npm install
npm run dev
```

Create an Admin account (Admins can't sign up through the website):
```bash
cd backend && npm run create-admin -- you@example.com
```

The first explanation after starting takes ~30 s while the embedding cache warms up; later ones take a few seconds. If Ollama isn't running, scoring still works and explanations fall back to a template sentence.

## Training pipeline
From `ai-service/`, with the survey export in `data/raw/` and pair images in `data/images/`:
```bash
python -m training.build_dataset   # → data/processed/pairs.csv
python -m training.train           # → artifacts/pairwise_model.json
python -m training.evaluate        # trained vs heuristic vs baseline
```

## API overview
All routes are under `/api/v1` and, apart from signup/login/Google, need `Authorization: Bearer <JWT>`.

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/signup`, `/auth/login`, `/auth/google` | Get a JWT |
| PATCH | `/auth/profile` | Complete a Google user's profile |
| POST | `/thumbnails/upload` | Upload 2–10 images (validated by file signature) |
| GET | `/thumbnails`, `/thumbnails/:id` | List / view thumbnails |
| GET | `/thumbnails/:id/batch` | The batch a thumbnail was uploaded with, ranked by latest score (for reopening it in Optimize) |
| POST | `/predictions/analyze` | Score and rank a set of thumbnails |
| POST, GET | `/abtests`, `/abtests/:id` | Create / list / view A/B tests |
| PATCH | `/abtests/:id/variants/:variantId/metrics` | Record impressions and clicks |
| PATCH | `/abtests/:id/status` | Close a test and declare the winner (Manager for their team, Admin) |
| GET | `/reports/:abTestId/export?format=pdf\|csv` | Download an A/B test report (thumbnails, predictions, results) |
| GET | `/reports` | History of exported reports |
| GET | `/dashboard/summary` | Dashboard metrics: scored count, active tests, avg. predicted lift, AI accuracy, reports, score distribution |
| GET | `/team` | Manager: invite code + members. Creator: their manager |
| POST | `/team/join`, `/team/leave` | Creator joins (with an invite code) or leaves a team |
| POST, DELETE | `/team/invite-code`, `/team/members/:id` | Manager: new invite code / remove a member |
| GET, PATCH | `/admin/users`, `/admin/users/:id` | Admin: list users; change role, manager or active status |
| GET | `/admin/analytics`, `/admin/model-info` | Admin: system totals; active scoring strategy and Ollama status |

## Tests
```bash
cd backend && npx jest --runInBand
cd ai-service && pytest -q
cd frontend && npm run build
```

## Project Status
Weeks 1–6 of the roadmap (`docs/PRD.md` §13.2) are complete, plus the model-training pipeline. Week 7 is done: PDF/CSV export with a report history, the full PRD §3.1 page set (dashboard metrics, thumbnails, A/B tests, reports), predicted-vs-actual charts, loading skeletons, and an accessibility pass (WCAG AA contrast, keyboard focus, screen-reader labels). Week 8 adds:
- the full stack in Docker Compose, plus an HTTPS option for a cloud VM ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md));
- email sign-up;
- manager–creator teams;
- the Admin page;
- reopening any upload batch in Optimize;
- a [model card](docs/MODEL_CARD.md).
