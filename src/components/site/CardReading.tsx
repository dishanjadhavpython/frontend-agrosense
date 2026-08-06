"use client";

import Image from "next/image";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { ArrowDownWideNarrow, FileCheck2, FileText, ListOrdered } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useCard } from "@/lib/cardState";
import { photo } from "@/lib/assets";
import { cn } from "@/lib/cn";
import {
  CARD_READING,
  cardRowsFromExtraction,
  bandEdges,
  cardRating,
  cardTone,
  formatBound,
  formatCardValue,
  formatGap,
  positionOf,
  severity,
  toneFill,
  toneSolid,
  toneSpine,
  toneText,
  type CardRow,
  type CardTone,
} from "@/data/cardReading";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";

/**
 * The card, read.
 *
 * A Soil Health Card prints two columns — SAMPLE READING and RANGE — and
 * expects a farmer to compare twelve pairs of numbers in units they were never
 * given. Nobody does it. This is that comparison done for them, and it is the
 * whole product stated in one screen.
 *
 * The chart's argument lives in `cardReading.ts`: every row's range is mapped
 * onto the same window in the middle of the track, so the target becomes one
 * vertical column down the page instead of a different place on every row.
 * What is left is the only thing worth looking at — the length sticking out of
 * that column, and which side it comes out of.
 *
 * Drawn with divs. These are percentages of a width, there is no trigonometry,
 * and `<ArcGauge>` already established what server/client float drift does to
 * an SVG (PLAN.md §9).
 */

type Sort = "card" | "worst";

/** What a row hands its bar: where to grow from, to, and when. */
type BarCustom = { i: number; anchor: number; left: number; width: number };

export function CardReading() {
  const { lang } = useLang();
  const mr = lang === "mr";
  const { card } = useCard();

  // Once a card has been read, this chart is about that card. Until then it
  // draws the transcription fixture, which is what the eyebrow below admits to.
  const rows = useMemo(
    () => (card ? cardRowsFromExtraction(card.soil_metrics) : CARD_READING),
    [card],
  );

  return (
    <Section
      id="reading"
      eyebrow={
        card
          ? mr
            ? "तुमची पत्रिका"
            : "Your card"
          : mr
            ? "वाचलेली पत्रिका"
            : "The card, read"
      }
      heading={mr ? "आकडे नाही, चित्र बघा" : "Your card as a picture"}
      // Green, and `leaf` rather than a fixed hex so it stays a deep
      // standing-crop green on paper and climbs to lime in the dark.
      headingClassName="text-leaf"
      lede={
        mr
          ? "पत्रिकेवरचा प्रत्येक आकडा त्याच्या योग्य पातळीशी जुळवून पाहिला आहे. मधला हिरवा पट्टा म्हणजे असायला हवी ती पातळी — त्यातून बाहेर आलेला भाग तेवढाच बघायचा."
          : "Every figure on the card, set against the range it was supposed to fall in. The green column down the middle is where a reading belongs — all you have to look at is what sticks out of it."
      }
    >
      {/* Which card this is. A chart of somebody's real soil and a chart of a
          demonstration must never look alike, and the eyebrow alone is too
          quiet to carry that. */}
      <Reveal className="mt-8">
        <p
          className={cn(
            "inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border px-4 py-2 text-[13px]",
            card
              ? "border-leaf/40 bg-leaf-wash text-leaf-deep"
              : "border-line bg-paper text-ink-mute",
          )}
        >
          {card ? (
            <>
              <FileCheck2 className="size-4 shrink-0" strokeWidth={1.9} aria-hidden />
              <span className="font-semibold">
                {mr ? "तुमची पत्रिका" : "From your card"}
              </span>
              <span className="max-w-[16rem] truncate font-mono text-[12px] opacity-80">
                {card.filename}
              </span>
              <span className="tnum opacity-80">
                {mr
                  ? `बारापैकी ${rows.length}`
                  : `${rows.length} of 12 readings`}
              </span>
            </>
          ) : (
            <>
              <FileText className="size-4 shrink-0" strokeWidth={1.9} aria-hidden />
              {mr
                ? "ही नमुना पत्रिका आहे. वर तुमची पत्रिका दिलीत की इथले आकडे बदलतील."
                : "This is a sample card. Add yours above and these figures become your own."}
            </>
          )}
        </p>
      </Reveal>

      <Reveal className="mt-10">
        <div
          className="relative isolate overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <FieldBackdrop />
          {/* Two tokens re-declared for the inside of this card only, the way
              `paper-island` does it in globals.css. Even through the veil, a
              photograph costs the faintest colours the most: `ink-mute` sets
              the 10px range labels under every bar and `line` draws the rule
              between rows, and both were the first things to go soft. Every
              component below keeps using `text-ink-mute` and `border-line`
              with no idea anything changed. */}
          <div className="relative [--color-ink-mute:#414f47] [--color-line:#c6cebc] dark:[--color-ink-mute:#a4b4a8] dark:[--color-line:#35443b]">
            <ReadingChart rows={rows} />
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/**
 * The field behind the readings.
 *
 * Two earlier attempts got this wrong in opposite directions. Masked to the
 * top third it was barely there; strong and unmasked it took `ink-mute` — the
 * lowest-contrast colour the product owns, and the one the 10px range labels
 * are set in — below AA.
 *
 * What works is separating the two jobs. The photograph runs the full height
 * of the card at full crop, and a `surface` veil sits between it and the data.
 * The veil is what the type is read against, so contrast is a property of one
 * number rather than of the photograph's brightest patch; the image is free to
 * be plainly visible everywhere the veil isn't doing work.
 *
 * The image is a dark one, and that turns out to matter in both directions.
 * The pale ear this replaced had to be dimmed hard in dark mode, because a
 * bright picture lifts a near-black `surface` several times harder than it
 * lifts paper. Rain on glass is already dark, so it needs no dimming at all —
 * and the veil can be thinner there than on paper, which is the opposite of
 * what the last image wanted.
 */
function FieldBackdrop() {
  const src = photo("reading/rain-glass.jpg");
  if (!src) return null;

  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
      <Image
        src={src}
        alt=""
        fill
        sizes="(max-width: 1280px) 100vw, 1216px"
        // 1px, which is doing something specific: the droplets are small and
        // high-frequency, and at full sharpness they fight the 10px range
        // labels sitting on top of them. Just enough to take the edge off the
        // speckle without turning it into a smear.
        className="object-cover blur-[1px]"
      />
      {/* The veil. Everything above it is read against this, not against the
          photograph — which is the whole reason the photograph can be this
          strong. */}
      <div className="absolute inset-0 bg-surface/84 dark:bg-surface/80" />
    </div>
  );
}

/**
 * `rows` is a prop with a fixture default: when extraction lands, the card's
 * real figures are passed in here and not one line below changes.
 */
export function ReadingChart({ rows = CARD_READING }: { rows?: CardRow[] }) {
  const { t, lang, pair } = useLang();
  const mr = lang === "mr";
  const reduced = useReducedMotion();
  const [sort, setSort] = useState<Sort>("card");

  const short = rows.filter((r) => cardTone(r) === "short");
  const over = rows.filter((r) => cardTone(r) === "over");
  const ok = rows.filter((r) => cardTone(r) === "in");

  // Card order is the default because a farmer reads this next to the sheet.
  // Worst-first is the other real question — which one do I fix — and it is a
  // sort, not a filter: nothing disappears, the order just changes.
  const shown = useMemo(() => {
    if (sort === "card") return rows;
    return [...rows].sort((a, b) => severity(b) - severity(a));
  }, [rows, sort]);

  /* The bars are driven by variants propagated from the <ul>, not by their own
     `whileInView`. A bar starts at zero width, and a zero-area element never
     satisfies an IntersectionObserver threshold — every row would sit at 0px
     forever. The list has area, so it is the thing that gets observed, and the
     rows follow the label it broadcasts.

     `reduced` is read in the transition only, never in the markup: the
     structure and initial style have to match on both sides of hydration
     (see Reveal.tsx). */
  const ease = [0.16, 1, 0.3, 1] as const;
  const timing = (i: number, duration: number) =>
    reduced ? { duration: 0 } : { duration, delay: 0.04 * i, ease };

  const bar: Variants = {
    rest: (c: BarCustom) => ({ left: `${c.anchor * 100}%`, width: "0%" }),
    grown: (c: BarCustom) => ({
      left: `${c.left * 100}%`,
      width: `${c.width * 100}%`,
      transition: timing(c.i, 0.65),
    }),
  };

  /* `x` rather than leaving the centring to `-translate-x-1/2`: the moment a
     variant animates `scale`, motion owns the whole transform and the utility
     class is gone. The class stays on the element anyway — it is what centres
     the dot if the script never runs. */
  const dot: Variants = {
    rest: { opacity: 0, scale: 0.4, x: "-50%" },
    grown: (i: number) => ({
      opacity: 1,
      scale: 1,
      x: "-50%",
      transition: timing(i, 0.45),
    }),
  };

  return (
    <div>
      {/* Every bar starts at zero width and is opened by script. The root
          layout's fallback only covers opacity and transform, which is no help
          to a width — so this chart carries its own. Without it a dropped
          connection leaves twelve empty tracks, and an empty track is worse
          than no chart: it reads as twelve readings of nothing. */}
      <noscript>
        <style>{`[data-bar]{left:var(--bar-left)!important;width:var(--bar-width)!important}[data-dot]{opacity:1!important}`}</style>
      </noscript>

      {/* ---- What the twelve rows add up to, before any of them. -------- */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 border-b border-line p-5 sm:p-6">
        <div>
          <p className="eyebrow text-ink-mute">
            {mr ? "बारा पैकी" : "Twelve readings"}
          </p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <Tally n={short.length} tone="short" label={mr ? "कमी" : "short"} />
            <Tally n={ok.length} tone="in" label={mr ? "बरोबर" : "in range"} />
            <Tally n={over.length} tone="over" label={mr ? "जास्त" : "over"} />
          </div>
        </div>

        {/* Two buttons, both always live — a segmented control, not a toggle
            whose off state hides what it does. */}
        <div
          role="group"
          aria-label={mr ? "क्रम" : "Order"}
          className="flex rounded-full border border-line p-1"
        >
          <SortButton
            active={sort === "card"}
            onClick={() => setSort("card")}
            icon={<ListOrdered className="size-4" strokeWidth={1.8} aria-hidden />}
          >
            {mr ? "पत्रिकेप्रमाणे" : "As on the card"}
          </SortButton>
          <SortButton
            active={sort === "worst"}
            onClick={() => setSort("worst")}
            icon={
              <ArrowDownWideNarrow className="size-4" strokeWidth={1.8} aria-hidden />
            }
          >
            {mr ? "सर्वात बिघडलेलं आधी" : "Furthest off first"}
          </SortButton>
        </div>
      </div>

      {/* ---- The rows. -------------------------------------------------
          Solid surface, not the veiled photograph the rest of the card sits
          on. The rain-glass image is right for the frame and wrong behind the
          data: twelve dense rows over moving highlights left every track
          looking faintly lit from behind, and a farmer comparing a bar against
          a band should not also be compensating for a droplet under it. The
          photograph still runs behind the summary above and the verdict below,
          where nothing is being measured against anything. */}
      <motion.ul
        className="bg-surface p-5 sm:p-6"
        initial="rest"
        whileInView="grown"
        viewport={{ once: true, margin: "-10% 0px" }}
      >
        {shown.map((r, i) => {
          const tone = cardTone(r);
          const names = pair(r.key);
          const valueAt = positionOf(r, r.value);

          return (
            <li
              key={r.key}
              className="relative border-b border-line py-4 pl-4 last:border-0 sm:pl-5"
            >
              {/* The spine. Four solid pixels of verdict down the left edge of
                  every row, so the answer to "which of these is a problem" is
                  available without reading a single number. It is the first
                  thing this chart says and it says it twelve times at once. */}
              <span
                className={cn(
                  "absolute top-4 bottom-4 left-0 w-[4px] rounded-full",
                  toneSpine[tone],
                )}
                aria-hidden
              />

              {/* Name on the left, verdict on the right. The verdict is a
                  solid chip rather than a wash: it is the one word on the row
                  that decides whether anybody does anything. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {/* Both scripts, as the card itself prints both. The second
                    is a fallback for anyone reading over a shoulder, so it
                    stays quiet. */}
                <p className="min-w-0 text-[16px] font-semibold text-ink">
                  {names.lead}
                  <span className="ml-1.5 font-mono text-[12px] font-normal text-ink-mute">
                    {r.symbol}
                  </span>
                </p>
                <p className="min-w-0 truncate text-[13px] text-ink-mute">
                  {names.sub}
                </p>

                <span
                  className={cn(
                    "ml-auto shrink-0 rounded-full px-3 py-1 text-[13px] font-bold",
                    toneSolid[tone],
                  )}
                >
                  {t(cardRating(r))}
                </span>
              </div>

              {/* The reading, at a size it can actually be read at, and beside
                  it the shortfall in words. "35 kg/ha short" is a decision;
                  "−35" is a puzzle, and this audience is being asked to act on
                  it, not to admire it. */}
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className={cn("tnum text-[22px] font-bold", toneText[tone])}>
                  {formatCardValue(r)}
                </span>
                {r.unit ? (
                  <span className="font-mono text-[12px] text-ink-mute">{r.unit}</span>
                ) : null}

                {tone === "in" ? null : (
                  <>
                    <span className="text-ink-mute" aria-hidden>
                      ·
                    </span>
                    <span className={cn("text-[14px] font-semibold", toneText[tone])}>
                      {gapPhrase(r, tone, mr)}
                    </span>
                  </>
                )}
              </p>

              <div className="mt-3">
                <div className="min-w-0">
                  {/* The track. Everything in it is a percentage of it, so
                      the row reflows at any width with nothing measured.

                      Neutral, and that is the correction that matters most
                      here. The track used to be pale green end to end with a
                      slightly greener band inside it, so every row read as
                      largely fine at a glance and a red bar arrived as a
                      surprise on a green field. Green now appears in exactly
                      one place and means exactly one thing: this is where the
                      reading was supposed to land. */}
                  <div className="relative h-4 overflow-hidden rounded-full bg-ink/14 dark:bg-chalk/14">
                    {/* The range. Same place on every row — that is the
                        entire reason this chart exists. Solid, not a tint:
                        it is the target, and a target you can barely see is
                        not doing its job. */}
                    <div
                      className="absolute inset-y-0 bg-leaf-3"
                      style={{
                        left: `${bandEdges.start * 100}%`,
                        width: `${(bandEdges.end - bandEdges.start) * 100}%`,
                      }}
                      aria-hidden
                    />
                    {/* An in-range reading is a dot, not a bar: there is no
                        distance to draw, and a bar would invent one. */}
                    {tone === "in" ? (
                      <motion.div
                        data-dot
                        // Ringed in the surface colour so a dark dot on a
                        // solid green band still reads as a separate mark
                        // rather than a hole in it.
                        className="absolute inset-y-0 w-4 -translate-x-1/2 rounded-full bg-leaf ring-2 ring-surface"
                        style={{ left: `${valueAt * 100}%` }}
                        custom={i}
                        variants={dot}
                      />
                    ) : (
                      <motion.div
                        data-bar
                        className={cn(
                          "absolute inset-y-0 min-w-[5px] rounded-full",
                          toneFill[tone],
                        )}
                        // The finished geometry also goes on as custom
                        // properties. motion writes `left` and `width`
                        // directly, so those are the only two it can't reach —
                        // which is exactly what the <noscript> rule below
                        // needs to restore the chart when the script never
                        // arrives.
                        style={
                          {
                            "--bar-left": `${(tone === "short" ? valueAt : bandEdges.end) * 100}%`,
                            "--bar-width": `${(tone === "short" ? bandEdges.start - valueAt : valueAt - bandEdges.end) * 100}%`,
                          } as CSSProperties
                        }
                        custom={{
                          i,
                          // It grows out of the edge of the range it broke —
                          // the animation is the reading leaving the band.
                          anchor: tone === "short" ? bandEdges.start : bandEdges.end,
                          left: tone === "short" ? valueAt : bandEdges.end,
                          width:
                            tone === "short"
                              ? bandEdges.start - valueAt
                              : valueAt - bandEdges.end,
                        }}
                        variants={bar}
                      />
                    )}
                  </div>

                  {/* The printed range, sitting under the two edges it names.
                      This is the join between the graphic and the paper: the
                      green block is these two numbers.

                      Each number now carries a tick up to the band edge it
                      belongs to. Floating labels a few pixels below a bar are
                      ambiguous about which point they mark, and these two are
                      the whole basis of the verdict — they have to be nailed
                      to their edges, not near them. */}
                  <div className="relative mt-1.5 h-8">
                    <Bound at={bandEdges.start} value={formatBound(r, 0)} />
                    <Bound at={bandEdges.end} value={formatBound(r, 1)} />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </motion.ul>

      {/* ---- The key. Five marks, because the chart uses five. ---------
          Drawn as a miniature of the real track rather than as loose swatches:
          the point being taught is where these colours sit relative to each
          other, and four unrelated pills cannot teach that. */}
      {/* On the same solid surface as the rows, and not by preference: these
          swatches are the row colours, and a swatch shown over a photograph is
          not the colour it is teaching. */}
      <div className="border-t border-line bg-surface px-5 py-4 sm:px-6">
        <p className="eyebrow mb-3 text-ink-mute">
          {mr ? "पट्टी कशी वाचायची" : "How to read the bar"}
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[13px] text-ink-soft">
          <span className="inline-flex items-center gap-2">
            <span
              className="h-4 w-7 rounded-full bg-ink/14 dark:bg-chalk/14"
              aria-hidden
            />
            {mr ? "पातळीबाहेर" : "Outside the range"}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-7 rounded-full bg-leaf-3" aria-hidden />
            {mr ? "असायला हवी ती पातळी" : "The range to be in"}
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="size-4 rounded-full bg-leaf ring-2 ring-surface"
              aria-hidden
            />
            {mr ? "बरोबर आहे" : "Where it should be"}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-5 rounded-full bg-anar" aria-hidden />
            {mr ? "किती कमी पडतं" : "How far short"}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-5 rounded-full bg-haldi" aria-hidden />
            {mr ? "किती जास्त झालं" : "How far over"}
          </span>
        </div>
      </div>

      {/* ---- What to do about it. -------------------------------------- */}
      <Verdict short={short} over={over} okCount={ok.length} mr={mr} />
    </div>
  );
}

/**
 * One end of the range, tied to the band edge it names by a short tick.
 */
function Bound({ at, value }: { at: number; value: string }) {
  return (
    <span
      className="absolute flex -translate-x-1/2 flex-col items-center"
      style={{ left: `${at * 100}%` }}
    >
      <span className="h-2 w-px bg-ink/30" aria-hidden />
      <span className="tnum mt-0.5 text-[12px] font-semibold whitespace-nowrap text-ink-soft">
        {value}
      </span>
    </span>
  );
}

/**
 * How far off, in words.
 *
 * The chart used to print "−35" under the reading and leave the farmer to work
 * out what the sign meant and what to do about it. The direction is the whole
 * message — short means buy some, over means stop buying it — so it is stated,
 * not encoded. `formatGap` still supplies the figure, so this cannot drift
 * from the bar beside it.
 */
function gapPhrase(r: CardRow, tone: CardTone, mr: boolean): string {
  // The sign is carried by the words now, so drop it from the figure.
  const amount = formatGap(r).replace(/^[+−]/, "");
  const withUnit = r.unit ? `${amount} ${r.unit}` : amount;

  if (tone === "short") return mr ? `${withUnit} कमी पडतंय` : `${withUnit} short`;
  return mr ? `${withUnit} जास्त झालंय` : `${withUnit} over`;
}

/**
 * The sentence a farmer would have written down after reading the chart. It is
 * generated from the same rows, so it cannot drift from what is drawn above —
 * and an excess is stated as money, because that is what it is: fertilizer
 * already in the ground, bought again next season unless someone says so.
 */
function Verdict({
  short,
  over,
  okCount,
  mr,
}: {
  short: CardRow[];
  over: CardRow[];
  okCount: number;
  mr: boolean;
}) {
  const { t } = useLang();
  const list = (rows: CardRow[]) => rows.map((r) => t(r.key)).join(", ");

  return (
    <div className="border-t border-line bg-leaf-1/60 px-5 py-5 sm:px-6">
      <p className="leading-relaxed text-ink-soft">
        {over.length ? (
          <>
            <span className="font-semibold text-ink">
              {over.length}{" "}
              {mr
                ? over.length === 1
                  ? "गोष्ट गरजेपेक्षा जास्त आहे"
                  : "गोष्टी गरजेपेक्षा जास्त आहेत"
                : over.length === 1
                  ? "reading is above its range"
                  : "readings are above their range"}
              {" — "}
            </span>
            {list(over)}.{" "}
            {mr
              ? "ही खतं या हंगामात पुन्हा घ्यायची गरज नाही."
              : "That is fertilizer this field does not need buying again."}{" "}
          </>
        ) : null}

        {short.length ? (
          <>
            <span className="font-semibold text-ink">
              {short.length}{" "}
              {mr
                ? short.length === 1
                  ? "गोष्ट कमी आहे"
                  : "गोष्टी कमी आहेत"
                : short.length === 1
                  ? "reading is short"
                  : "readings are short"}
              {" — "}
            </span>
            {list(short)}.{" "}
          </>
        ) : null}

        {okCount
          ? mr
            ? `उरलेल्या ${okCount} गोष्टी जिथे हव्यात तिथेच आहेत.`
            : `The other ${okCount} are where they should be.`
          : null}
      </p>
    </div>
  );
}

/**
 * One of the three counts at the top.
 *
 * Blocks in the row's own colour rather than a dot beside a figure: this strip
 * is the summary of the twelve below it, and it should be readable as three
 * quantities of colour from across a room. A count of zero is drawn flat and
 * quiet — "nothing is over its range" is good news and should not shout in
 * amber for attention it does not need.
 */
function Tally({ n, tone, label }: { n: number; tone: CardTone; label: string }) {
  const none = n === 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 rounded-xl px-3 py-2",
        none ? "bg-transparent ring-1 ring-line" : toneSolid[tone],
      )}
    >
      <span
        className={cn(
          "tnum text-[26px] leading-none font-bold",
          none && "text-ink-mute",
        )}
      >
        {n}
      </span>
      <span
        className={cn(
          "text-[14px] leading-tight font-semibold",
          none && "text-ink-mute",
        )}
      >
        {label}
      </span>
    </span>
  );
}

function SortButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-colors",
        // The house fill, straight off <Button variant="primary"> — darkest
        // thing on paper, the lime in the dark.
        active
          ? "bg-ink text-paper dark:bg-leaf-5 dark:text-on-light"
          : "text-ink-soft hover:text-ink",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
