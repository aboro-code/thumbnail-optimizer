import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, setToken, setUser } from "../lib/api";
import AuthLayout from "../components/AuthLayout";
import PasswordInput from "../components/PasswordInput";

const MIN_PASSWORD_LENGTH = 8;
const INPUT_CLASS =
  "rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring";

const ROLE_OPTIONS = [
  { value: "Creator", title: "Creator", description: "I make content and want to optimize my own thumbnails." },
  { value: "Manager", title: "Manager", description: "I run a team of creators and review their tests." },
];

// Email sign-up (POST /auth/signup). Admin is never offered here: admins are
// only created with the create-admin script.
export default function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState("Creator");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/auth/signup", {
        name,
        email,
        password,
        role,
        invite_code: role === "Creator" && inviteCode.trim() ? inviteCode.trim() : undefined,
      });
      setToken(res.data.token);
      setUser(res.data.user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Could not reach the server. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
        <h1 className="text-2xl">Create an account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Score and test your thumbnails before you publish.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium">Name</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="password-hint"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS}
            />
            <p id="password-hint" className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm" className="text-sm font-medium">Confirm password</label>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">I am a</legend>
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer gap-3 rounded-md border p-3 text-sm ${
                  role === option.value ? "border-primary" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value)}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span>
                  <span className="block font-medium">{option.title}</span>
                  <span className="block text-muted-foreground">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {role === "Creator" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invite_code" className="text-sm font-medium">
                Team code <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                id="invite_code"
                type="text"
                autoComplete="off"
                aria-describedby="invite-hint"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className={`${INPUT_CLASS} font-mono uppercase tracking-widest`}
              />
              <p id="invite-hint" className="text-xs text-muted-foreground">
                From your manager. You can also join a team later.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
    </AuthLayout>
  );
}
