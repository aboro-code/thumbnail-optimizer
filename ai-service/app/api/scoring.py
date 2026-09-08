from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import ALLOWED_CONTENT_TYPES, MAX_FILE_SIZE_BYTES
from app.models.schemas import ScoreResponse

router = APIRouter(prefix="/api/v1", tags=["scoring"])


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

    raise HTTPException(status_code=501, detail="Not implemented yet")
