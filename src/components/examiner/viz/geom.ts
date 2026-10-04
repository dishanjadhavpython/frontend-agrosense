import type { Tone } from "@/data/examiner/types";

/**
 * The arithmetic every figure in this section shares, and the one rule none of
 * them may break.
 *
 * `ui/ArcGauge.tsx` documents the failure this exists to prevent: `Math.sin`
 * and `Math.cos` are not required by the spec to be correctly rounded, Node and
 * Chrome disagree in the last bits, and that is enough for React to flag a
 * hydration mismatch on an SVG coordinate. Rounding to three decimals treats
 * the symptom.
 *
 * This kit removes the cause instead. No figure calls a transcendental at
 * render: the ramp positions are ratios, the flow diagrams are grid arithmetic,
 * and the only circle in the section reads its vertices from `UNIT_RING` below,
 * pre-rounded. `q()` remains as the belt to that pair of braces — every number
 * that becomes an SVG attribute or a CSS percentage goes through it.
 *
 * Forbidden in a render path, for the same reason: `**`, `Math.pow`,
 * `Math.exp`, `Math.log`, `Date.now()`, `Math.random()`.
 */

/** Three decimals. Multiplication and `Math.round` are exact in IEEE-754. */
export const q = (n: number): number => Math.round(n * 1000) / 1000;

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** A value as a percentage of a maximum, clamped and quantised. */
export const pct = (value: number, max: number): number =>
  q(clamp01(max === 0 ? 0 : value / max) * 100);

/**
 * A share of a total, as a percentage to one decimal.
 *
 * Not `q(value / total * 100)`: quantising to three decimals and then dividing
 * by ten reintroduces the error it just removed — 550.482 / 10 is
 * 55.048199999999994, which is what a legend then prints. Round once, at the
 * precision the number is displayed at.
 */
export const share = (value: number, total: number): number =>
  total === 0 ? 0 : Math.round((value / total) * 1000) / 10;

/**
 * Colour is passed as a custom-property reference, never as a constructed
 * Tailwind class: v4 cannot see a class name built at runtime, and these are
 * SVG `fill`/`stroke` attributes in any case. It also means the dark theme is
 * free — `globals.css` re-declares the same tokens, so no figure branches.
 */
export const TONE: Readonly<Record<Tone, string>> = {
  gold: "var(--color-gold)",
  green: "var(--color-green)",
  blue: "var(--color-blue)",
  clay: "var(--color-clay)",
  slate: "var(--color-slate)",
  ink: "var(--color-ink)",
  mute: "var(--color-ink-mute)",
};

/** The tinted ground that goes with each accent, for chips and soft tiles. */
export const WASH: Readonly<Record<Tone, string>> = {
  gold: "var(--color-gold-wash)",
  green: "var(--color-green-wash)",
  blue: "var(--color-blue-wash)",
  clay: "var(--color-clay-wash)",
  slate: "var(--color-sunk)",
  ink: "var(--color-sunk)",
  mute: "var(--color-sunk)",
};

/**
 * The diagram palette: a filled node, not a tinted one.
 *
 * `WASH` above is tuned to sit behind a chip without competing with a chart
 * beside it. A node in an architecture diagram has the opposite job — it is
 * the picture, and a reader has to see which boxes belong together from across
 * a room. These are brighter and more saturated, and they are the only place
 * in the section where a large area of colour is allowed.
 *
 * The hue binding is the walkthrough's, narrowed to what a node can be:
 * slate outside the system · blue a service we run · green a store we own ·
 * gold the entry point or the chosen path · clay rejected or vetoed.
 */
export const DIA_FILL: Readonly<Record<Tone, string>> = {
  gold: "var(--dia-fill-gold)",
  green: "var(--dia-fill-green)",
  blue: "var(--dia-fill-blue)",
  clay: "var(--dia-fill-clay)",
  slate: "var(--dia-fill-slate)",
  ink: "var(--dia-fill-ink)",
  mute: "var(--dia-fill-mute)",
};

/** The border that goes with each fill, and the stroke of an edge of that kind. */
export const DIA_LINE: Readonly<Record<Tone, string>> = {
  gold: "var(--dia-line-gold)",
  green: "var(--dia-line-green)",
  blue: "var(--dia-line-blue)",
  clay: "var(--dia-line-clay)",
  slate: "var(--dia-line-slate)",
  ink: "var(--dia-line-ink)",
  mute: "var(--dia-line-mute)",
};

/** The five steps of the data ramp, faintest to strongest. */
export const RAMP = [
  "var(--color-gold-1)",
  "var(--color-gold-2)",
  "var(--color-gold-3)",
  "var(--color-gold-4)",
  "var(--color-gold-5)",
] as const;

/**
 * What may be set on each step. Tokens rather than a rule such as "ink below
 * four, paper above", because the switch point is not the same in both themes:
 * on paper ink still clears AA on step four, and in the dark the ramp inverts
 * and the switch falls a step earlier. A component reads the token and is right
 * in both.
 */
export const ON_RAMP = [
  "var(--color-on-gold-1)",
  "var(--color-on-gold-2)",
  "var(--color-on-gold-3)",
  "var(--color-on-gold-4)",
  "var(--color-on-gold-5)",
] as const;

/**
 * Which step a value falls on, given the largest value in the figure.
 *
 * Zero is its own case and never takes a fill: on a confusion matrix the empty
 * cells are most of the grid, and tinting them turns "nothing was confused
 * here" into visual noise competing with the diagonal.
 */
export function step(value: number, max: number): number {
  if (value <= 0 || max <= 0) return -1;
  const i = Math.ceil(clamp01(value / max) * RAMP.length) - 1;
  return i < 0 ? 0 : i > RAMP.length - 1 ? RAMP.length - 1 : i;
}

/** Fill and text colour for a ramped cell. `null` fill means leave it empty. */
export function rampCell(
  value: number,
  max: number,
): {
  fill: string | null;
  color: string;
} {
  const i = step(value, max);
  return i < 0
    ? { fill: null, color: "var(--color-ink-mute)" }
    : { fill: RAMP[i], color: ON_RAMP[i] };
}

/**
 * A unit circle's vertices, pre-rounded at authoring time so nothing calls
 * `Math.cos` during a render. Only the counts any figure in this section needs.
 */
export const UNIT_RING: Readonly<
  Record<number, readonly (readonly [number, number])[]>
> = {
  4: [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ],
  5: [
    [1, 0],
    [0.309, 0.951],
    [-0.809, 0.588],
    [-0.809, -0.588],
    [0.309, -0.951],
  ],
  6: [
    [1, 0],
    [0.5, 0.866],
    [-0.5, 0.866],
    [-1, 0],
    [-0.5, -0.866],
    [0.5, -0.866],
  ],
};
