import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, clearToken, clearUser } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";
import { LoadingRegion, Skeleton } from "../components/Skeleton";

const INPUT_CLASS =
  "rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
const SECONDARY_BUTTON =
  "rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";

function ManagerView({ team, onChange, onError }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(team.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      onError("Couldn't copy. Select the code and copy it manually.");
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      await api.post("/team/invite-code");
      await onChange();
    } catch (err) {
      onError(err.response?.data?.message || "Could not create a new code.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(member) {
    setBusy(true);
    try {
      await api.delete(`/team/members/${member.id}`);
      await onChange();
    } catch (err) {
      onError(err.response?.data?.message || "Could not remove that member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="mt-8 rounded-lg border border-border bg-card p-5" aria-labelledby="code-heading">
        <h2 id="code-heading" className="text-sm font-medium">Team invite code</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Creators enter this when they sign up, or on their Team page, to join your team. You'll then see their
          thumbnails, tests and reports.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <code className="rounded-md border border-border bg-background px-4 py-2 font-mono text-xl font-semibold tracking-[0.3em]">
            {team.invite_code}
          </code>
          <button type="button" onClick={copyCode} className={SECONDARY_BUTTON}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={regenerate} disabled={busy} className={SECONDARY_BUTTON}>
            New code
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">A new code stops the old one working. Current members stay on the team.</p>
      </section>

      <section className="mt-6" aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-sm font-medium">
          Members <span className="font-mono text-xs text-muted-foreground">{team.members.length}</span>
        </h2>
        {team.members.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No creators on your team yet. Share the code above.
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {team.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name || m.email}</p>
                  {m.name && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                  {m.status === "deactivated" &&<p className="text-xs text-destructive">Deactivated</p>}
                </div>
                <button type="button" onClick={() => remove(m)} disabled={busy} className={SECONDARY_BUTTON}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function CreatorView({ team, onChange, onError }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function join(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/team/join", { invite_code: code });
      setCode("");
      await onChange();
    } catch (err) {
      onError(err.response?.data?.message || "Could not join that team.");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      await api.post("/team/leave");
      await onChange();
    } catch (err) {
      onError(err.response?.data?.message || "Could not leave the team.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-border bg-card p-5" aria-labelledby="my-team-heading">
      <h2 id="my-team-heading" className="text-sm font-medium">Your manager</h2>
      {team.manager ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{team.manager.name || team.manager.email}</p>
            {team.manager.name && <p className="text-xs text-muted-foreground">{team.manager.email}</p>}
            <p className="mt-1 text-xs text-muted-foreground">They can see your thumbnails, A/B tests and reports.</p>
          </div>
          <button type="button" onClick={leave} disabled={busy} className={SECONDARY_BUTTON}>
            Leave team
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            You're not on a team. Enter the code your manager gave you, or an admin can add you.
          </p>
          <form onSubmit={join} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="team-code" className="text-sm font-medium">Team code</label>
              <input
                id="team-code"
                type="text"
                required
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className={`${INPUT_CLASS} w-44 font-mono uppercase tracking-widest`}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              Join team
            </button>
          </form>
        </>
      )}
    </section>
  );
}

// /team: Managers share their invite code and manage members; Creators join or leave.
export default function TeamPage() {
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setActionError("");
    try {
      const res = await api.get("/team");
      setTeam(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        clearToken();
        clearUser();
        navigate("/login", { replace: true });
        return;
      }
      setError("Could not load your team. Is the backend running?");
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/dashboard" className="back-link">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Team</h1>
        </div>
        <ThemeToggle />
      </header>

      {error && <p role="alert" className="mt-8 text-sm text-destructive">{error}</p>}
      {actionError && <p role="alert" className="mt-6 text-sm text-destructive">{actionError}</p>}

      {!error && !team && (
        <LoadingRegion label="Loading team" className="mt-8">
          <Skeleton className="h-36 w-full" />
        </LoadingRegion>
      )}

      {team?.role === "Manager" && <ManagerView team={team} onChange={load} onError={setActionError} />}
      {team?.role === "Creator" && <CreatorView team={team} onChange={load} onError={setActionError} />}
      {team?.role === "Admin" && (
        <p className="mt-8 text-sm text-muted-foreground">
          Admins manage teams for everyone on the{" "}
          <Link to="/admin" className="text-primary hover:underline">Admin page</Link>.
        </p>
      )}
    </div>
  );
}
