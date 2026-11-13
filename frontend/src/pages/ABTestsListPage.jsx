import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, clearToken, clearUser } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";
import StatusPill from "../components/StatusPill";
import { RowListSkeleton } from "../components/Skeleton";

export default function ABTestsListPage() {
  const navigate = useNavigate();
  const [tests, setTests] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/abtests")
      .then((res) => {
        if (!cancelled) setTests(res.data.ab_tests);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) {
          clearToken();
          clearUser();
          navigate("/login", { replace: true });
          return;
        }
        setError("Could not load A/B tests. Is the backend running?");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/dashboard" className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">A/B tests</h1>
        </div>
        <ThemeToggle />
      </header>

      {error && (
        <p role="alert" className="mt-8 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && tests === null && (
        <div className="mt-8">
          <RowListSkeleton label="Loading A/B tests" />
        </div>
      )}

      {tests && tests.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No A/B tests yet. Start one from a candidate's optimize page.
        </div>
      )}

      {tests && tests.length > 0 && (
        <ul className="mt-8 flex flex-col gap-3">
          {tests.map((t) => (
            <li key={t._id}>
              <Link
                to={`/abtests/${t._id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 hover:border-primary"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.content_reference}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t.variant_count} variants · {new Date(t.start_date).toLocaleDateString()} –{" "}
                    {new Date(t.end_date).toLocaleDateString()}
                  </p>
                </div>
                <StatusPill status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
