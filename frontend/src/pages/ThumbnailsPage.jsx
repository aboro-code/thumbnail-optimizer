import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, clearToken, clearUser } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";
import ThumbnailCard from "../components/ThumbnailCard";
import { THUMBNAIL_STATUSES, statusLabel } from "../components/StatusPill";
import { CardGridSkeleton } from "../components/Skeleton";

// PRD §3.1 /thumbnails: searchable grid, filterable by status.
// Search and filter live in the URL so they survive a refresh and can be shared.
export default function ThumbnailsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [thumbnails, setThumbnails] = useState(null);
  const [error, setError] = useState("");

  const query = searchParams.get("q") || "";
  const status = THUMBNAIL_STATUSES.includes(searchParams.get("status")) ? searchParams.get("status") : "";

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
          clearUser();
          navigate("/login", { replace: true });
          return;
        }
        setError("Could not load your thumbnails. Is the backend running?");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function updateParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  const counts = useMemo(() => {
    const byStatus = Object.fromEntries(THUMBNAIL_STATUSES.map((s) => [s, 0]));
    for (const t of thumbnails || []) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    return byStatus;
  }, [thumbnails]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (thumbnails || []).filter(
      (t) =>
        (!status || t.status === status) &&
        (!needle ||
          (t.content_title || "").toLowerCase().includes(needle) ||
          (t.target_platform || "").toLowerCase().includes(needle))
    );
  }, [thumbnails, query, status]);

  const filters = [{ value: "", label: "All", count: thumbnails?.length ?? 0 }].concat(
    THUMBNAIL_STATUSES.map((s) => ({ value: s, label: statusLabel(s), count: counts[s] }))
  );

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/dashboard" className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Thumbnails</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/thumbnails/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            Upload thumbnails
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {filters.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => updateParam("status", f.value)}
              className={`rounded-full border px-3 py-1 text-sm ${
                status === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label} <span className="font-mono text-xs tabular-nums">{f.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1 sm:w-64">
          <label htmlFor="thumbnail-search" className="sr-only">
            Search thumbnails
          </label>
          <input
            id="thumbnail-search"
            type="search"
            placeholder="Search by title or platform…"
            value={query}
            onChange={(e) => updateParam("q", e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-8 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && thumbnails === null && (
        <div className="mt-6">
          <CardGridSkeleton count={6} />
        </div>
      )}

      {thumbnails && (
        <>
          <p className="mt-4 text-xs text-muted-foreground" role="status">
            Showing {visible.length} of {thumbnails.length}
          </p>

          {thumbnails.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No thumbnails uploaded yet.{" "}
              <Link to="/thumbnails/new" className="text-primary hover:underline">
                Upload candidates →
              </Link>
            </div>
          ) : visible.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No thumbnails match these filters.{" "}
              <button
                type="button"
                onClick={() => setSearchParams({}, { replace: true })}
                className="text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((t) => (
                <ThumbnailCard key={t._id} thumbnail={t} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
