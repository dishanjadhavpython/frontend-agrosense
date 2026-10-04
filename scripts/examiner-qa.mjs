/**
 * The visual QA sweep for the examiner walkthrough.
 *
 * Twelve routes, three widths, two themes. For each combination it takes a
 * full-page screenshot and measures the four things that are cheaper to check
 * by machine than by eye:
 *
 *   contrast    every text node against its composited background, WCAG 2.1
 *   overflow    whether the document is wider than the viewport
 *   console     errors and React hydration warnings
 *   legibility  the smallest rendered font size inside any <figure>
 *
 * Those are the hard gates. Whether the thing actually looks premium is judged
 * from the screenshots — this exists so that judgement is spent on the part a
 * machine cannot do.
 *
 * Screenshots and the report go to a scratch directory, never into the
 * repository: a few hundred PNGs a sweep is not something to commit.
 *
 *   node scripts/examiner-qa.mjs [--out DIR] [--base URL] [--routes a,b]
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = arg("base", "http://127.0.0.1:3000");
const OUT = arg("out", "/tmp/examiner-qa");
const ROUTES = arg("routes", "").split(",").filter(Boolean);

const WIDTHS = [
  { name: "390", width: 390, height: 844 },
  { name: "834", width: 834, height: 1112 },
  { name: "1440", width: 1440, height: 900 },
];
const THEMES = ["light", "dark"];

const DEFAULT_ROUTES = [
  "/examiner", "/examiner/system", "/examiner/data", "/examiner/reading",
  "/examiner/rag", "/examiner/soil-model", "/examiner/tournaments",
  "/examiner/engine", "/examiner/agents", "/examiner/mcp",
  "/examiner/deployment", "/examiner/decisions",
];

/**
 * Console noise that is already there on `/` in this dev environment and has
 * nothing to do with this section: Clerk's development keys, its two CDN
 * scripts refused by the app's own strict CSP, and a malformed script-src hash.
 * Verified present on the product page before being listed here. Filtered so a
 * real regression is visible rather than buried under sixty-nine copies of a
 * pre-existing warning — never filter anything that has not been checked
 * against the product first.
 */
const KNOWN_NOISE = [
  /contains an invalid source: 'sha256-/,
  /clerk\.accounts\.dev.*violates the following Content Security Policy/,
  /Executing inline script violates the following Content Security Policy/,
  /Clerk has been loaded with development keys/,
  /Failed to load resource.*50\d/,
  // The downstream timeout of the two blocked scripts above: Clerk's loader
  // waits for a CDN bundle the app's own CSP refuses, then rejects. The block
  // itself is verified on `/`; this rejection is race-dependent, so it lands on
  // whichever route happens to lose the race rather than reliably on the
  // product page. Filtering the symptom of an already-filtered, already-
  // verified cause — not a new exemption.
  /failed_to_load_clerk_js/,
];

/**
 * Runs in the page. Resolves every colour through a 1x1 canvas rather than by
 * parsing the computed string: Tailwind v4 compiles an opacity modifier such as
 * `text-ink-mute/70` to `oklab(0.67 -0.0017 -0.0066 / 0.7)`, and a regex that
 * scrapes digits out of that reads the lightness as a red channel and reports
 * nonsense. Canvas gives real RGBA for any colour syntax the browser accepts.
 */
function auditPage() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });

  const rgba = (value) => {
    if (!value || value === "transparent" || value === "none") return null;
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = value;
    if (cx.fillStyle === "#000" && !/^(#000000|#000|black|rgb\(0, ?0, ?0\))$/i.test(value.trim())) {
      return null; // the browser rejected it
    }
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };

  const over = (fg, bg) => {
    const a = fg[3];
    return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
  };

  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  // The painted backdrop behind an element: walk up compositing translucent
  // layers until one is opaque. Anything over a background-image or gradient is
  // skipped — a guessed number is worse than no number.
  const backdropOf = (el) => {
    const layers = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = rgba(cs.backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 0.999) break;
      }
      n = n.parentElement;
    }
    let out = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
    return out;
  };

  const fails = [];
  let smallestFigureText = Infinity;

  for (const el of document.querySelectorAll("body *")) {
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!text) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (Number(cs.opacity) < 0.1) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue; // sr-only clips to 1px

    const size = parseFloat(cs.fontSize);
    if (el.closest("figure")) smallestFigureText = Math.min(smallestFigureText, size);

    const fg = rgba(cs.color);
    const bg = backdropOf(el);
    if (!fg || !bg) continue;

    const r = ratio(over(fg, bg), bg);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (weight >= 700 && size >= 18.66);
    const need = large ? 3 : 4.5;

    if (r < need) {
      fails.push({
        text: text.slice(0, 60),
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || "").slice(0, 70),
        color: cs.color,
        background: `rgb(${bg.map(Math.round).join(",")})`,
        size, weight,
        ratio: Math.round(r * 100) / 100,
        need,
      });
    }
  }

  return {
    fails,
    smallestFigureText: smallestFigureText === Infinity ? null : smallestFigureText,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    figures: document.querySelectorAll("figure").length,
    figuresWithoutSource: Array.from(document.querySelectorAll("figure"))
      .filter((f) => !f.querySelector("[data-source]")).length,
  };
}

const run = async () => {
  const routes = ROUTES.length ? ROUTES : DEFAULT_ROUTES;
  await mkdir(OUT, { recursive: true });

  // Playwright's bundled Chromium may not be downloaded (the cache here runs a
  // few revisions behind the installed package). System Chrome is the same
  // engine for these purposes, so fall back rather than pull down 100 MB.
  const browser = await chromium.launch().catch((e) => {
    if (!/Executable doesn't exist/.test(String(e))) throw e;
    console.log("bundled chromium missing — using system Chrome\n");
    return chromium.launch({ channel: "chrome" });
  });

  const report = { base: BASE, at: new Date().toISOString(), pages: [] };
  let gateFailures = 0;

  for (const theme of THEMES) {
    for (const vp of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: theme,
      });
      // The pre-paint script in <head> reads this before first paint, so it has
      // to be in storage before the document runs, not set afterwards.
      await ctx.addInitScript(
        (t) => { try { localStorage.setItem("agrosense.theme", t); } catch {} },
        theme,
      );

      for (const route of routes) {
        const page = await ctx.newPage();
        const messages = [];
        page.on("console", (m) => {
          if (m.type() === "error" || m.type() === "warning") messages.push(`${m.type()}: ${m.text()}`);
        });
        page.on("pageerror", (e) => messages.push(`pageerror: ${String(e)}`));

        let audit = null, error = null, shot = null;
        try {
          await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 45000 });
          await page.waitForTimeout(300);
          audit = await page.evaluate(auditPage);
          shot = `${route.replace(/\//g, "_").replace(/^_/, "") || "root"}--${vp.name}--${theme}.png`;
          await page.screenshot({ path: path.join(OUT, shot), fullPage: true });
        } catch (e) {
          error = String(e).slice(0, 300);
        }

        const noise = messages.filter((m) => KNOWN_NOISE.some((re) => re.test(m)));
        const real = messages.filter((m) => !KNOWN_NOISE.some((re) => re.test(m)));
        const hydration = real.filter((m) => /hydrat|did not match|server.*client/i.test(m));
        const overflow = audit ? audit.scrollWidth > audit.clientWidth + 1 : false;

        const bad = (audit?.fails.length ?? 0) + (overflow ? 1 : 0) + real.length + (error ? 1 : 0);
        gateFailures += bad;

        report.pages.push({
          route, width: vp.name, theme, shot, error, overflow,
          consoleReal: real.map((m) => m.slice(0, 200)),
          consoleNoise: noise.length,
          hydration: hydration.length,
          ...audit,
        });

        console.log(
          `[${bad ? "FAIL" : " ok "}] ${theme.padEnd(5)} ${vp.name.padStart(4)}  ${route.padEnd(24)}` +
          (audit
            ? `contrast ${String(audit.fails.length).padStart(2)}  overflow ${overflow ? "YES" : "no "}  console ${real.length}`
            : `  ${error}`),
        );
        await page.close();
      }
      await ctx.close();
    }
  }

  await browser.close();
  await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

  const uniq = new Map();
  for (const p of report.pages) for (const f of p.fails ?? []) uniq.set(`${f.cls}|${f.color}|${f.background}`, f);

  console.log(`\n${report.pages.length} page-renders · ${gateFailures} hard-gate failures`);
  console.log(`pre-existing console noise filtered: ${report.pages.reduce((a, p) => a + (p.consoleNoise || 0), 0)}`);

  if (uniq.size) {
    console.log(`\nDistinct contrast failures (${uniq.size}):`);
    for (const f of [...uniq.values()].sort((a, b) => a.ratio - b.ratio)) {
      console.log(`  ${String(f.ratio).padStart(5)}:1 (need ${f.need})  ${f.size}px w${f.weight} ${f.tag}`);
      console.log(`        "${f.text}"  ${f.color} on ${f.background}`);
      console.log(`        .${f.cls}`);
    }
  }
  console.log(`\nreport + screenshots -> ${OUT}`);
  process.exit(gateFailures ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
