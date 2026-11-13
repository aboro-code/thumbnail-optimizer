import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, API_URL, clearToken, clearUser, getUser } from "../lib/api";
import { downloadReport } from "../lib/download";
import ThemeToggle from "../components/ThemeToggle";
import BarList from "../components/BarList";
import StatusPill from "../components/StatusPill";
import { LoadingRegion, Skeleton } from "../components/Skeleton";

const PRIVILEGED_ROLES = ["Manager", "Admin"];

function VariantRow({ variant, label, abTestId, isWinner, isPredicted, onSaved, onUnauthorized }) {
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
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="aspect-video w-full flex-shrink-0 overflow-hidden rounded-md bg-muted sm:w-32">
          {thumb?.image_url && (
            <img src={`${API_URL}${thumb.image_url}`} alt={thumb.content_title || "Variant thumbnail"} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              {label}
              <span className="font-normal text-muted-foreground"> · {thumb?.content_title || "Untitled"}</span>
            </p>
            {isPredicted && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-foreground">AI pick</span>
            )}
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

function ExportReport({ abTestId, onUnauthorized }) {
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState("");

  async function download(format) {
    setError("");
    setDownloading(format);
    try {
      await downloadReport(abTestId, format);
    } catch (err) {
      if (err.response?.status === 401) {
        onUnauthorized();
        return;
      }
      setError(`Could not export the ${format.toUpperCase()} report.`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Export report">
      <span className="text-xs text-muted-foreground">Export report:</span>
      {["pdf", "csv"].map((format) => (
        <button
          key={format}
          type="button"
          onClick={() => download(format)}
          disabled={downloading !== null}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {downloading === format ? "Preparing…" : format.toUpperCase()}
        </button>
      ))}
      {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}

const variantLabel = (idx) => `Variant ${String.fromCharCode(65 + idx)}`;

// The AI's pick = highest predicted score, but only when every variant was
// scored (same rule as the backend's prediction check).
function predictedIndex(variants) {
  if (variants.length === 0 || variants.some((v) => v.predicted_ctr_score === null)) return null;
  return variants.reduce((best, v, idx) => (v.predicted_ctr_score > variants[best].predicted_ctr_score ? idx : best), 0);
}

// Predicted vs actual, as two separate charts: the scales differ (score 0-100 vs
// CTR %), and putting them on one plot with two axes would invent a correlation.
function ResultsCharts({ test, predictedIdx }) {
  const completed = test.status === "COMPLETED";
  const winnerIdx = test.variants.findIndex((v) => v._id === test.winner_variant_id);

  const ctrRows = test.variants.map((v, idx) => ({
    key: v._id,
    label: variantLabel(idx),
    value: v.impressions > 0 ? v.measured_ctr * 100 : null,
    highlight: idx === winnerIdx,
    tag: idx === winnerIdx ? "Winner" : null,
  }));
  const scoreRows = test.variants.map((v, idx) => ({
    key: v._id,
    label: variantLabel(idx),
    value: v.predicted_ctr_score,
    highlight: idx === predictedIdx,
    tag: idx === predictedIdx ? "AI pick" : null,
  }));

  let verdict = null;
  if (completed && winnerIdx >= 0) {
    verdict =
      predictedIdx === null
        ? "The prediction can't be checked: not every variant was scored."
        : predictedIdx === winnerIdx
          ? `The AI picked the winner (${variantLabel(winnerIdx)}).`
          : `The AI picked ${variantLabel(predictedIdx)}, but ${variantLabel(winnerIdx)} won.`;
  }

  return (
    <section className="mt-6" aria-labelledby="results-heading">
      <h2 id="results-heading" className="text-lg font-semibold">
        Predicted vs actual
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <BarList title="Predicted score (0–100)" rows={scoreRows} max={100} formatValue={(v) => v.toFixed(1)} />
        <BarList
          title="Measured CTR"
          rows={ctrRows}
          formatValue={(v) => `${v.toFixed(2)}%`}
        />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {verdict || (completed ? "" : "The winner is declared when the test closes. Variants with no impressions show —.")}
      </p>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <LoadingRegion label="Loading A/B test" className="mt-6 flex flex-col gap-4">
      <Skeleton className="h-4 w-56" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </LoadingRegion>
  );
}

export default function ABTestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [error, setError] = useState("");
  const [closeResult, setCloseResult] = useState(null);
  const user = getUser();
  const predictedIdx = test ? predictedIndex(test.variants) : null;

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

      {!error && !test && <DetailSkeleton />}

      {test && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusPill status={test.status} />
            <span>
              {new Date(test.start_date).toLocaleDateString()} – {new Date(test.end_date).toLocaleDateString()}
            </span>
          </div>

          <ExportReport abTestId={test._id} onUnauthorized={handleUnauthorized} />

          <ResultsCharts test={test} predictedIdx={predictedIdx} />

          <h2 className="mt-8 text-lg font-semibold">Variants</h2>
          <ul className="mt-3 flex flex-col gap-4">
            {test.variants.map((variant, idx) => (
              <VariantRow
                key={variant._id}
                variant={variant}
                label={variantLabel(idx)}
                isPredicted={idx === predictedIdx}
                abTestId={test._id}
                isWinner={test.winner_variant_id === variant._id}
                onSaved={load}
                onUnauthorized={handleUnauthorized}
              />
            ))}
          </ul>

          {closeResult && (
            <div role="status" className="mt-6 rounded-lg border border-chart-4 bg-card p-4 text-sm">
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
