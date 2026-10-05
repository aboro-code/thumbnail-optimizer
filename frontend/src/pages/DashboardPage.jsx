import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, API_URL, clearToken } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";

const STATUS_STYLES = {
  UPLOADED: { label: "Uploaded", color: "var(--muted-foreground)" },
  SCORED: { label: "Scored", color: "var(--chart-2)" },
  TESTING: { label: "Testing", color: "var(--chart-3)" },
  COMPLETED: { label: "Completed", color: "var(--chart-4)" },
};

const RECENT_LIMIT = 12;

function StatusPill({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.UPLOADED;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium"
      style={{ color: style.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color }} aria-hidden="true" />
      {style.label}
    </span>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [thumbnails, setThumbnails] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/thumbnails")
      .then((res) => {
        if (!cancelled) setThumbnails(res.data.thumbnails);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) {
          clearToken();
          navigate("/login", { replace: true });
          return;
        }
        setError("Could not load your thumbnails. Is the backend running?");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function signOut() {
    clearToken();
    navigate("/login", { replace: true });
  }

  const count = (status) => (thumbnails || []).filter((t) => t.status === status).length;

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Thumbnail Optimizer</p>
          <h1 className="mt-1 text-2xl font-semibold">Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-8 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && thumbnails === null && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

      {thumbnails && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Summary">
            <SummaryCard label="Total thumbnails" value={thumbnails.length} />
            <SummaryCard label="Scored" value={count("SCORED")} />
            <SummaryCard label="Testing" value={count("TESTING")} />
            <SummaryCard label="Completed" value={count("COMPLETED")} />
          </section>

          <section className="mt-10" aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="text-lg font-semibold">Recent thumbnails</h2>

            {thumbnails.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No thumbnails uploaded yet.
              </div>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {thumbnails.slice(0, RECENT_LIMIT).map((t) => (
                  <li key={t._id} className="overflow-hidden rounded-lg border border-border bg-card">
                    <div className="aspect-video w-full bg-muted">
                      <img
                        src={`${API_URL}${t.image_url}`}
                        alt={t.content_title || "Uploaded thumbnail"}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{t.content_title || "Untitled"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(t.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusPill status={t.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
