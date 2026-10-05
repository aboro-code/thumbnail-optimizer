import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, setToken } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google sign-in"));
    document.head.appendChild(script);
  });
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const googleButtonRef = useRef(null);

  function routeAfterSignIn(data) {
    setToken(data.token);
    navigate(data.needs_profile ? "/complete-profile" : "/dashboard", { replace: true });
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;

    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !googleButtonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            setError("");
            try {
              const res = await api.post("/auth/google", { credential });
              routeAfterSignIn(res.data);
            } catch (err) {
              setError(err.response?.data?.message || "Google sign-in failed. Please try again.");
            }
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          width: 300,
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
    // routeAfterSignIn only uses stable navigate and setToken, so this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await api.post("/auth/login", { email, password });
      routeAfterSignIn(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not reach the server. Is the backend running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">Thumbnail Optimizer</p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Score and test your thumbnails before you publish.</p>

        {GOOGLE_CLIENT_ID && (
          <div className="mt-6 flex flex-col items-center gap-4">
            <div ref={googleButtonRef} />
            <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>

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
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
