# Thumbnail Optimizer

> Predict, explain, and A/B-test candidate thumbnails before you publish — a full-stack MERN + Python AI application for content creators.

## Overview
Content creators routinely lose views to thumbnails chosen on instinct. Thumbnail Optimizer scores candidate thumbnails using computer vision, explains its reasoning in plain language, and lets creators validate the prediction with a built-in A/B testing workflow.

Full product/technical documentation lives in [`docs/PRD.md`](docs/PRD.md).

## Tech Stack
- **Frontend:** React, Tailwind CSS, Chart.js, Axios
- **Backend:** Node.js, Express, JWT auth, MongoDB (Mongoose)
- **AI Service:** Python, FastAPI, OpenCV, LangChain, OpenAI SDK
- **Database:** MongoDB

## Repository Structure
```
thumbnail-optimizer/
├── .github/workflows/   # CI pipeline
├── backend/             # Node.js + Express API
├── ai-service/          # Python FastAPI CV/RAG microservice
├── frontend/            # React + Tailwind SPA
├── docs/                # PRD and project documentation
└── docker-compose.yml
```

## Project Status
Currently in **Week 1–2** of the roadmap (see `docs/PRD.md` §13.2): scope finalization, repo scaffold, authentication, and core data models. The CV scoring engine and A/B testing module have not been built yet.

## Quick Start (Local Setup)

### Backend
```bash
cd backend
npm install
npm run dev
```

### AI Service
```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm start
```

### Via Docker Compose (once services are implemented)
```bash
docker-compose up --build -d
```
- Web Dashboard: `http://localhost:3000`
- API Docs: `http://localhost:5000/api-docs`

## License
Distributed under the MIT License. See `LICENSE` for details.
