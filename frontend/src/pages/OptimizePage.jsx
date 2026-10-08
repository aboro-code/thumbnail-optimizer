import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { api, API_URL, clearToken, clearUser } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function ScoreBadge({ score, rank }) {
  return (
    <div className="absolute left-2 top-2 flex items-center gap-1.5">
      <span className="rounded-full bg-background/90 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums">
        {score.toFixed(1)}
      </span>
      {rank === 1 && (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
          Top pick
        </span>
      )}
    </div>
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
  const items = location.state?.items;
  const contentTitle = location.state?.content_title;

  const [selectedId, setSelectedId] = useState(items?.[0]?._id);
  const [showTestForm, setShowTestForm] = useState(false);
  const [createdTest, setCreatedTest] = useState(null);

  if (!items || items.length === 0) {
    return (
      <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <header className="flex items-center justify-between">
          <Link to="/dashboard" className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">
            ← Dashboard
          </Link>
          <ThemeToggle />
        </header>
        <div className="mt-16 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No thumbnails uploaded yet for this item.
          <div className="mt-4">
            <Link to="/thumbnails/new" className="text-primary hover:underline">
              Upload candidates →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const selected = items.find((i) => i._id === selectedId) || items[0];

  function handleUnauthorized() {
    clearToken();
    clearUser();
    navigate("/login", { replace: true });
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/dashboard" className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{contentTitle || "Optimize candidates"}</h1>
        </div>
        <ThemeToggle />
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-label="Candidate gallery">
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {items.map((item) => (
              <li key={item._id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item._id)}
                  className={`relative block w-full overflow-hidden rounded-lg border bg-card text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                    item._id === selected._id ? "border-primary ring-2 ring-primary" : "border-border"
                  }`}
                >
                  <div className="aspect-video w-full bg-muted">
                    <img
                      src={`${API_URL}${item.image_url}`}
                      alt={item.content_title || "Candidate thumbnail"}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <ScoreBadge score={item.ctr_score} rank={item.rank} />
                  <span className="absolute bottom-2 right-2 rounded-full bg-background/90 px-2 py-0.5 font-mono text-xs">
                    #{item.rank}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <aside aria-label="Explanation" className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Rank #{selected.rank} · Score</p>
            <p className="font-mono text-3xl font-semibold tabular-nums">{selected.ctr_score.toFixed(1)}</p>

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

            {selected.explanation_text && (
              <p className="mt-3 text-sm text-foreground">{selected.explanation_text}</p>
            )}
          </div>

          {createdTest ? (
            <div className="rounded-lg border border-chart-4 bg-card p-4 text-sm">
              <p className="font-medium text-chart-4">Test started</p>
              <p className="mt-1 text-muted-foreground">Status: {createdTest.status}.</p>
              <Link to={`/abtests/${createdTest.ab_test_id}`} className="mt-2 inline-block text-primary hover:underline">
                Go to test →
              </Link>
            </div>
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
