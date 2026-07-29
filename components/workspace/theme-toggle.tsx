"use client";

import { Moon, Sun } from "lucide-react";

/**
 * Light/dark switch in the islamtayeb.dev mold: one ghost icon button.
 * Stateless on purpose — both icons render and CSS shows the right one for
 * the current [data-theme], so SSR, hydration and the pre-paint theme script
 * can never disagree about what this button looks like.
 */
export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // private mode; the toggle still works for this visit
    }
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Switch between light and dark mode"
      onClick={toggle}
    >
      <Sun size={14} className="theme-toggle__sun" aria-hidden />
      <Moon size={14} className="theme-toggle__moon" aria-hidden />
    </button>
  );
}
