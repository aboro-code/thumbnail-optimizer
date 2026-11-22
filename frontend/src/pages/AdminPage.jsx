import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, clearToken, clearUser, getUser } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";
import BarList from "../components/BarList";
import { LoadingRegion, Skeleton } from "../components/Skeleton";

const TABS = [
  { id: "users", label: "Users" },
  { id: "analytics", label: "Analytics" },
  { id: "model", label: "Model" },
];
const ROLES = ["Creator", "Manager", "Admin"];
const SELECT_CLASS =
  "rounded-md border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";

function useAdminFetch(path) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get(path);
      setData(res.data);
      setError("");
    } catch (err) {
      if (err.response?.status === 401) {
        clearToken();
        clearUser();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        err.response?.status === 403
          ? "Your session doesn't have admin rights. Sign out and in again if your role just changed."
          : "Could not load this section. Is the backend running?"
      );
    }
  }, [path, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, reload: load };
}

function UsersTab() {
  const me = getUser();
  const { data, error, reload } = useAdminFetch("/admin/users");
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState({ text: "", isError: false });

  const managers = useMemo(() => (data?.users || []).filter((u) => u.role === "Manager"), [data]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.users || []).filter(
      (u) => !needle || u.email.toLowerCase().includes(needle) || (u.name || "").toLowerCase().includes(needle)
    );
  }, [data, query]);

  async function update(user, changes, description) {
    setSavingId(user.id);
    setMessage({ text: "", isError: false });
    try {
      await api.patch(`/admin/users/${user.id}`, changes);
      await reload();
      setMessage({ text: `${user.email}: ${description}.`, isError: false });
    } catch (err) {
      setMessage({ text: err.response?.data?.message || "Could not save that change.", isError: true });
    } finally {
      setSavingId(null);
    }
  }

  if (error) return <p role="alert" className="mt-6 text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <LoadingRegion label="Loading users" className="mt-6 flex flex-col gap-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </LoadingRegion>
    );
  }

  return (
    <section aria-label="Users" className="mt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {data.users.length} accounts. Role changes apply at the user's next sign-in.
        </p>
        <label htmlFor="user-search" className="sr-only">Search users</label>
        <input
          id="user-search"
          type="search"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-64"
        />
      </div>

      <p role="status" className={`mt-3 min-h-[1.25rem] text-sm ${message.isError ? "text-destructive" : "text-muted-foreground"}`}>
        {message.text}
      </p>

      <ul className="mt-1 divide-y divide-border rounded-lg border border-border bg-card">
        {visible.map((u) => {
          const isSelf = me?.id === String(u.id);
          const saving = savingId === u.id;
          return (
            <li key={u.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {u.name || u.email}
                  {isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {u.name ? `${u.email} · ` : ""}
                  {u.sign_in} · {u.thumbnails} {u.thumbnails === 1 ? "upload" : "uploads"} · joined{" "}
                  {new Date(u.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.email}</label>
                <select
                  id={`role-${u.id}`}
                  value={u.role}
                  disabled={saving || isSelf}
                  onChange={(e) => update(u, { role: e.target.value }, `role set to ${e.target.value}`)}
                  className={SELECT_CLASS}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>

                {u.role === "Creator" && (
                  <>
                    <label className="sr-only" htmlFor={`manager-${u.id}`}>Manager for {u.email}</label>
                    <select
                      id={`manager-${u.id}`}
                      value={u.manager_id || ""}
                      disabled={saving}
                      onChange={(e) =>
                        update(
                          u,
                          { manager_id: e.target.value || null },
                          e.target.value ? "assigned to a manager" : "removed from their team"
                        )
                      }
                      className={`${SELECT_CLASS} max-w-[12rem]`}
                    >
                      <option value="">No manager</option>
                      {managers.map((m) => (
                        <option key={m.id} value={m.id}>{m.name || m.email}</option>
                      ))}
                    </select>
                  </>
                )}

                <button
                  type="button"
                  disabled={saving || isSelf}
                  onClick={() =>
                    update(u, { active: !u.active }, u.active ? "deactivated" : "reactivated")
                  }
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                    u.active
                      ? "border-border bg-card hover:border-destructive hover:text-destructive"
                      : "border-destructive text-destructive hover:bg-card"
                  }`}
                >
                  {u.active ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </li>
          );
        })}
        {visible.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No users match.</li>}
      </ul>
    </section>
  );
}

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AnalyticsTab() {
  const { data, error } = useAdminFetch("/admin/analytics");

  if (error) return <p role="alert" className="mt-6 text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <LoadingRegion label="Loading analytics" className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
      </LoadingRegion>
    );
  }

  const acc = data.prediction_accuracy;
  const accuracy = acc.total ? `${Math.round((acc.correct / acc.total) * 100)}%` : "—";
  const exportsTotal = data.reports_exported.csv + data.reports_exported.pdf;

  return (
    <section aria-label="System analytics" className="mt-6 flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Tile label="Users" value={data.users.total} hint={data.users.inactive ? `${data.users.inactive} deactivated` : "All active"} />
        <Tile label="Thumbnails" value={data.thumbnails.total} hint={`${data.thumbnails.uploaded_last_7_days} in the last 7 days`} />
        <Tile label="AI accuracy" value={accuracy} hint={acc.total ? `Top pick won ${acc.correct} of ${acc.total} tests` : "No completed tests yet"} />
        <Tile label="Reports exported" value={exportsTotal} hint={`${data.reports_exported.pdf} PDF · ${data.reports_exported.csv} CSV`} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BarList
          title="Users by role"
          rows={ROLES.map((r) => ({ key: r, label: r, value: data.users.by_role[r] || 0 }))}
          formatValue={(v) => String(v)}
        />
        <BarList
          title="A/B tests by status"
          rows={[
            { key: "RUNNING", label: "Running", value: data.ab_tests.RUNNING },
            { key: "COMPLETED", label: "Completed", value: data.ab_tests.COMPLETED },
            { key: "CANCELLED", label: "Cancelled", value: data.ab_tests.CANCELLED },
          ]}
          formatValue={(v) => String(v)}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {data.thumbnails.scored} of {data.thumbnails.total} thumbnails scored · {data.predictions_total} predictions in total
        (re-scoring a thumbnail adds a new prediction).
      </p>
    </section>
  );
}

function StatusRow({ label, ok, detail }) {
  return (
    <li className="flex items-center justify-between gap-3 p-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
        <span className="h-2 w-2 rounded-full" style={{ background: ok ? "var(--chart-4)" : "var(--destructive)" }} aria-hidden="true" />
        {ok ? "OK" : "Problem"}
      </span>
    </li>
  );
}

function ModelTab() {
  const { data, error, reload } = useAdminFetch("/admin/model-info");

  if (error) return <p role="alert" className="mt-6 text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <LoadingRegion label="Checking the AI service" className="mt-6">
        <Skeleton className="h-48 w-full" />
      </LoadingRegion>
    );
  }

  if (!data.ai_service.reachable) {
    return (
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
        <StatusRow label="AI service" ok={false} detail="The backend can't reach the FastAPI service, so scoring will fail." />
      </ul>
    );
  }

  const llm = data.llm;
  return (
    <section aria-label="Model info" className="mt-6 flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Active scoring strategy</p>
        <p className="mt-1 font-mono text-xl font-semibold">{data.scoring_strategy}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.strategy_class} · set with SCORING_STRATEGY on the AI service (heuristic or trained)
        </p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        <StatusRow label="AI service" ok detail="FastAPI scoring service is responding" />
        <StatusRow label="Ollama (local LLM server)" ok={llm.reachable} detail={llm.provider} />
        <StatusRow
          label={`Explanation model: ${llm.model}`}
          ok={llm.model_installed}
          detail={llm.model_installed ? "Installed" : "Not installed: explanations fall back to a template sentence"}
        />
        <StatusRow
          label={`Embedding model: ${llm.embed_model}`}
          ok={llm.embed_model_installed}
          detail={llm.embed_model_installed ? "Installed (used to retrieve design guidance)" : "Not installed: explanations skip retrieval"}
        />
      </ul>
      <button
        type="button"
        onClick={reload}
        className="self-start rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary"
      >
        Check again
      </button>
    </section>
  );
}

// /admin (Admin only): user management, system analytics and model status.
// The tab lives in the URL (?tab=) so a refresh keeps it.
export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === searchParams.get("tab")) ? searchParams.get("tab") : "users";

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/dashboard" className="font-mono text-xs uppercase tracking-widest text-primary hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Admin</h1>
        </div>
        <ThemeToggle />
      </header>

      <div role="tablist" aria-label="Admin sections" className="mt-6 flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setSearchParams({ tab: t.id }, { replace: true })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "users" && <UsersTab />}
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "model" && <ModelTab />}
      </div>
    </div>
  );
}
