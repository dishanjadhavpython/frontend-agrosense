"use client";

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSun,
  Cloudy,
  Droplets,
  MapPin,
  Sprout,
  Sun,
  TrendingDown,
  TrendingUp,
  Wind,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/Reveal";
import {
  HEAT_STRESS,
  PLACE,
  TODAY_INDEX,
  ahead,
  balance,
  conditionKey,
  conditionOf,
  dayNumber,
  hhmm,
  levelOf,
  past,
  pctOf,
  rainCeiling,
  tempBounds,
  weekdayEn,
  weekdayInitial,
  weekdayMr,
  type Condition,
  type Day,
  type Level,
  type Weather,
} from "@/data/weather";

/**
 * Weather, read the way a farmer needs it.
 *
 * A consumer weather app answers "will it rain on me". This has to answer
 * something harder — whether the field has enough water — and the two are not
 * the same question. 72 mm fell here over ten days and the crop still ends next
 * week 26 mm short, because evapotranspiration took more out than the sky is
 * about to put back. That gap is the section.
 *
 * Built as a board of separate cards rather than one long panel. Six readings
 * that have nothing to do with each other — air against soil against wind —
 * were sharing one surface and reading as a single table nobody would scan;
 * given a card each, with a fill behind the number and a word for where it
 * sits, each one becomes a thing you can take in on its own and move past.
 *
 * Colour is the product's green and turmeric throughout. Rainfall is green,
 * which is what `globals.css` always intended — the five-step leaf ramp exists
 * to drive "the rainfall calendar" (PLAN.md §3) and this is it. Turmeric
 * carries heat and air. Pomegranate appears only where something is wrong,
 * which is how it keeps meaning anything.
 */

export function WeatherPanel({ weather }: { weather: Weather | null }) {
  const { t, lang } = useLang();
  const mr = lang === "mr";

  return (
    <Section
      id="weather"
      eyebrow={t("weather")}
      heading={
        mr
          ? "तुमच्या भागातलं हवामान, तुमच्या पिकांसाठी"
          : "Weather for this location, for your crops"
      }
      lede={
        mr
          ? "मागच्या दहा दिवसांत किती पाऊस पडला आणि पुढच्या सात दिवसांत किती पडणार — आणि त्यातलं किती पिकाला खरंच मिळणार."
          : "How much rain fell over the last ten days, how much is coming in the next seven — and how much of it your crop actually gets to keep."
      }
    >
      <Reveal className="mt-10">
        {weather ? <Board weather={weather} /> : <Unavailable />}
      </Reveal>
    </Section>
  );
}

function Unavailable() {
  const { t } = useLang();
  return (
    <div className="grid min-h-[16rem] place-items-center rounded-[var(--radius-photo)] border border-line bg-surface px-6 py-16 text-center">
      <div>
        <Cloudy className="mx-auto size-9 text-ink-mute" strokeWidth={1.5} aria-hidden />
        <p className="mt-4 max-w-sm text-ink-soft">{t("wxUnavailable")}</p>
      </div>
    </div>
  );
}

/* ---- Motion -------------------------------------------------------------
   One entrance for the whole board, staggered, and one hover for every card.
   `useReducedMotion` is read into the transition and into whether `whileHover`
   is passed at all — a hover prop renders nothing on the server, so gating it
   can't desynchronise hydration the way branching markup would. */

const EASE = [0.16, 1, 0.3, 1] as const;

const boardIn: Variants = {
  rest: {},
  in: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

function useCardMotion() {
  const reduced = useReducedMotion();

  const card: Variants = {
    rest: { opacity: 0, y: 18 },
    in: {
      opacity: 1,
      y: 0,
      transition: reduced ? { duration: 0 } : { duration: 0.6, ease: EASE },
    },
  };

  const hover = reduced
    ? undefined
    : { y: -4, transition: { type: "spring" as const, stiffness: 380, damping: 26 } };

  return { reduced, card, hover };
}

/** Every surface on the board. One radius, one border, one lift. */
function Card({
  children,
  className,
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  const { card, hover: lift } = useCardMotion();

  return (
    <motion.div
      variants={card}
      whileHover={hover ? lift : undefined}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-photo)] border border-line bg-surface",
        "transition-[border-color,box-shadow] duration-300",
        hover && "hover:border-leaf/40",
        className,
      )}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {children}
    </motion.div>
  );
}

function Board({ weather }: { weather: Weather }) {
  const { days } = weather;

  return (
    <motion.div
      className="space-y-4 sm:space-y-5"
      variants={boardIn}
      initial="rest"
      whileInView="in"
      viewport={{ once: true, margin: "-8% 0px" }}
    >
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.55fr_1fr]">
        <SkyHero weather={weather} />
        <BalanceFeature days={days} />
      </div>

      <MetricRow weather={weather} />
      <RainCard days={days} />
    </motion.div>
  );
}

/* ---- The sky ------------------------------------------------------------
   The one place the reference boards were right: weather is a thing you look
   at, and a sky says more about today than an icon does.

   Same treatment `CardUpload` proved — photo bled edge to edge under a
   measured scrim, `chalk`/`mist` type on it. That pair sits outside the theme
   swap on purpose: a photograph is a lit surface with no dark mode, so type on
   it can't flip either. Until the photograph is delivered the same scrim sits
   over the ploughed-rows surface every awaiting image on this site falls back
   to, so nothing moves when the file lands. */

const SKY = "weather/monsoon-sky.jpg";
const WATER = "weather/water.jpg";

const conditionIcon: Record<Condition, typeof Sun> = {
  clear: Sun,
  partly: CloudSun,
  overcast: Cloudy,
  fog: Cloudy,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  storm: CloudLightning,
};

function SkyHero({ weather }: { weather: Weather }) {
  const { t, lang } = useLang();
  const mr = lang === "mr";
  const { now, days } = weather;
  const today = days[TODAY_INDEX];
  const sky = photo(SKY);
  const condition = conditionOf(now.code);
  const Icon = conditionIcon[condition];

  return (
    <Card className="min-h-[15rem] border-transparent bg-night">
      {sky ? (
        <Image
          src={sky}
          alt=""
          fill
          sizes="(max-width: 1024px) 100vw, 760px"
          aria-hidden
          // A slow drift on hover. The photograph is the only thing in the
          // section big enough to carry movement without becoming noise.
          className="object-cover transition-transform duration-[1.2s] ease-[var(--ease-regur)] group-hover:scale-105"
        />
      ) : (
        <div
          className="field-rows absolute inset-0 transition-transform duration-[1.2s] ease-[var(--ease-regur)] group-hover:scale-105"
          style={
            {
              backgroundImage:
                "linear-gradient(160deg, var(--color-leaf-4) 0%, var(--color-leaf-5) 55%, var(--color-night-rise) 100%)",
              // Furrows are lit on a dark field, and this band is dark in both
              // themes — so the line colour is set here rather than inherited,
              // which would draw it near-black on near-black in light mode.
              "--field-row-line": "rgba(246,230,200,0.10)",
              "--field-row-pitch": "26px",
            } as CSSProperties
          }
          aria-hidden
        />
      )}

      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,12,9,.74) 0%, rgba(7,12,9,.52) 46%, rgba(7,12,9,.80) 100%)",
        }}
        aria-hidden
      />

      {process.env.NODE_ENV !== "production" && !sky ? (
        <span className="absolute top-3 right-4 z-10 font-mono text-[11px] text-mist/70">
          {SKY}
        </span>
      ) : null}

      <div className="relative flex h-full flex-col justify-between gap-6 p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <p className="flex items-center gap-1.5 text-[15px] font-semibold text-chalk">
            <MapPin className="size-4 shrink-0" strokeWidth={1.9} aria-hidden />
            {mr ? PLACE.mr : PLACE.en}
            <span className="font-normal text-mist">
              · {mr ? PLACE.districtMr : PLACE.districtEn}
            </span>
          </p>

          <span className="inline-flex items-center gap-2 rounded-full bg-chalk/12 px-3 py-1.5 text-[13px] font-semibold text-chalk ring-1 ring-chalk/22 backdrop-blur-sm">
            <Icon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
            {t(conditionKey[condition])}
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p className="flex items-start gap-1">
              <span className="tnum text-[4rem] leading-[0.85] font-semibold text-chalk sm:text-[5rem]">
                {Math.round(now.temp)}
              </span>
              <span className="mt-1 text-2xl text-mist">°C</span>
            </p>
            <p className="mt-3 text-[15px] text-mist">
              {t("wxFeelsLike")} {Math.round(now.feels)}° ·{" "}
              {Math.round(today.tMin)}–{Math.round(today.tMax)}° {mr ? "आज" : "today"}
            </p>
          </div>

          {/* The API's own clock, never the rendering machine's. It is honest
              about how stale an hourly-revalidated page is, and a relative
              "2 hours ago" would differ between server and client on every
              single render. */}
          <p className="tnum text-[13px] text-mist">
            {mr ? "वेळ" : "as of"} {hhmm(now.time)}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---- The water balance --------------------------------------------------
   The one card that breaks the paper rhythm, because it carries the one
   number the whole section exists to produce. Deep standing-crop green on
   paper, new-growth lime in the dark — so the type on it flips where the
   ground does, `chalk` on the deep green and `on-light` on the lime. */

function BalanceFeature({ days }: { days: Day[] }) {
  const { t, lang } = useLang();
  const mr = lang === "mr";
  const before = balance(past(days));
  const next = balance(ahead(days));
  const short = next.net < 0;

  const water = photo(WATER);

  return (
    <Card className="border-transparent">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(155deg, var(--color-leaf-4) 0%, var(--color-leaf-5) 100%)",
        }}
        aria-hidden
      />
      {/* Water, for the card about water — but only its structure. The
          photograph is a saturated blue and this product has no blue in it, so
          it is desaturated and dimmed and laid over the green at a low alpha:
          you read splash and droplets, you do not read a blue picture. Dimmed
          rather than merely faded because the bright foam, left alone, put the
          14px line under the number below AA on the light theme. */}
      {water ? (
        <Image
          src={water}
          alt=""
          fill
          sizes="(max-width: 1024px) 100vw, 460px"
          aria-hidden
          className="object-cover opacity-[0.18] brightness-[0.72] saturate-[0.35] transition-transform duration-[1.4s] ease-[var(--ease-regur)] group-hover:scale-105 dark:opacity-[0.14] dark:brightness-[0.9]"
        />
      ) : null}
      {/* A soft bloom that tracks the hover, so the card feels lit rather than
          painted. Pure decoration, and the only one on the board. */}
      <div
        className="absolute -top-16 -right-10 size-48 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-60"
        style={{ background: "var(--color-haldi)" }}
        aria-hidden
      />

      <div className="relative flex h-full flex-col gap-5 p-6 text-chalk sm:p-7 dark:text-on-light">
        <div>
          <p className="eyebrow text-chalk/70 dark:text-on-light/70">
            {t("wxBalance")}
          </p>
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="tnum text-[2.75rem] leading-none font-semibold">
              {next.net > 0 ? "+" : next.net < 0 ? "−" : ""}
              {Math.abs(Math.round(next.net))}
            </span>
            <span className="font-mono text-[13px] opacity-75">mm</span>
          </p>
          <p className="mt-2 text-[14px] leading-snug opacity-85">
            {short
              ? mr
                ? "पुढच्या सात दिवसांत एवढं पाणी कमी पडेल"
                : "the shortfall over the next seven days"
              : mr
                ? "पुढच्या सात दिवसांत एवढं पाणी शिल्लक राहील"
                : "the surplus over the next seven days"}
          </p>
        </div>

        <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t border-chalk/20 pt-5 text-[13px] dark:border-on-light/20">
          <Split label={t("wxLast10")} value={before.net} />
          <Split label={t("wxNext7")} value={next.net} />
          <div className="col-span-2 flex items-center justify-between opacity-80">
            <dt>{t("wxWaterIn")} / {t("wxWaterOut")}</dt>
            <dd className="tnum">
              {Math.round(next.rain)} / {Math.round(next.et0)} mm
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

function Split({ label, value }: { label: string; value: number }) {
  const n = Math.round(value);
  const Icon = n < 0 ? TrendingDown : TrendingUp;
  return (
    <div>
      <dt className="opacity-75">{label}</dt>
      <dd className="tnum mt-1 flex items-center gap-1.5 text-[1.05rem] font-semibold">
        <Icon className="size-4 shrink-0 opacity-80" strokeWidth={2.1} aria-hidden />
        {n > 0 ? "+" : n < 0 ? "−" : ""}
        {Math.abs(n)}
        <span className="font-mono text-[11px] font-normal opacity-70">mm</span>
      </dd>
    </div>
  );
}

/* ---- The five readings --------------------------------------------------
   A card each. The fill behind every number is the point: "21 km/h" is a fact
   nobody can place, and the same number three-quarters along its range, with
   the word "strong" under it, is a reading. */

type Tone = "leaf" | "haldi";

const toneRing: Record<Tone, string> = {
  leaf: "bg-leaf-wash text-leaf",
  haldi: "bg-haldi-wash text-haldi-ink",
};

const toneFill: Record<Tone, string> = {
  leaf: "bg-leaf",
  haldi: "bg-haldi",
};

function MetricRow({ weather }: { weather: Weather }) {
  const { t, lang } = useLang();
  const mr = lang === "mr";
  const { now, days } = weather;
  const today = days[TODAY_INDEX];
  const ceiling = rainCeiling(days);

  const word = (level: Level, low: string, ok: string, high: string) =>
    level === "low" ? low : level === "high" ? high : ok;

  return (
    // Two up even on a phone. Stacked one per row, five readings turned into a
    // column of scrolling nobody would reach the end of.
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-5">
      <Metric
        icon={Droplets}
        tone="leaf"
        label={t("wxAirMoisture")}
        value={Math.round(now.humidity)}
        unit="%"
        pct={pctOf(now.humidity, 100)}
        note={word(
          levelOf(now.humidity, 40, 80),
          mr ? "कोरडी हवा" : "Dry air",
          mr ? "ठीक आहे" : "Comfortable",
          mr ? "दमट — रोगाचा धोका" : "Humid — disease risk",
        )}
      />
      <Metric
        icon={Sprout}
        tone="leaf"
        label={t("wxSoilMoisture")}
        // Volumetric water content, shown as percent of soil volume. The raw
        // m³/m³ is the same number and means nothing to anyone with a spade.
        value={now.soil === null ? "—" : Math.round(now.soil * 100)}
        unit={now.soil === null ? "" : "%"}
        pct={now.soil === null ? 0 : pctOf(now.soil, 0.5)}
        note={
          now.soil === null
            ? "—"
            : word(
                levelOf(now.soil, 0.15, 0.4),
                mr ? "कोरडी माती" : "Drying out",
                mr ? "पुरेसा ओलावा" : "Well watered",
                mr ? "भरपूर ओलावा" : "Near saturation",
              )
        }
      />
      <Metric
        icon={CloudRain}
        tone="leaf"
        label={t("wxRainToday")}
        value={today.rain.toFixed(1)}
        unit="mm"
        pct={pctOf(today.rain, ceiling)}
        note={word(
          levelOf(today.rain, 1, 20),
          mr ? "जवळपास कोरडा दिवस" : "Barely anything",
          mr ? "बरा पाऊस" : "A useful fall",
          mr ? "जोरदार पाऊस" : "Heavy",
        )}
      />
      <Metric
        icon={Wind}
        tone="haldi"
        label={t("wxWind")}
        value={Math.round(now.wind)}
        unit="km/h"
        pct={pctOf(now.wind, 40)}
        note={word(
          levelOf(now.wind, 10, 25),
          mr ? "शांत — फवारणीस योग्य" : "Still — good for spraying",
          mr ? "साधारण वारा" : "Moderate",
          mr ? "जोरात — फवारणी टाळा" : "Too strong to spray",
        )}
      />
      <Metric
        icon={Sun}
        tone="haldi"
        label={t("wxEt0")}
        value={today.et0.toFixed(1)}
        unit="mm"
        pct={pctOf(today.et0, 8)}
        note={word(
          levelOf(today.et0, 3, 5.5),
          mr ? "कमी बाष्पीभवन" : "Losing little",
          mr ? "नेहमीसारखं" : "Typical for the season",
          mr ? "जास्त — पाणी लवकर उडतंय" : "Drying fast",
        )}
        className="max-lg:col-span-2 lg:max-xl:col-span-3"
      />
    </div>
  );
}

function Metric({
  icon: Icon,
  tone,
  label,
  value,
  unit,
  pct,
  note,
  className,
}: {
  icon: typeof Sun;
  tone: Tone;
  label: string;
  value: ReactNode;
  unit: string;
  pct: number;
  note: string;
  className?: string;
}) {
  const { reduced } = useCardMotion();

  return (
    <Card className={className}>
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-[11px] transition-transform duration-300 group-hover:scale-110",
              toneRing[tone],
            )}
          >
            <Icon className="size-[18px]" strokeWidth={1.9} aria-hidden />
          </span>
          <p className="min-w-0 text-[13px] leading-tight text-ink-mute">{label}</p>
        </div>

        <p className="mt-4 flex items-baseline gap-1">
          <span className="tnum text-[2rem] leading-none font-semibold text-ink">
            {value}
          </span>
          {unit ? (
            <span className="font-mono text-[12px] text-ink-mute">{unit}</span>
          ) : null}
        </p>

        {/* Where that number sits in the range it lives in. */}
        <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-leaf-1">
          <motion.div
            className={cn("h-full rounded-full", toneFill[tone])}
            initial={{ width: 0 }}
            whileInView={{ width: `${pct}%` }}
            viewport={{ once: true }}
            transition={reduced ? { duration: 0 } : { duration: 0.8, ease: EASE }}
          />
        </div>
        <p className="mt-2.5 text-[13px] leading-snug text-ink-soft">{note}</p>
      </div>
    </Card>
  );
}

/* ---- The eighteen days --------------------------------------------------
   One column per day carrying both rows, so rainfall and temperature share a
   single date axis by construction rather than by two charts being lined up
   and drifting apart at the next breakpoint.

   Solid bars happened. Hatched bars haven't. */

function RainCard({ days }: { days: Day[] }) {
  const { t, lang } = useLang();
  const mr = lang === "mr";
  const { reduced } = useCardMotion();

  const ceiling = rainCeiling(days);
  const temp = tempBounds(days);
  const fell = Math.round(past(days).reduce((s, d) => s + d.rain, 0));
  const due = Math.round(ahead(days).reduce((s, d) => s + d.rain, 0));

  const grow: Variants = {
    rest: { height: "0%" },
    grown: (i: number) => ({
      height: "var(--bar-h)",
      transition: reduced ? { duration: 0 } : { duration: 0.7, delay: 0.022 * i, ease: EASE },
    }),
  };
  return (
    <Card hover={false}>
      <noscript>
        <style>{`[data-rainbar]{height:var(--bar-h)!important}[data-tempbar]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <p className="eyebrow text-ink-mute">{t("wxRainfall")}</p>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="tnum text-[2rem] leading-none font-semibold text-leaf">
                {fell}
              </span>
              <span className="font-mono text-[12px] text-ink-mute">mm</span>
              <span className="text-[14px] text-ink-soft">
                {mr ? "मागच्या १० दिवसांत पडला" : "fell over the last 10 days"}
              </span>
            </p>
            <p className="mt-1.5 text-[14px] text-ink-soft">
              <span className="tnum font-semibold text-ink">{due} mm</span>{" "}
              {mr ? "पुढच्या ७ दिवसांत अपेक्षित" : "expected over the next 7"}
            </p>
          </div>
          <p className="tnum text-[12px] text-ink-mute">
            0 – {ceiling} mm · {temp.lo}–{temp.hi} °C
          </p>
        </div>

        <div className="relative mt-7">
          {/* Today, and the line between what is known and what is expected —
              both drawn once across the whole stack rather than per column, so
              the rain bars, the temperature ribbon and the dates all get the
              same mark in the same place. */}
          <span
            className="pointer-events-none absolute inset-y-0 z-0 rounded-md bg-haldi/12"
            style={{
              left: `${(TODAY_INDEX / days.length) * 100}%`,
              width: `${(1 / days.length) * 100}%`,
            }}
            aria-hidden
          />
          <span
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-ink/25"
            style={{ left: `${((TODAY_INDEX + 1) / days.length) * 100}%` }}
            aria-hidden
          />

          <motion.ol
            className="relative grid"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
            initial="rest"
            whileInView="grown"
            viewport={{ once: true, margin: "-10% 0px" }}
          >
            {days.map((d, i) => {
              const forecast = d.when === "ahead";
              const rainPct = Math.min(100, (d.rain / ceiling) * 100);

              return (
                <li
                  key={d.date}
                  className="group/day px-px"
                  title={`${mr ? weekdayMr(d.date) : weekdayEn(d.date)} ${dayNumber(d.date)} · ${d.rain.toFixed(1)} mm · ${Math.round(d.tMin)}–${Math.round(d.tMax)}°C`}
                >
                  {/* A track behind every bar. Without it a 0.3 mm forecast is
                      a three-pixel smudge floating in whitespace; with it, the
                      column is visibly there and visibly nearly empty, which is
                      the actual news. */}
                  <div className="flex h-28 w-full items-end rounded-[3px] bg-leaf-1/55 transition-colors group-hover/day:bg-leaf-1 sm:h-32">
                    <motion.div
                      data-rainbar
                      custom={i}
                      variants={grow}
                      style={
                        {
                          "--bar-h": `${rainPct}%`,
                          // Denser toward the base — a column of water reads as
                          // heavier at the bottom, and a flat fill doesn't.
                          backgroundImage: forecast
                            ? undefined
                            : "linear-gradient(180deg, var(--color-leaf-3) 0%, var(--color-leaf-5) 100%)",
                          "--hatch-ink":
                            "color-mix(in oklab, var(--color-leaf) 70%, transparent)",
                        } as CSSProperties
                      }
                      className={cn(
                        "w-full rounded-[3px]",
                        rainPct === 0 ? "min-h-px" : "min-h-[6px]",
                        forecast && "hatch bg-leaf-1 ring-1 ring-leaf/30 ring-inset",
                      )}
                    />
                  </div>
                </li>
              );
            })}
          </motion.ol>

          <TempRibbon days={days} bounds={temp} />

          <ol
            className="relative mt-2 grid"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map((d) => (
              <li key={d.date} className="flex flex-col items-center gap-0.5">
                <span
                  className={cn(
                    "text-[10px] leading-none",
                    d.when === "today"
                      ? "font-semibold text-haldi-ink"
                      : "text-ink-mute",
                  )}
                >
                  {weekdayInitial(d.date, mr)}
                </span>
                <span className="tnum hidden text-[10px] leading-none text-ink-mute sm:block">
                  {dayNumber(d.date)}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3.5 text-[13px] text-ink-mute">
          <span>← {t("wxLast10")}</span>
          <span className="font-semibold text-haldi-ink">{t("wxToday")}</span>
          <span>{t("wxNext7")} →</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-mute">
          <Key
            className="h-3.5 w-5 rounded-[3px]"
            style={{
              backgroundImage:
                "linear-gradient(180deg, var(--color-leaf-3) 0%, var(--color-leaf-5) 100%)",
            }}
          >
            {mr ? "पडलेला पाऊस" : "Rain that fell"}
          </Key>
          <Key
            className="hatch h-3.5 w-5 rounded-[3px] bg-leaf-1"
            style={
              {
                "--hatch-ink": "color-mix(in oklab, var(--color-leaf) 60%, transparent)",
              } as CSSProperties
            }
          >
            {mr ? "अपेक्षित पाऊस" : "Rain expected"}
          </Key>
          <Key
            className="h-3.5 w-5 rounded-[3px]"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--color-haldi) 55%, transparent), color-mix(in oklab, var(--color-haldi) 14%, transparent))",
              borderTop: "2px solid var(--color-haldi)",
            }}
          >
            {mr ? "दिवसाचं कमी–जास्त तापमान" : "The day's low to high"}
          </Key>
          <Key className="size-2.5 rounded-full bg-anar">
            {mr ? `${HEAT_STRESS}°C च्या वर` : `Above ${HEAT_STRESS}°C`}
          </Key>
        </div>
      </div>
    </Card>
  );
}

/**
 * Temperature as one continuous band, not eighteen separate marks.
 *
 * It was drawn as a bar per day and that was the weakest thing on the board:
 * overnight lows here barely move, so eighteen bars bottoming out at the same
 * place and topping out within four degrees of each other read as a row of
 * identical ticks carrying no information. Joined into a ribbon, the same
 * numbers become a shape — the dip on the 31st, when a storm dropped the
 * afternoon high by four degrees, is suddenly the obvious feature.
 *
 * `preserveAspectRatio="none"` stretches the viewBox to the grid's width so
 * the points land on the same columns as the bars above. That distorts
 * geometry, so the stroke is `non-scaling-stroke` and anything that has to
 * stay round is a positioned div rather than an SVG circle.
 */
function TempRibbon({ days, bounds }: { days: Day[]; bounds: ReturnType<typeof tempBounds> }) {
  const { reduced } = useCardMotion();
  const n = days.length;

  const r = (v: number) => Math.round(v * 1000) / 1000;
  const x = (i: number) => r(((i + 0.5) / n) * 100);
  const y = (v: number) => r(((bounds.hi - v) / bounds.span) * 100);

  const highs = days.map((d, i) => `${x(i)},${y(d.tMax)}`);
  const lows = days.map((d, i) => `${x(i)},${y(d.tMin)}`).reverse();
  const band = [...highs, ...lows].join(" ");

  return (
    <motion.div
      data-tempbar
      className="relative mt-2 h-14 w-full sm:h-16"
      style={{ transformOrigin: "bottom" }}
      initial={{ opacity: 0, scaleY: 0.45 }}
      whileInView={{ opacity: 1, scaleY: 1 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={reduced ? { duration: 0 } : { duration: 0.8, ease: EASE }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id="wx-temp-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-haldi)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--color-haldi)" stopOpacity="0.14" />
          </linearGradient>
        </defs>
        <polygon points={band} fill="url(#wx-temp-band)" />
        <polyline
          points={highs.join(" ")}
          fill="none"
          stroke="var(--color-haldi)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Only the days that break the heat threshold get a mark. A dot on all
          eighteen would be the row of identical ticks again, one shape later. */}
      {days.map((d, i) =>
        d.tMax >= HEAT_STRESS ? (
          <span
            key={d.date}
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-anar ring-2 ring-surface"
            style={{ left: `${x(i)}%`, top: `${y(d.tMax)}%` }}
            aria-hidden
          />
        ) : null,
      )}
    </motion.div>
  );
}

function Key({
  className,
  style,
  children,
}: {
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("shrink-0", className)} style={style} aria-hidden />
      {children}
    </span>
  );
}
