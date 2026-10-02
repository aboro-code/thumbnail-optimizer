import httpx
import pytest

from app.services import knowledge_base
from app.services.knowledge_base import (
    KNOWLEDGE_BASE,
    _cosine_similarity,
    retrieve_relevant_passages,
)


@pytest.fixture(autouse=True)
def clear_embedding_cache():
    knowledge_base._embedding_cache.clear()
    yield
    knowledge_base._embedding_cache.clear()


class FakeEmbeddingResponse:
    def __init__(self, vector):
        self._vector = vector

    def raise_for_status(self):
        pass

    def json(self):
        return {"embedding": self._vector}


def test_cosine_similarity_of_identical_vectors_is_one():
    assert _cosine_similarity([1, 0, 0], [1, 0, 0]) == pytest.approx(1.0)


def test_cosine_similarity_of_orthogonal_vectors_is_zero():
    assert _cosine_similarity([1, 0], [0, 1]) == pytest.approx(0.0)


def test_cosine_similarity_handles_zero_vector():
    assert _cosine_similarity([0, 0, 0], [1, 2, 3]) == 0.0


def test_returns_empty_list_for_no_signals():
    assert retrieve_relevant_passages([]) == []


def test_returns_top_k_most_similar_passages(monkeypatch):
    # Build a fake embedding space: each KB entry gets a one-hot vector by
    # index, and the query vector matches the "contrast" entry's dimension
    # most strongly, so contrast should be retrieved first.
    dims = len(KNOWLEDGE_BASE)
    contrast_index = next(i for i, e in enumerate(KNOWLEDGE_BASE) if e["id"] == "contrast")

    def fake_embed(url, json, timeout):
        text = json["prompt"]
        vector = [0.0] * dims
        if text.startswith("Visual signals detected"):
            vector[contrast_index] = 1.0
        else:
            for i, entry in enumerate(KNOWLEDGE_BASE):
                if entry["text"] == text:
                    vector[i] = 1.0
                    break
        return FakeEmbeddingResponse(vector)

    monkeypatch.setattr(httpx, "post", fake_embed)

    results = retrieve_relevant_passages(["high-contrast image"], top_k=1)

    assert results == [KNOWLEDGE_BASE[contrast_index]["text"]]


def test_falls_back_to_empty_list_when_embeddings_are_unreachable(monkeypatch):
    def raise_connect_error(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx, "post", raise_connect_error)

    assert retrieve_relevant_passages(["clear focal face present"]) == []


def test_embedding_cache_avoids_redundant_calls(monkeypatch):
    call_count = {"n": 0}

    def fake_embed(url, json, timeout):
        call_count["n"] += 1
        return FakeEmbeddingResponse([1.0, 0.0])

    monkeypatch.setattr(httpx, "post", fake_embed)

    retrieve_relevant_passages(["high-contrast image"], top_k=1)
    calls_after_first = call_count["n"]
    retrieve_relevant_passages(["high-contrast image"], top_k=1)

    # The 8 KB passage embeddings should be cached after the first call, so
    # the second call only re-embeds the (identical, also now cached) query.
    assert call_count["n"] == calls_after_first
