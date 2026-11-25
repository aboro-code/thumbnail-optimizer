import { Link } from "react-router-dom";

import ThemeToggle from "../components/ThemeToggle";

// Shown when the API answers ACCOUNT_DEACTIVATED, at sign-in or mid-session (D-42).
export default function DeactivatedPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <svg aria-hidden="true" className="mx-auto mb-4 text-muted-foreground" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M10 8v8M14 8v8" />
        </svg>
        <h1 className="text-xl font-semibold">Your account has been deactivated</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          You&apos;ve been signed out. Please contact your manager or an administrator to reactivate your account.
          Your thumbnails and tests are kept, and will be there when it&apos;s reactivated.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
