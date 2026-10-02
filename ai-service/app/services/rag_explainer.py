"""LLM-generated explanation text via a local Ollama model. Per docs/PRD.md §9.2.

Full RAG pipeline: knowledge_base.py retrieves the thumbnail best-practice
passages most relevant to what was actually detected, and this module asks
the local model to generate an explanation grounded in them - the retrieval
step is what keeps generation tied to real guidance instead of the model
free-associating. Both retrieval and generation run entirely on-machine via
Ollama's local server; no external API call is made.
"""

import httpx

from app.config import OLLAMA_MODEL, OLLAMA_TIMEOUT_SECONDS, OLLAMA_URL
from app.services.knowledge_base import retrieve_relevant_passages


def generate_explanation(ctr_score: float, explanation_signals: list) -> str:
    """Ask the local model for a plain-language sentence explaining the score.

    Falls back to a simple templated sentence built from the raw signals if
    the local model is unreachable or errors, per the PRD's §1.13 fallback
    strategy for LLM calls.
    """
    retrieved_passages = retrieve_relevant_passages(explanation_signals)

    context = ""
    if retrieved_passages:
        context = "Relevant design guidance:\n" + "\n".join(
            f"- {passage}" for passage in retrieved_passages
        ) + "\n\n"

    prompt = (
        f"{context}"
        f"A thumbnail image scored {ctr_score} out of 100 for predicted "
        f"click-through rate. Detected visual signals: {', '.join(explanation_signals)}. "
        "Using the design guidance above where relevant, write one short, "
        "plain-language sentence explaining this score to a content creator "
        "who is not technical."
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
