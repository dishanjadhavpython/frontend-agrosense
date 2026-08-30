/**
 * The pre-paint theme script, and its CSP hash.
 *
 * Its own module, with no `"use client"` and no React import, because
 * `src/middleware.ts` needs the hash and middleware runs in the edge runtime.
 * Importing `theme.ts` there pulled a client component and `useSyncExternalStore`
 * into the edge bundle, which fails at request time rather than at build time —
 * every page 500s with `value.replace is not a function` and nothing points at
 * the cause.
 *
 * So: the two constants that both runtimes need live here, and `theme.ts`
 * re-exports them for the browser half.
 */

export const THEME_STORAGE_KEY = "agrosense.theme";

/**
 * Runs before the first paint, so the page never flashes white and then blacks
 * out. Kept as a string because it has to be inlined into `<head>` — anything
 * loaded as a module arrives too late to help.
 *
 * Deliberately unreadable-looking but total: wrapped in try/catch because
 * localStorage throws outright in some privacy modes, and a broken theme must
 * never take the whole document down with it.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="dark"&&t!=="light")t="light";document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

/**
 * The SHA-256 of the script above, for the Content-Security-Policy.
 *
 * The CSP generated in `src/middleware.ts` uses `strict-dynamic` with a
 * per-request nonce, and CSP Level 3 browsers ignore `'unsafe-inline'` the
 * moment either is present. Next nonces the scripts it emits itself, but this
 * one is written by hand into `<head>` and would simply be blocked — and a
 * blocked theme script is exactly the white flash the script exists to
 * prevent, appearing only in production and only for the people who chose dark.
 *
 * A nonce is the usual answer and is wrong here: reading the per-request nonce
 * in the root layout would make every page dynamic and cost the static
 * prerendering the site depends on. A hash is a compile-time constant for a
 * compile-time constant script, so it costs nothing.
 *
 * `npm run check:csp-hash` recomputes this. If somebody edits the script and
 * forgets this line, that fails — rather than the theme silently breaking for
 * dark-mode users in production.
 */
export const THEME_INIT_SCRIPT_HASH =
  "sha256-N2i2UlUnI7usHVCYXOEJxbkEwVyniT32uXHxHRhwLDQ=";
