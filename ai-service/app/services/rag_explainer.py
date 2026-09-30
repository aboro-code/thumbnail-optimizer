"""LLM-generated explanation text via a local Ollama model. Per docs/PRD.md §9.2.

This is generation only, for now - there is no retrieval/knowledge-base
grounding yet, so this is the "G" half of RAG, not the full pipeline.
Runs entirely on-machine (no external API call) via Ollama's local server.
"""

import httpx

from app.config import OLLAMA_MODEL, OLLAMA_TIMEOUT_SECONDS, OLLAMA_URL


def generate_explanation(ctr_score: float, explanation_signals: list) -> str:
    """Ask the local model for a plain-language sentence explaining the score.

    Falls back to a simple templated sentence built from the raw signals if
    the local model is unreachable or errors, per the PRD's §1.13 fallback
    strategy for LLM calls.
    """
    prompt = (
        f"A thumbnail image scored {ctr_score} out of 100 for predicted "
        f"click-through rate. Detected visual signals: {', '.join(explanation_signals)}. "
        "In one short, plain-language sentence, explain this score to a "
        "content creator who is not technical."
    )

    try:
        response = httpx.post(
            OLLAMA_URL,
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=OLLAMA_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        text = response.json()["response"].strip()
        if text:
            return text
    except (httpx.HTTPError, KeyError, ValueError):
        pass

    return _fallback_explanation(explanation_signals)


def _fallback_explanation(explanation_signals: list) -> str:
    if not explanation_signals:
        return "No strong visual signals were detected for this thumbnail."
    return "This score reflects: " + ", ".join(explanation_signals) + "."
