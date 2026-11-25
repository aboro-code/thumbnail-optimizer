from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.config import ALLOWED_CONTENT_TYPES, MAX_FILE_SIZE_BYTES, SCORING_STRATEGY
from app.models.schemas import ExplainRequest, ExplainResponse, ScoreResponse
from app.services.cv_engine import extract_thumbnail_features
from app.services.rag_explainer import generate_explanation
from app.services.scoring_engine import derive_explanation_signals
from app.services.trained_scoring import select_scoring_strategy

router = APIRouter(prefix="/api/v1", tags=["scoring"])

_scoring_strategy = select_scoring_strategy(SCORING_STRATEGY)


@router.post("/score", response_model=ScoreResponse)
async def score_thumbnail(
    file: UploadFile = File(...),
    content_title: Optional[str] = Form(None),
    explain: bool = Form(True),
):
    """Called internally by the Express backend for a single candidate thumbnail.

    Rank across a batch is computed by the caller, not here, so this service
    stays stateless per docs/PRD.md §5.2.

    With explain=false only the CV score and signals are returned (about 20 ms),
    so a batch is ranked well within BR-001's 5 seconds; the slower LLM sentence
    comes from /explain afterwards.
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
    explanation_text = (
        await run_in_threadpool(generate_explanation, ctr_score, explanation_signals) if explain else None
    )

    return ScoreResponse(
        ctr_score=ctr_score,
        explanation_signals=explanation_signals,
        explanation_text=explanation_text,
    )


@router.post("/explain", response_model=ExplainResponse)
async def explain_score(body: ExplainRequest):
    """Writes the plain-language explanation for a score that was already computed.

    Needs no image: the explanation is grounded only in the score and its
    signals, so the result is the same as the one /score would have produced.
    """
    text = await run_in_threadpool(generate_explanation, body.ctr_score, body.explanation_signals)
    return ExplainResponse(explanation_text=text)
