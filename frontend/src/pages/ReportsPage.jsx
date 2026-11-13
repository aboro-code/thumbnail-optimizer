import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, clearToken, clearUser, getUser } from "../lib/api";
import { downloadReport } from "../lib/download";
import ThemeToggle from "../components/ThemeToggle";
import { RowListSkeleton } from "../components/Skeleton";

const PRIVILEGED_ROLES = ["Manager", "Admin"];

// PRD §3.1 /reports: history of exported reports. Files aren't stored, so
// "Download again" regenerates the report from the test's current data.
export default function ReportsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(null);
  const [downloadError, setDownloadError] = useState("");
  const showExporter = PRIVILEGED_ROLES.includes(getUser()?.role);

  function handleUnauthorized() {
    clearToken();
    clearUser();
    navigate("/login", { replace: true });
  }

  function load() {
    return api
      .get("/reports")
      .then((res) => setReports(res.data.reports))
      .catch((err) => {
        if (err.response?.status === 401) {
          handleUnauthorized();
          return;
        }
        setError("Could not load your reports. Is the backend running?");
      });
  }

  useEffect(() => {
    load();
  }, []); // load once on mount

  async function downloadAgain(report) {
    setDownloadError("");
    setDownloading(report._id);
    try {
      await downloadReport(report.ab_test._id, report.format);
      await load(); // the new export is logged, so it appears at the top
    } catch (err) {
      if (err.response?.status === 401) {
        handleUnauthorized();
        return;
      }
      setDownloadError(`Could not download the ${report.format.toUpperCase()} report.`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/dashboard" className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Exported A/B test reports, newest first.</p>
        </div>
        <ThemeToggle />
      </header>

      {error && (
        <p role="alert" className="mt-8 text-sm text-destructive">
          {error}
        </p>
      )}
      {downloadError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {downloadError}
        </p>
      )}

      {!error && reports === null && (
        <div className="mt-8">
          <RowListSkeleton label="Loading reports" />
        </div>
      )}

      {reports && reports.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No reports exported yet. Open an{" "}
          <Link to="/abtests" className="text-primary hover:underline">
            A/B test
          </Link>{" "}
          and use "Export report".
        </div>
      )}

      {reports && reports.length > 0 && (
        <ul className="mt-8 flex flex-col gap-3">
          {reports.map((r) => (
            <li
              key={r._id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {r.ab_test ? (
                    <Link to={`/abtests/${r.ab_test._id}`} className="hover:text-primary hover:underline">
                      {r.ab_test.content_reference}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Test no longer exists</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono font-semibold uppercase text-foreground">{r.format}</span> ·{" "}
                  {new Date(r.created_at).toLocaleString()}
                  {showExporter && r.exported_by ? ` · ${r.exported_by}` : ""}
                </p>
              </div>
              {r.ab_test && (
                <button
                  type="button"
                  onClick={() => downloadAgain(r)}
                  disabled={downloading !== null}
                  className="self-start rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-50 sm:self-auto"
                >
                  {downloading === r._id ? "Preparing…" : "Download again"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
