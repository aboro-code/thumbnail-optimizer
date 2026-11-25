import ThemeToggle from "./ThemeToggle";
import { LightTableArt, Wordmark } from "./Art";

// Sign-in and sign-up share this frame: the light table on the left (from
// tablet width), the form on the right.
export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-[var(--film)] text-[#f1e7da] lg:flex lg:flex-col lg:justify-between lg:gap-10 lg:p-12">
        <Wordmark />
        <div>
          <LightTableArt className="w-full max-w-[30rem]" />
          <p className="display mt-8 max-w-[18ch] text-4xl xl:text-5xl">Pick the frame that gets the click.</p>
          <p className="mt-4 max-w-[46ch] text-base text-[#cbbcab]">
            Lay your candidate thumbnails side by side, see which one the model scores highest and why, then prove it
            with a real A/B test.
          </p>
        </div>
        <p className="text-sm text-[#a8988a]">Runs on your own server. Nothing is sent to an outside AI service.</p>
      </aside>

      <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10 lg:min-h-0">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="mb-6 lg:hidden">
          <Wordmark />
        </div>
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-[0_1px_0_var(--border),0_18px_40px_-24px_rgba(0,0,0,0.6)] sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
