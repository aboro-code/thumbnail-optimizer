import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, clearToken, clearUser } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";
import ThumbnailCard from "../components/ThumbnailCard";
import { LoadingRegion, Skeleton } from "../components/Skeleton";

const RECENT_LIMIT = 6;

const NAV_LINKS = [
  { to: "/thumbnails", label: "Thumbnails" },
  { to: "/abtests", label: "A/B tests" },
  { to: "/reports", label: "Reports" },
];

function KpiTile({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AccuracyMeter({ correct, total }) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return (
    <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="accuracy-heading">
      <h2 id="accuracy-heading" className="text-sm font-medium">
        AI prediction accuracy
      </h2>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No completed A/B tests with every variant scored yet. Once one closes, this shows how often the AI's top pick won.
        </p>
      ) : (
        <>
          <p className="mt-2 text-3xl font-semibold">{pct}%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The AI's top pick won {correct} of {total} completed {total === 1 ? "test" : "tests"}
          </p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--chart-2)" }} />
          </div>
        </>
      )}
    </section>
  );
}

// Column per 10-point score band; one series, so no legend. Counts sit on the
// caps, and a visually hidden table carries the same numbers for screen readers.
function ScoreHistogram({ bins }) {
  const max = Math.max(0, ...bins.map((b) => b.count));
  const total = bins.reduce((sum, b) => sum + b.count, 0);

  return (
    <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="histogram-heading">
      <h2 id="histogram-heading" className="text-sm font-medium">
        Predicted score distribution
      </h2>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No scored thumbnails yet.</p>
      ) : (
        <>
          <div className="mt-4" aria-hidden="true">
            <div className="flex h-32 items-end gap-1 border-b border-border">
              {bins.map((b) => (
                <div
                  key={b.from}
                  className="flex h-full flex-1 flex-col items-center justify-end"
                  title={`${b.from}–${b.to}: ${b.count} ${b.count === 1 ? "thumbnail" : "thumbnails"}`}
                >
                  {b.count > 0 && <span className="mb-1 text-[11px] text-muted-foreground">{b.count}</span>}
                  <div
                    className="w-full max-w-[24px] rounded-t-[4px]"
                    style={{ height: `${(b.count / max) * 80}%`, background: "var(--chart-2)" }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1">
              {bins.map((b) => (
                <span key={b.from} className="flex-1 text-center text-[11px] text-muted-foreground">
                  {b.from}
                </span>
              ))}
            </div>
            <p className="mt-1 text-center text-xs text-muted-foreground">Predicted score (0–100)</p>
          </div>
          <table className="sr-only">
            <caption>Number of thumbnails per predicted score band</caption>
            <thead>
              <tr>
                <th scope="col">Score band</th>
                <th scope="col">Thumbnails</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((b) => (
                <tr key={b.from}>
                  <td>
                    {b.from} to {b.to}
                  </td>
                  <td>{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading dashboard" className="mt-8 flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </LoadingRegion>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [thumbnails, setThumbnails] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get("/dashboard/summary"), api.get("/thumbnails")])
      .then(([summaryRes, thumbsRes]) => {
        if (cancelled) return;
        setSummary(summaryRes.data);
        setThumbnails(thumbsRes.data.thumbnails);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) {
          clearToken();
          clearUser();
          navigate("/login", { replace: true });
          return;
        }
        setError("Could not load your dashboard. Is the backend running?");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function signOut() {
    clearToken();
    clearUser();
    navigate("/login", { replace: true });
  }

  const lift = summary?.avg_predicted_lift;

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">Thumbnail Optimizer</p>
          <h1 className="mt-1 text-2xl font-semibold">Dashboard</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Main" className="flex flex-wrap gap-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <Link
            to="/thumbnails/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            Upload thumbnails
          </Link>
          <ThemeToggle />
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
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

      {!error && !summary && <DashboardSkeleton />}

      {summary && thumbnails && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4" aria-label="Summary">
            <KpiTile
              label="Thumbnails scored"
              value={summary.thumbnails_scored}
              hint={`of ${summary.thumbnails_total} uploaded`}
            />
            <KpiTile label="Active A/B tests" value={summary.active_tests} hint={`${summary.completed_tests} completed`} />
            <KpiTile
              label="Avg. predicted lift"
              value={lift === null ? "—" : `+${lift.toFixed(1)}`}
              hint={lift === null ? "Needs a test with every variant scored" : "Score points: AI's top pick vs the rest"}
            />
            <KpiTile label="Reports generated" value={summary.reports_generated} hint="PDF and CSV exports" />
          </section>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <AccuracyMeter {...summary.prediction_accuracy} />
            <ScoreHistogram bins={summary.score_distribution} />
          </div>

          <section className="mt-10" aria-labelledby="recent-heading">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="recent-heading" className="text-lg font-semibold">
                Recent thumbnails
              </h2>
              {thumbnails.length > RECENT_LIMIT && (
                <Link to="/thumbnails" className="text-sm text-primary hover:underline">
                  View all {thumbnails.length} →
                </Link>
              )}
            </div>

            {thumbnails.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No thumbnails uploaded yet.{" "}
                <Link to="/thumbnails/new" className="text-primary hover:underline">
                  Upload candidates →
                </Link>
              </div>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {thumbnails.slice(0, RECENT_LIMIT).map((t) => (
                  <ThumbnailCard key={t._id} thumbnail={t} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

    </div>
  );
}

