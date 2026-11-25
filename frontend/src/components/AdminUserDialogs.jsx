import { useEffect, useState } from "react";

import { api } from "../lib/api";
import Dialog from "./Dialog";
import { Skeleton } from "./Skeleton";

const SELECT_CLASS =
  "rounded-md border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
const INPUT_CLASS =
  "rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
const DIALOG_BUTTONS = "mt-5 flex justify-end gap-2";
const CANCEL_BUTTON =
  "rounded-md border border-border px-3 py-2 text-sm font-medium hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
const PRIMARY_BUTTON =
  "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";
const DANGER_BUTTON =
  "rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function displayName(user) {
  return user.name || user.email;
}

// Demoting a Manager who still has creators (D-46): move them or release them.
export function TeamDecisionDialog({ user, newRole, managers, onCancel, onConfirm }) {
  const others = managers.filter((m) => m.id !== user.id && m.status !== "deactivated");
  const [choice, setChoice] = useState(others.length ? "move" : "release");
  const [target, setTarget] = useState(others[0]?.id || "");

  function confirm() {
    onConfirm(choice === "move" ? { reassign_to: target } : { release_team: true });
  }

  return (
    <Dialog title={`Change ${displayName(user)} to ${newRole}?`} onClose={onCancel}>
      <p className="mt-3 text-sm text-muted-foreground">
        {displayName(user)} manages {plural(user.team_size, "creator")}. What should happen to them?
      </p>
      <fieldset className="mt-4 flex flex-col gap-3">
        <legend className="sr-only">Team members</legend>
        <div className={`flex items-start gap-2 text-sm ${others.length ? "" : "opacity-60"}`}>
          <input
            id="team-move"
            type="radio"
            name="team-choice"
            disabled={!others.length}
            checked={choice === "move"}
            onChange={() => setChoice("move")}
            className="mt-1"
          />
          <div className="flex-1">
            <label htmlFor="team-move">Move them to another manager</label>
            {!others.length && <p className="text-xs text-muted-foreground">There are no other active managers.</p>}
            {choice === "move" && others.length > 0 && (
              <>
                <label htmlFor="move-target" className="sr-only">
                  New manager
                </label>
                <select
                  id="move-target"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={`${SELECT_CLASS} mt-2 block w-full`}
                >
                  {others.map((m) => (
                    <option key={m.id} value={m.id}>
                      {displayName(m)}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2 text-sm">
          <input
            id="team-release"
            type="radio"
            name="team-choice"
            checked={choice === "release"}
            onChange={() => setChoice("release")}
            className="mt-1"
          />
          <label htmlFor="team-release">Release them. They keep their accounts and data, without a manager.</label>
        </div>
      </fieldset>
      <div className={DIALOG_BUTTONS}>
        <button type="button" onClick={onCancel} className={CANCEL_BUTTON}>
          Cancel
        </button>
        <button type="button" onClick={confirm} disabled={choice === "move" && !target} className={PRIMARY_BUTTON}>
          Change role
        </button>
      </div>
    </Dialog>
  );
}

export function PromoteAdminDialog({ user, onCancel, onConfirm }) {
  return (
    <Dialog title={`Make ${displayName(user)} an Admin?`} onClose={onCancel}>
      <p className="mt-3 text-sm text-muted-foreground">
        Admins see every account&apos;s data and can change roles, deactivate and delete accounts. An Admin account
        can&apos;t be deleted, only changed back to another role.
      </p>
      <div className={DIALOG_BUTTONS}>
        <button type="button" onClick={onCancel} className={CANCEL_BUTTON}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={PRIMARY_BUTTON}>
          Make Admin
        </button>
      </div>
    </Dialog>
  );
}

export function DeleteUserDialog({ user, onCancel, onDeleted }) {
  const [summary, setSummary] = useState(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/admin/users/${user.id}/summary`)
      .then((res) => setSummary(res.data))
      .catch(() => setError("Could not load what would be deleted."));
  }, [user.id]);

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api.delete(`/admin/users/${user.id}`);
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete this account.");
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Delete ${displayName(user)}?`} onClose={onCancel}>
      {summary ? (
        <div className="mt-3 text-sm text-muted-foreground">
          <p>This permanently deletes the account and:</p>
          <ul className="mt-2 list-disc pl-5">
            <li>{plural(summary.thumbnails, "thumbnail")} and their scores</li>
            <li>{plural(summary.ab_tests, "A/B test")}</li>
            <li>{plural(summary.reports, "exported report")}</li>
          </ul>
          {summary.team_members > 0 && (
            <p className="mt-2">
              Their {plural(summary.team_members, "team member")} keep their accounts, without a manager.
            </p>
          )}
          <p className="mt-2">
            To keep the data, <span className="font-medium text-foreground">deactivate</span> the account instead.
            That can be undone.
          </p>
        </div>
      ) : (
        !error && <Skeleton className="mt-3 h-20" />
      )}
      <div className="mt-4 flex flex-col gap-1">
        <label htmlFor="delete-user-confirm" className="text-sm font-medium">
          Type <span className="break-all font-mono">{user.email}</span> to confirm
        </label>
        <input
          id="delete-user-confirm"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className={DIALOG_BUTTONS}>
        <button type="button" onClick={onCancel} className={CANCEL_BUTTON}>
          Cancel
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy || typed.trim().toLowerCase() !== user.email}
          className={DANGER_BUTTON}
        >
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
      </div>
    </Dialog>
  );
}
