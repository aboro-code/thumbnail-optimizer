from typing import List, Optional

from pydantic import BaseModel, Field


class ScoreResponse(BaseModel):
    ctr_score: float = Field(..., ge=0, le=100)
    explanation_signals: List[str]
    # None when the caller asked for the score only (explain=false); the
    # explanation is then fetched separately from /explain.
    explanation_text: Optional[str] = None


class ExplainRequest(BaseModel):
    ctr_score: float = Field(..., ge=0, le=100)
    explanation_signals: List[str] = Field(default_factory=list, max_length=20)


class ExplainResponse(BaseModel):
    explanation_text: str
