import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, clearToken, clearUser, setUser } from "../lib/api";
import Dialog from "../components/Dialog";
import PasswordInput from "../components/PasswordInput";
import ThemeToggle from "../components/ThemeToggle";
import { LoadingRegion, Skeleton } from "../components/Skeleton";

const INPUT_CLASS =
  "rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
const CONFIRM_WORD = "DELETE";

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function DeleteAccountDialog({ account, summary, onClose, onDeleted }) {
  const [secret, setSecret] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const usesPassword = account.sign_in === "password";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.delete("/auth/me", { data: usesPassword ? { password: secret } : { confirm_email: secret } });
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete your account.");
      setBusy(false);
    }
  }

  return (
    <Dialog title="Delete your account?" onClose={onClose}>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-4">
        <div className="text-sm text-muted-foreground">
          <p>This permanently deletes:</p>
          <ul className="mt-2 list-disc pl-5">
            <li>{plural(summary.thumbnails, "thumbnail")} and their scores</li>
            <li>{plural(summary.ab_tests, "A/B test")}</li>
            <li>{plural(summary.reports, "exported report")} in your history</li>
          </ul>
          {summary.team_members > 0 && (
            <p className="mt-2">
              Your {plural(summary.team_members, "team member")} keep their accounts and data. They just won&apos;t
              have a manager.
            </p>
          )}
          <p className="mt-2 font-medium text-foreground">This can&apos;t be undone.</p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="delete-secret" className="text-sm font-medium">
            {usesPassword ? "Your password" : "Your email address"}
          </label>
          {usesPassword ? (
            <PasswordInput
              id="delete-secret"
              autoComplete="current-password"
              required
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className={INPUT_CLASS}
            />
          ) : (
            <input
              id="delete-secret"
              type="email"
              required
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className={INPUT_CLASS}
            />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="delete-confirm" className="text-sm font-medium">
            Type <span className="font-mono">{CONFIRM_WORD}</span> to confirm
          </label>
          <input
            id="delete-confirm"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || typed !== CONFIRM_WORD || !secret}
            className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {busy ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default function AccountPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [summary, setSummary] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [me, sum] = await Promise.all([api.get("/auth/me"), api.get("/auth/me/summary")]);
      setAccount({ ...me.data.user, sign_in: me.data.sign_in });
      setUser(me.data.user);
      setSummary(sum.data);
    } catch (err) {
      if (err.response?.status === 401) {
        clearToken();
        clearUser();
        navigate("/login", { replace: true });
        return;
      }
      setError("Could not load your account.");
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  function onDeleted() {
    clearToken();
    clearUser();
    navigate("/login", { replace: true, state: { notice: "Your account was deleted." } });
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <ThemeToggle />
      </header>
      <h1 className="mt-6 text-2xl font-semibold">Account</h1>

      {error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {error}
        </p>
      )}

      {!account && !error && (
        <LoadingRegion label="Loading your account" className="mt-8">
          <Skeleton className="h-32" />
        </LoadingRegion>
      )}

      {account && (
        <>
          <section className="mt-8 rounded-lg border border-border bg-card p-5" aria-labelledby="profile-heading">
            <h2 id="profile-heading" className="text-sm font-medium">
              Profile
            </h2>
            <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{account.name || "—"}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{account.email}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd>{account.role}</dd>
              <dt className="text-muted-foreground">Sign-in</dt>
              <dd>{account.sign_in === "password" ? "Email and password" : "Google"}</dd>
            </dl>
          </section>

          <section className="mt-6 rounded-lg border border-destructive bg-card p-5" aria-labelledby="danger-heading">
            <h2 id="danger-heading" className="text-sm font-medium">
              Delete account
            </h2>
            {account.role === "Admin" ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Admin accounts can&apos;t be deleted here, so the app is never left without an administrator.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Permanently removes your account, your thumbnails, scores, A/B tests and report history.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="mt-4 rounded-md border border-destructive px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Delete my account…
                </button>
              </>
            )}
          </section>
        </>
      )}

      {confirming && summary && (
        <DeleteAccountDialog
          account={account}
          summary={summary}
          onClose={() => setConfirming(false)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}
