import { useState } from "react";

import { applyTheme, getTheme } from "../lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getTheme);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
