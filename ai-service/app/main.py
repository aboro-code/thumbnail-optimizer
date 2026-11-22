from fastapi import FastAPI

from app.api.model_info import router as model_info_router
from app.api.scoring import router as scoring_router

app = FastAPI(title="Thumbnail Optimizer AI Service", version="0.1.0")

app.include_router(scoring_router)
app.include_router(model_info_router)


@app.get("/health")
def health():
    return {"status": "ok"}
