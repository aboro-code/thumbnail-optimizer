from fastapi import FastAPI

from app.api.scoring import router as scoring_router

app = FastAPI(title="Thumbnail Optimizer AI Service", version="0.1.0")

app.include_router(scoring_router)


@app.get("/health")
def health():
    return {"status": "ok"}
