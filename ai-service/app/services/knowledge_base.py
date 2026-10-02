"""Thumbnail best-practices knowledge base, retrieved via local embeddings.

Per docs/PRD.md §9.2/§9.3 - a small internal KB of design guidance. This is
the "R" (Retrieval) half of RAG: the generator in rag_explainer.py asks here
first for the passages most relevant to what was actually detected in the
image, then grounds its explanation in them instead of generating from
nothing. Retrieval runs via a local Ollama embedding model, so, like
generation, no call leaves the machine.
"""

import math

import httpx

from app.config import OLLAMA_EMBED_MODEL, OLLAMA_EMBED_URL, OLLAMA_TIMEOUT_SECONDS, RETRIEVAL_TOP_K

KNOWLEDGE_BASE = [
    {
        "id": "contrast",
        "text": (
            "High contrast between a thumbnail's subject and its background is one of "
            "the most reliable ways to grab attention in a crowded feed, since the eye "
            "is drawn to strong light/dark separation before it processes color or detail. "
            "Low-contrast, washed-out compositions tend to blend into a scrolling feed and "
            "get scrolled past."
        ),
    },
    {
        "id": "vividness",
        "text": (
            "Saturated, vivid colors stand out more than muted or desaturated palettes, "
            "especially at the small sizes thumbnails are typically viewed at. Over-"
            "desaturated or grey-toned images can read as low-energy, even when the "
            "content itself is strong."
        ),
    },
    {
        "id": "face_present",
        "text": (
            "A clear, well-lit human face is one of the strongest attention cues in any "
            "image, drawing on a well-documented perceptual bias toward faces. A thumbnail "
            "with an expressive, unobstructed face creates an emotional hook that a static "
            "product shot or text-only thumbnail typically lacks."
        ),
    },
    {
        "id": "face_absent",
        "text": (
            "A thumbnail without a visible face isn't automatically weaker, but it loses a "
            "strong built-in attention cue and needs to compensate with a clear focal "
            "subject, bold color, or legible text to hold attention instead."
        ),
    },
    {
        "id": "clutter_high",
        "text": (
            "A cluttered composition with many competing visual elements forces the eye to "
            "work to find a focal point, which hurts a thumbnail's ability to communicate "
            "instantly at a glance. Simpler compositions with one dominant subject are "
            "easier to parse in the fraction of a second a viewer actually looks at a "
            "thumbnail."
        ),
    },
    {
        "id": "clutter_low",
        "text": (
            "A clean composition with a single clear focal point reads instantly, which "
            "matters because viewers decide whether to click in a fraction of a second "
            "while scrolling past."
        ),
    },
    {
        "id": "composition",
        "text": (
            "Placing the main subject off-center, loosely following the rule of thirds, "
            "tends to feel more dynamic and professional than a perfectly centered subject "
            "- though centering works well when paired with strong symmetry or a direct, "
            "face-forward shot."
        ),
    },
    {
        "id": "text_legibility",
        "text": (
            "Any text overlaid on a thumbnail needs to stay legible at small sizes, which "
            "usually means large, bold lettering with strong contrast against its "
            "background. Thin or low-contrast text tends to disappear at the sizes most "
            "viewers actually see."
        ),
    },
]

_embedding_cache = {}


def _embed(text: str) -> list:
    if text in _embedding_cache:
        return _embedding_cache[text]

    response = httpx.post(
        OLLAMA_EMBED_URL,
        json={"model": OLLAMA_EMBED_MODEL, "prompt": text},
        timeout=OLLAMA_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    embedding = response.json()["embedding"]

    _embedding_cache[text] = embedding
    return embedding


def _cosine_similarity(a: list, b: list) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def retrieve_relevant_passages(explanation_signals: list, top_k: int = RETRIEVAL_TOP_K) -> list:
    """Return the top_k KB passages most relevant to the detected signals.

    Returns an empty list - not an error - if the embedding model is
    unreachable, so callers can fall back to ungrounded generation rather
    than failing the whole request.
    """
    if not explanation_signals:
        return []

    query = "Visual signals detected in this thumbnail: " + ", ".join(explanation_signals)

    try:
        query_embedding = _embed(query)
        scored = [
            (entry, _cosine_similarity(query_embedding, _embed(entry["text"])))
            for entry in KNOWLEDGE_BASE
        ]
    except (httpx.HTTPError, KeyError, ValueError):
        return []

    scored.sort(key=lambda pair: pair[1], reverse=True)
    return [entry["text"] for entry, _score in scored[:top_k]]
