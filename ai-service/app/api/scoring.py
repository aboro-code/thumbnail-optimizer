from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import ALLOWED_CONTENT_TYPES, MAX_FILE_SIZE_BYTES
from app.models.schemas import ScoreResponse
from app.services.cv_engine import extract_thumbnail_features
from app.services.scoring_engine import HeuristicCVScoringStrategy, derive_explanation_signals

router = APIRouter(prefix="/api/v1", tags=["scoring"])

_scoring_strategy = HeuristicCVScoringStrategy()


@router.post("/score", response_model=ScoreResponse)
async def score_thumbnail(
    file: UploadFile = File(...),
    content_title: Optional[str] = Form(None),
):
    """Called internally by the Express backend for a single candidate thumbnail.

    Rank across a batch is computed by the caller, not here, so this service
    stays stateless per docs/PRD.md §5.2.
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Only image/jpeg, image/png, and image/webp files are accepted",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File must be 10MB or smaller")

    buffer = np.frombuffer(contents, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode image file")

    features = extract_thumbnail_features(image)
    ctr_score = _scoring_strategy.score(features)
    explanation_signals = derive_explanation_signals(features)

    return ScoreResponse(ctr_score=ctr_score, explanation_signals=explanation_signals)
