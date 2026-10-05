import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, setToken } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";

const ROLE_OPTIONS = [
  {
    value: "Creator",
    title: "Creator",
    description: "I make content and want to optimize my own thumbnails.",
  },
  {
    value: "Manager",
    title: "Manager",
    description: "I manage thumbnails and tests for a team or several clients.",
  },
];

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [role, setRole] = useState("Creator");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await api.patch("/auth/profile", { name, role });
      setToken(res.data.token);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err.response?.status === 403) {
        navigate("/dashboard", { replace: true });
        return;
      }
      setError(err.response?.data?.message || "Could not save your profile. Please try again.");
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
        <p className="font-mono text-xs uppercase tracking-widest text-primary">One last step</p>
        <h1 className="mt-2 text-2xl font-semibold">Set up your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tell us a bit about you to finish creating your account.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-medium">Display name</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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
            {submitting ? "Saving…" : "Finish setup"}
          </button>
        </form>
      </div>
    </div>
  );
}
