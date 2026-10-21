"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sentinela-theme";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next: Theme = stored === "light" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }

  const isLight = theme === "light";

  return (
    <button
      type="button"
      className="ghost-action theme-toggle"
      onClick={toggleTheme}
      aria-pressed={isLight}
      aria-label={isLight ? "Usar tema escuro" : "Usar tema claro"}
    >
      {isLight ? <MoonIcon /> : <SunIcon />}
      {isLight ? "Escuro" : "Claro"}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M16.5 3.2a8.8 8.8 0 1 0 4.3 13.6A7.4 7.4 0 0 1 16.5 3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
