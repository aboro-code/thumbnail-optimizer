import httpx
from fastapi import APIRouter

from app.api.scoring import _scoring_strategy
from app.config import OLLAMA_EMBED_MODEL, OLLAMA_MODEL, OLLAMA_URL, SCORING_STRATEGY

router = APIRouter(prefix="/api/v1", tags=["model-info"])

# /api/generate -> /api/tags on the same Ollama server
OLLAMA_TAGS_URL = OLLAMA_URL.rsplit("/api/", 1)[0] + "/api/tags"


def _installed_ollama_models():
    """Model names installed in Ollama, or None if Ollama can't be reached."""
    try:
        response = httpx.get(OLLAMA_TAGS_URL, timeout=3)
        response.raise_for_status()
        return [m["name"] for m in response.json().get("models", [])]
    except (httpx.HTTPError, KeyError, ValueError):
        return None


def _is_installed(name, installed):
    # Ollama reports "nomic-embed-text:latest" for "nomic-embed-text"
    wanted = name if ":" in name else f"{name}:latest"
    return wanted in installed


@router.get("/model-info")
def model_info():
    """Which scoring strategy is active and whether the local LLM is ready (admin page)."""
    installed = _installed_ollama_models()
    reachable = installed is not None
    return {
        "scoring_strategy": SCORING_STRATEGY,
        "strategy_class": type(_scoring_strategy).__name__,
        "llm": {
            "provider": "ollama (local)",
            "reachable": reachable,
            "model": OLLAMA_MODEL,
            "model_installed": reachable and _is_installed(OLLAMA_MODEL, installed),
            "embed_model": OLLAMA_EMBED_MODEL,
            "embed_model_installed": reachable and _is_installed(OLLAMA_EMBED_MODEL, installed),
        },
    }
