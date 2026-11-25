import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { api, API_URL, clearToken, clearUser, getOptimizeSession, setOptimizeSession } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";
import { EmptyFilmArt } from "../components/Art";
import { CardGridSkeleton } from "../components/Skeleton";

function hasScore(item) {
  return item.ctr_score !== null && item.ctr_score !== undefined;
}

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// The score under a loupe, resting on the frame (D-48).
function ScoreBadge({ score }) {
  return (
    <span className={`loupe loupe-sm absolute right-1.5 top-1.5 ${score === null ? "text-[0.6rem] leading-tight" : ""}`}>
      {score === null ? (
        "Not scored"
      ) : (
        <>
          <span className="sr-only">Score </span>
          {score.toFixed(0)}
        </>
      )}
    </span>
  );
}

function StartTestForm({ items, onCreated, onUnauthorized }) {
  const [contentReference, setContentReference] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO(7));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await api.post("/abtests", {
        content_reference: contentReference,
        variant_thumbnail_ids: items.map((i) => i._id),
        start_date: startDate,
        end_date: endDate,
      });
      onCreated(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err.response?.data?.message || "Could not create the test.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="content_reference" className="text-sm font-medium">Link to the live post</label>
        <input
          id="content_reference"
          type="text"
          required
          placeholder="youtube.com/watch?v=…"
          value={contentReference}
          onChange={(e) => setContentReference(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="start_date" className="text-sm font-medium">Start date</label>
          <input
            id="start_date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="end_date" className="text-sm font-medium">End date</label>
          <input
            id="end_date"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">All {items.length} candidates above will be entered as variants.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {submitting ? "Starting…" : "Start test"}
      </button>
    </form>
  );
}

export default function OptimizePage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Two ways in:
  //  - /thumbnails/optimize: fresh results arrive as router state from the upload
  //    page; after a refresh that state is gone, so fall back to this tab's copy.
  //  - /thumbnails/:id/optimize: reopen any earlier batch, loaded from the server.
  const { id: batchThumbnailId } = useParams();
  const [session, setSession] = useState(() =>
    batchThumbnailId ? null : location.state?.items ? location.state : getOptimizeSession()
  );
  const [loadError, setLoadError] = useState("");
  const [scoring, setScoring] = useState(false);
  const items = session?.items;
  const contentTitle = session?.content_title;

  const [selectedId, setSelectedId] = useState(items?.[0]?._id);
  const [showTestForm, setShowTestForm] = useState(false);
  const [createdTest, setCreatedTest] = useState(session?.created_test || null);

  function handleUnauthorized() {
    clearToken();
    clearUser();
    navigate("/login", { replace: true });
  }

  async function loadBatch() {
    try {
      const res = await api.get(`/thumbnails/${batchThumbnailId}/batch`);
      setSession(res.data);
      setSelectedId((current) => current || res.data.items[0]?._id);
    } catch (err) {
      if (err.response?.status === 401) {
        handleUnauthorized();
        return;
      }
      setLoadError(err.response?.data?.message || "Could not load this batch. Is the backend running?");
    }
  }

  useEffect(() => {
    if (batchThumbnailId) loadBatch();
    // loadBatch only depends on the id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchThumbnailId]);

  useEffect(() => {
    if (!batchThumbnailId && session?.items) setOptimizeSession({ ...session, created_test: createdTest });
  }, [batchThumbnailId, session, createdTest]);

  // Scores arrive instantly; each LLM explanation is written afterwards, one at
  // a time (the local model handles one request at a time anyway) (D-47).
  const [explaining, setExplaining] = useState(null);
  const requested = useRef(new Set());
  useEffect(() => {
    const next = items?.find((i) => hasScore(i) && !i.explanation_text && !requested.current.has(i._id));
    if (!next || explaining) return;
    requested.current.add(next._id);
    setExplaining(next._id);
    api
      .post("/predictions/explain", { thumbnail_id: next._id })
      .then((res) => {
        setSession((current) =>
          current
            ? {
                ...current,
                items: current.items.map((i) =>
                  i._id === next._id ? { ...i, explanation_text: res.data.explanation_text } : i
                ),
              }
            : current
        );
      })
      .catch(() => {
        // leave it without a sentence; the signals are still shown
      })
      .finally(() => setExplaining(null));
  }, [items, explaining]);

  async function scoreBatch() {
    setScoring(true);
    setLoadError("");
    try {
      await api.post("/predictions/analyze", { thumbnail_ids: items.map((i) => i._id) });
      await loadBatch();
    } catch (err) {
      if (err.response?.status === 401) {
        handleUnauthorized();
        return;
      }
      setLoadError(err.response?.data?.message || "Scoring failed. Is the AI service running?");
    } finally {
      setScoring(false);
    }
  }

  if (batchThumbnailId && !session) {
    return (
      <div className="mx-auto min-h-screen max-w-5xl px-4 py-8">
        <header className="flex items-center justify-between">
          <Link to="/thumbnails" className="back-link">
            ← Thumbnails
          </Link>
          <ThemeToggle />
        </header>
        {loadError ? (
          <p role="alert" className="mt-8 text-sm text-destructive">{loadError}</p>
        ) : (
          <div className="mt-8">
            <CardGridSkeleton count={3} label="Loading batch" />
          </div>
        )}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <header className="flex items-center justify-between">
          <Link to="/dashboard" className="back-link">
            ← Dashboard
          </Link>
          <ThemeToggle />
        </header>
        <div className="mt-16 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <EmptyFilmArt className="mx-auto mb-4 w-48 max-w-full" />
          No thumbnails uploaded yet for this item.
          <div className="mt-4">
            <Link to="/thumbnails/new" className="text-primary hover:underline">
              Upload candidates
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const selected = items.find((i) => i._id === selectedId) || items[0];
  const unscored = items.filter((i) => !hasScore(i)).length;
  // A batch reopened later may already be in a test; don't offer a duplicate one.
  const alreadyTested = !createdTest && items.some((i) => i.status === "TESTING" || i.status === "COMPLETED");

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to={batchThumbnailId ? "/thumbnails" : "/dashboard"}
            className="back-link"
          >
            {batchThumbnailId ? "← Thumbnails" : "← Dashboard"}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{contentTitle || "Optimize candidates"}</h1>
        </div>
        <ThemeToggle />
      </header>

      {loadError && <p role="alert" className="mt-6 text-sm text-destructive">{loadError}</p>}

      {unscored > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <p className="text-sm">
            {unscored} of {items.length} {unscored === 1 ? "candidate hasn't" : "candidates haven't"} been scored yet.
          </p>
          <button
            type="button"
            onClick={scoreBatch}
            disabled={scoring}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {scoring ? "Scoring… (about 10 s per image)" : "Score now"}
          </button>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-label="Candidate gallery" className="light-table self-start rounded-lg border border-border p-3 sm:p-5">
          <ul className="film-strip grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3">
            {items.map((item, idx) => {
              const isSelected = item._id === selected._id;
              return (
                <li key={item._id} className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedId(item._id)}
                    aria-pressed={isSelected}
                    className={`relative block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                      isSelected ? "crop-marks" : "opacity-80 hover:opacity-100"
                    }`}
                  >
                    <div className="aspect-video w-full overflow-hidden bg-muted">
                      <img
                        src={`${API_URL}${item.image_url}`}
                        alt={
                          hasScore(item)
                            ? `Candidate ranked ${item.rank}, score ${item.ctr_score.toFixed(1)}`
                            : "Unscored candidate"
                        }
                        className="develop h-full w-full object-cover"
                        style={{ animationDelay: `${idx * 140}ms` }}
                      />
                    </div>
                    <ScoreBadge score={hasScore(item) ? item.ctr_score : null} />
                  </button>
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <span className="edge-print text-xs" aria-hidden="true">
                      {idx + 1}A
                    </span>
                    {item.rank === 1 && (
                      <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[0.7rem] font-bold text-primary-foreground">
                        Top pick
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <aside aria-label="Explanation" className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              {selected.rank ? `Ranked ${selected.rank} of ${items.filter(hasScore).length}` : "Not ranked yet"}
            </p>
            <p className="display text-5xl tabular-nums">
              {hasScore(selected) ? selected.ctr_score.toFixed(1) : "—"}
            </p>

            {selected.explanation_signals?.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {selected.explanation_signals.map((signal) => (
                  <li
                    key={signal}
                    className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {signal}
                  </li>
                ))}
              </ul>
            )}

            {selected.explanation_text ? (
              <p className="mt-3 text-sm text-foreground">{selected.explanation_text}</p>
            ) : (
              hasScore(selected) &&
              (explaining === selected._id || !requested.current.has(selected._id)) && (
                <p role="status" className="mt-3 animate-pulse text-sm text-muted-foreground">
                  Writing the explanation…
                </p>
              )
            )}
          </div>

          {createdTest ? (
            <div role="status" className="rounded-lg border border-chart-4 bg-card p-4 text-sm">
              <p className="font-medium text-chart-4">Test started</p>
              <p className="mt-1 text-muted-foreground">Status: {createdTest.status}.</p>
              <Link to={`/abtests/${createdTest.ab_test_id}`} className="mt-2 inline-block text-primary hover:underline">
                Go to test
              </Link>
            </div>
          ) : alreadyTested ? (
            <div className="rounded-lg border border-border bg-card p-4 text-sm">
              <p className="font-medium">Already in an A/B test</p>
              <Link to="/abtests" className="mt-2 inline-block text-primary hover:underline">
                See A/B tests
              </Link>
            </div>
          ) : unscored > 0 ? (
            <p className="text-sm text-muted-foreground">Score every candidate before starting an A/B test.</p>
          ) : showTestForm ? (
            <StartTestForm items={items} onCreated={setCreatedTest} onUnauthorized={handleUnauthorized} />
          ) : (
            <button
              type="button"
              onClick={() => setShowTestForm(true)}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Start A/B Test
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
