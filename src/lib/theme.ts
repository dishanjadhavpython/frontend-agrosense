"use client";

/**
 * Theme — light (default) and dark.
 *
 * Light stays the default deliberately. This app gets used standing in a
 * field at eleven in the morning, and a dark UI in direct sun is a mirror.
 * Dark mode is for the other half of the day: the shed, the evening, the
 * hour before anyone drives to the market.
 *
 * The chosen theme lives on `<html data-theme>` and is written there twice:
 * once by the inline script in the document head, before first paint, and
 * again by `useTheme` whenever it changes. React never renders the attribute,
 * so it is never reconciled away.
 *
 * To make dark follow the operating system instead of defaulting to light,
 * change `getServerSnapshot` and the matching line in THEME_INIT_SCRIPT.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";



// The pre-paint script and its CSP hash live in `themeScript.ts`, which has
// no "use client" and no React import — `src/middleware.ts` needs the hash and
// runs in the edge runtime, where importing this file breaks every request.
import { THEME_STORAGE_KEY } from "./themeScript";

export {
  THEME_STORAGE_KEY,
  THEME_INIT_SCRIPT,
  THEME_INIT_SCRIPT_HASH,
} from "./themeScript";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Keeps two open tabs in step.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** What the server renders, and what React hydrates against. */
function getServerSnapshot(): Theme {
  return "light";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // The inline script has already set this on a normal load. This is here for
  // the toggle, and for a `storage` event arriving from another tab.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);

    // The address bar has to follow. The <meta> Next renders is keyed to the
    // OS preference, which is not the same question as which theme is on.
    const color = theme === "dark" ? "#0a0f0b" : "#f6f7f2";
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((tag) => {
        tag.removeAttribute("media");
        tag.content = color;
      });
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode: the theme still applies, it just won't survive a reload.
    }
    // `storage` doesn't fire in the tab that wrote it, so tell this one.
    listeners.forEach((cb) => cb());
  }, []);

  const toggle = useCallback(() => {
    setTheme(getSnapshot() === "dark" ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggle };
}
