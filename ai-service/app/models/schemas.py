from typing import List

from pydantic import BaseModel, Field


class ScoreResponse(BaseModel):
    ctr_score: float = Field(..., ge=0, le=100)
    explanation_signals: List[str]
