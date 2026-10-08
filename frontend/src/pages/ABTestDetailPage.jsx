import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, API_URL, clearToken, clearUser, getUser } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";

const PRIVILEGED_ROLES = ["Manager", "Admin"];

function VariantRow({ variant, abTestId, isWinner, onSaved, onUnauthorized }) {
  const thumb = variant.thumbnail_id; // populated by the backend
  const [impressions, setImpressions] = useState(variant.impressions);
  const [clicks, setClicks] = useState(variant.clicks);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = impressions !== variant.impressions || clicks !== variant.clicks;

  async function save() {
    setError("");
    setSaving(true);
    try {
      await api.patch(`/abtests/${abTestId}/variants/${variant._id}/metrics`, { impressions, clicks });
      onSaved();
    } catch (err) {
      if (err.response?.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err.response?.data?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className={`rounded-lg border p-4 ${isWinner ? "border-chart-4" : "border-border"} bg-card`}>
      <div className="flex gap-4">
        <div className="aspect-video w-32 flex-shrink-0 overflow-hidden rounded-md bg-muted">
          {thumb?.image_url && (
            <img src={`${API_URL}${thumb.image_url}`} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{thumb?.content_title || "Untitled"}</p>
            {isWinner && (
              <span className="rounded-full bg-chart-4 px-2 py-0.5 text-xs font-semibold text-background">
                Winner
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Impressions
              <input
                type="number"
                min={0}
                value={impressions}
                onChange={(e) => setImpressions(Number(e.target.value))}
                className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Clicks
              <input
                type="number"
                min={0}
                value={clicks}
                onChange={(e) => setClicks(Number(e.target.value))}
                className="w-28 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              />
            </label>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">
              CTR {(variant.measured_ctr * 100).toFixed(1)}%
            </p>
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </li>
  );
}

function CloseTestPanel({ abTestId, onClosed, onUnauthorized }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function close(status) {
    setError("");
    setSubmitting(true);
    try {
      const res = await api.patch(`/abtests/${abTestId}/status`, { status });
      onClosed(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err.response?.data?.message || "Could not close the test.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium">Close this test</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Declares a winner by the highest measured CTR and compares it against the original prediction.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => close("COMPLETED")}
          disabled={submitting}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Working…" : "Declare winner"}
        </button>
        <button
          type="button"
          onClick={() => close("CANCELLED")}
          disabled={submitting}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          Cancel test
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

export default function ABTestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [error, setError] = useState("");
  const [closeResult, setCloseResult] = useState(null);
  const user = getUser();

  const handleUnauthorized = useCallback(() => {
    clearToken();
    clearUser();
    navigate("/login", { replace: true });
  }, [navigate]);

  const load = useCallback(() => {
    api
      .get(`/abtests/${id}`)
      .then((res) => setTest(res.data))
      .catch((err) => {
        if (err.response?.status === 401) {
          handleUnauthorized();
          return;
        }
        if (err.response?.status === 403) {
          setError("You don't have access to this test.");
          return;
        }
        if (err.response?.status === 404) {
          setError("This test could not be found.");
          return;
        }
        setError("Could not load this test. Is the backend running?");
      });
  }, [id, handleUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/abtests" className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">
            ← A/B tests
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{test?.content_reference || "A/B test"}</h1>
        </div>
        <ThemeToggle />
      </header>

      {error && (
        <p role="alert" className="mt-8 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && !test && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

      {test && (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {test.status} · {new Date(test.start_date).toLocaleDateString()} –{" "}
            {new Date(test.end_date).toLocaleDateString()}
          </p>

          <ul className="mt-6 flex flex-col gap-4">
            {test.variants.map((variant) => (
              <VariantRow
                key={variant._id}
                variant={variant}
                abTestId={test._id}
                isWinner={test.winner_variant_id === variant._id}
                onSaved={load}
                onUnauthorized={handleUnauthorized}
              />
            ))}
          </ul>

          {closeResult && (
            <div className="mt-6 rounded-lg border border-chart-4 bg-card p-4 text-sm">
              <p className="font-medium text-chart-4">Test {closeResult.status.toLowerCase()}</p>
              {closeResult.status === "COMPLETED" && (
                <p className="mt-1 text-muted-foreground">
                  {closeResult.prediction_matched_winner === null
                    ? "The prediction can't be checked — not every variant was scored."
                    : closeResult.prediction_matched_winner
                      ? "The original prediction correctly picked the winner."
                      : "The original prediction did not match the actual winner."}
                </p>
              )}
            </div>
          )}

          {test.status === "RUNNING" && !closeResult && user && PRIVILEGED_ROLES.includes(user.role) && (
            <CloseTestPanel
              abTestId={test._id}
              onClosed={(data) => {
                setCloseResult(data);
                load();
              }}
              onUnauthorized={handleUnauthorized}
            />
          )}
        </>
      )}
    </div>
  );
}
