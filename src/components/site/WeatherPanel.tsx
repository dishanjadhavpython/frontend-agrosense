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
  rainTotal,
  weekdayEn,
  weekdayMr,
  type Condition,
  type Day,
  type Level,
  type Weather,
} from "@/data/weather";

/**
 * Weather, kept to what a farmer acts on.
 *
 * A consumer weather app answers "will it rain on me". A farmer is asking four
 * narrower things, and the board is those four and nothing else:
 *
 *   1. What is it like now?                         — the sky
 *   2. Do I need to water this week?                — the week's water
 *   3. Can I spray today, and is disease coming?    — wind, damp air, topsoil
 *   4. What is each of the next seven days doing?   — the week, day by day
 *
 * What came off is what a farmer could not act on: the evapotranspiration
 * reading on its own card, the water-in / water-out ledger, and an eighteen-
 * day rain-and-temperature ribbon that needed a legend of four symbols to
 * read. The numbers behind them still decide the verdicts here — the week's
 * water is rain against the crop's own use, which is the ET₀ — but they are
 * said as an answer ("about 26 mm short — plan to irrigate"), not handed over
 * to be worked out.
 *
 * Every verdict is a word or a short phrase beside a real number, never a
 * paragraph. The advisory sentences that used to sit under this board came
 * off it on request; they are parked as `advice()` in `data/weather.ts`.
 *
 * Colour is the product's green and turmeric throughout. Pomegranate appears
 * only where something is wrong, which is how it keeps meaning anything.
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
          ? "या आठवड्याचं हवामान, तुमच्या शेतासाठी"
          : "This week's weather, for your farm"
      }
      lede={
        mr
          ? "आजचं हवामान, या आठवड्यात पाणी द्यावं लागेल का, फवारणी करता येईल का — आणि पुढचे सात दिवस."
          : "Today's weather, whether you need to water this week, whether you can spray — and the next seven days."
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
        <WaterWeek days={weather.days} />
      </div>

      <Readings weather={weather} />
      <WeekStrip days={weather.days} />
    </motion.div>
  );
}

/* ---- The sky ------------------------------------------------------------
   Weather is a thing you look at, and a sky says more about today than an
   icon does. Photo bled edge to edge under a measured scrim, `chalk`/`mist`
   type on it — a photograph is a lit surface with no dark mode, so the type
   on it can't flip either. */

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
          className="object-cover transition-transform duration-[1.2s] ease-[var(--ease-regur)] group-hover:scale-105"
        />
      ) : (
        <div
          className="field-rows absolute inset-0 transition-transform duration-[1.2s] ease-[var(--ease-regur)] group-hover:scale-105"
          style={
            {
              backgroundImage:
                "linear-gradient(160deg, var(--color-leaf-4) 0%, var(--color-leaf-5) 55%, var(--color-night-rise) 100%)",
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
            <p className="mt-1 flex items-center gap-1.5 text-[15px] text-mist">
              <CloudRain className="size-4 shrink-0" strokeWidth={1.9} aria-hidden />
              {today.rain >= 0.1
                ? mr
                  ? `आज ${today.rain.toFixed(1)} मिमी पाऊस`
                  : `${today.rain.toFixed(1)} mm of rain today`
                : mr
                  ? "आज पाऊस नाही"
                  : "No rain today"}
            </p>
          </div>

          {/* The API's own clock, never the rendering machine's. */}
          <p className="tnum text-[13px] text-mist">
            {mr ? "वेळ" : "as of"} {hhmm(now.time)}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ---- The week's water ---------------------------------------------------
   The one decision on the board, so the one card that breaks the paper
   rhythm. Rain coming against what the crop will use — the reference
   evapotranspiration — said as an answer rather than as two numbers to
   subtract. Deep standing-crop green on paper, lime in the dark, so the type
   flips where the ground does. */

/** Over one acre, a millimetre of water is 4,047 litres. */
const LITRES_PER_MM_ACRE = 4047;

function WaterWeek({ days }: { days: Day[] }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const next = balance(ahead(days));
  const fell = rainTotal(past(days));
  // Rounded before subtracting, so the sentence's own arithmetic holds:
  // "uses 38, 1 coming, 37 short" — not 38 short off the unrounded values.
  const use = Math.round(next.et0);
  const coming = Math.round(next.rain);
  const short = Math.max(0, use - coming);
  const water = photo(WATER);

  // Within ten millimetres either way is a week the field rides out.
  const verdict: "fine" | "light" | "irrigate" =
    short <= 0 ? "fine" : short <= 10 ? "light" : "irrigate";

  const litres = Math.round((short * LITRES_PER_MM_ACRE) / 1000) * 1000;

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

      <div className="relative flex h-full flex-col gap-4 p-6 text-chalk sm:p-7 dark:text-on-light">
        <p className="eyebrow text-chalk/70 dark:text-on-light/70">
          {mr ? "या आठवड्यात पाणी" : "Water this week"}
        </p>

        <p className="text-[1.6rem] leading-tight font-semibold font-[family-name:var(--font-display)]">
          {verdict === "fine"
            ? mr ? "पाणी देण्याची गरज नाही" : "No need to irrigate"
            : verdict === "light"
              ? mr ? "थोडं पाणी लागू शकतं" : "A light watering may help"
              : mr ? "पाणी देण्याची तयारी ठेवा" : "Plan to irrigate"}
        </p>

        <p className="text-[14.5px] leading-snug opacity-90">
          {verdict === "fine"
            ? mr
              ? `पुढच्या ७ दिवसांत ${coming} मिमी पाऊस — पिकाला लागणाऱ्या ${use} मिमीपेक्षा जास्त.`
              : `${coming} mm of rain is coming in 7 days — as much as the ${use} mm your crop will use, or more.`
            : mr
              ? `पुढच्या ७ दिवसांत पीक ${use} मिमी पाणी वापरेल, पण पाऊस फक्त ${coming} मिमी — सुमारे ${short} मिमी कमी.`
              : `Your crop will use ${use} mm over 7 days and only ${coming} mm of rain is coming — about ${short} mm short.`}
        </p>

        <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t border-chalk/20 pt-4 text-[13px] dark:border-on-light/20">
          <div>
            <dt className="opacity-75">{mr ? "मागच्या १० दिवसांत पडला" : "Fell in the last 10 days"}</dt>
            <dd className="tnum mt-1 text-[1.05rem] font-semibold">
              {Math.round(fell)} <span className="font-mono text-[11px] font-normal opacity-70">mm</span>
            </dd>
          </div>
          <div>
            <dt className="opacity-75">
              {verdict === "fine"
                ? mr ? "पुढच्या ७ दिवसांत येणार" : "Coming in the next 7 days"
                : mr ? "कमी पडणारं पाणी, प्रति एकर" : "Shortfall, per acre"}
            </dt>
            <dd className="tnum mt-1 text-[1.05rem] font-semibold">
              {verdict === "fine" ? (
                <>
                  {coming} <span className="font-mono text-[11px] font-normal opacity-70">mm</span>
                </>
              ) : mr ? (
                `≈ ${litres.toLocaleString("en-IN")} लिटर`
              ) : (
                `≈ ${litres.toLocaleString("en-IN")} litres`
              )}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

/* ---- Three readings -----------------------------------------------------
   One per decision: wind decides spraying, damp air decides disease, the
   topsoil decides whether the last rain is still there. A fill behind each
   number places it in its range, and a few words say what that means. */

type Tone = "leaf" | "haldi";

const toneRing: Record<Tone, string> = {
  leaf: "bg-leaf-wash text-leaf",
  haldi: "bg-haldi-wash text-haldi-ink",
};

const toneFill: Record<Tone, string> = {
  leaf: "bg-leaf",
  haldi: "bg-haldi",
};

function Readings({ weather }: { weather: Weather }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const { now, days } = weather;
  const today = days[TODAY_INDEX];

  const word = (level: Level, low: string, ok: string, high: string) =>
    level === "low" ? low : level === "high" ? high : ok;

  // Spray drifts above ~15 km/h and washes off in rain.
  const rainingToday = today.rain >= 2;
  const sprayNote = rainingToday
    ? mr ? "आज पाऊस — फवारणी वाहून जाईल" : "Rain today — spray would wash off"
    : word(
        levelOf(now.wind, 3, 15),
        mr ? "शांत — फवारणीस योग्य" : "Calm — good for spraying",
        mr ? "फवारणीस योग्य" : "Fine for spraying",
        mr ? "जोरात — फवारणी टाळा" : "Too windy to spray",
      );

  return (
    // Three across from a tablet up; stacked one per row a phone shows each
    // reading at a size it can be read at.
    <div className="grid gap-3 sm:grid-cols-3 sm:gap-5">
      <Metric
        icon={Wind}
        tone="haldi"
        label={mr ? "वारा — फवारणीसाठी" : "Wind — for spraying"}
        value={Math.round(now.wind)}
        unit="km/h"
        pct={pctOf(now.wind, 40)}
        note={sprayNote}
        warn={rainingToday || now.wind > 15}
      />
      <Metric
        icon={Droplets}
        tone="leaf"
        label={mr ? "हवेतला ओलावा — रोगासाठी" : "Air moisture — for disease"}
        value={Math.round(now.humidity)}
        unit="%"
        pct={pctOf(now.humidity, 100)}
        note={word(
          levelOf(now.humidity, 40, 80),
          mr ? "कोरडी हवा — रोगाचा धोका कमी" : "Dry air — low disease risk",
          mr ? "रोगाचा धोका कमी" : "Low disease risk",
          mr ? "दमट — बुरशीजन्य रोगाचा धोका" : "Humid — fungal disease risk",
        )}
        warn={now.humidity > 80}
      />
      <Metric
        icon={Sprout}
        tone="leaf"
        label={mr ? "वरच्या मातीतला ओलावा — पाण्यासाठी" : "Topsoil moisture — for watering"}
        // Volumetric water content, shown as percent of soil volume. The raw
        // m³/m³ is the same number and means nothing to anyone with a spade.
        value={now.soil === null ? "—" : Math.round(now.soil * 100)}
        unit={now.soil === null ? "" : "%"}
        pct={now.soil === null ? 0 : pctOf(now.soil, 0.5)}
        note={
          now.soil === null
            ? mr ? "आत्ता माहिती नाही" : "Not available right now"
            : word(
                levelOf(now.soil, 0.15, 0.4),
                mr ? "वरची माती कोरडी" : "Topsoil drying out",
                mr ? "पुरेसा ओलावा" : "Moist enough",
                mr ? "भरपूर ओलावा — पाणी देऊ नका" : "Very wet — hold the water",
              )
        }
        warn={now.soil !== null && now.soil < 0.15}
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
  warn = false,
  className,
}: {
  icon: typeof Sun;
  tone: Tone;
  label: string;
  value: ReactNode;
  unit: string;
  pct: number;
  note: string;
  /** The reading says to hold off. The note goes red; nothing else does. */
  warn?: boolean;
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

        <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-leaf-1">
          <motion.div
            className={cn("h-full rounded-full", toneFill[tone])}
            initial={{ width: 0 }}
            whileInView={{ width: `${pct}%` }}
            viewport={{ once: true }}
            transition={reduced ? { duration: 0 } : { duration: 0.8, ease: EASE }}
          />
        </div>
        <p className={cn("mt-2.5 text-[14px] leading-snug font-medium", warn ? "text-anar" : "text-ink-soft")}>
          {note}
        </p>
      </div>
    </Card>
  );
}

/* ---- The week, day by day -----------------------------------------------
   Today and the seven after it, one tile each: the sky, the day's high and
   low, and the rain. Eight tiles fit across a laptop; on a phone the row
   scrolls sideways with the tiles snapping into place, rather than squeezing
   eight days into a width that fits four. A day past the heat threshold is
   the only one marked in red. */

function WeekStrip({ days }: { days: Day[] }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const week = days.slice(TODAY_INDEX);
  const ceiling = Math.max(10, ...week.map((d) => d.rain));

  return (
    <Card hover={false}>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="eyebrow text-ink-mute">{mr ? "पुढचे ७ दिवस" : "The next 7 days"}</p>
          <p className="text-[13px] text-ink-mute">
            {mr ? "दिवसाचं कमाल / किमान तापमान आणि पाऊस" : "Each day's high / low, and rain"}
          </p>
        </div>

        <ol className="hide-scrollbar -mx-1 mt-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain px-1 pb-1 lg:grid lg:grid-cols-8 lg:overflow-visible">
          {week.map((d) => {
            const isToday = d.when === "today";
            const Icon = conditionIcon[conditionOf(d.code)];
            const hot = d.tMax >= HEAT_STRESS;
            const rainPct = Math.min(100, (d.rain / ceiling) * 100);
            return (
              <li
                key={d.date}
                className={cn(
                  "flex min-w-[6.25rem] shrink-0 snap-start flex-col items-center rounded-[18px] border px-2 py-3.5 text-center lg:min-w-0",
                  isToday ? "border-haldi/50 bg-haldi-wash" : "border-line bg-paper",
                )}
              >
                <p className={cn("text-[13px] font-semibold", isToday ? "text-haldi-ink" : "text-ink")}>
                  {isToday ? (mr ? "आज" : "Today") : mr ? weekdayMr(d.date) : weekdayEn(d.date)}
                </p>
                <p className="tnum text-[11.5px] text-ink-mute">{dayNumber(d.date)}</p>
                <Icon className="mt-2.5 size-7 text-ink-soft" strokeWidth={1.6} aria-hidden />
                <p className="tnum mt-2.5 text-[15px] font-semibold text-ink">
                  <span className={hot ? "text-anar" : undefined}>{Math.round(d.tMax)}°</span>
                  <span className="ml-1 text-[13px] font-normal text-ink-mute">{Math.round(d.tMin)}°</span>
                </p>
                <div className="mt-2.5 h-1.5 w-full max-w-[4.5rem] overflow-hidden rounded-full bg-leaf-1">
                  <div
                    className="h-full rounded-full bg-leaf"
                    style={{ width: `${d.rain >= 0.1 ? Math.max(6, rainPct) : 0}%` }}
                  />
                </div>
                <p className="tnum mt-1.5 text-[12.5px] text-ink-soft">
                  {d.rain >= 0.1
                    ? `${d.rain.toFixed(d.rain < 10 ? 1 : 0)} mm`
                    : mr ? "कोरडा" : "dry"}
                </p>
                {hot ? (
                  <p className="mt-1 text-[11px] font-semibold text-anar">
                    {mr ? "उष्ण" : "hot"}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>

        {week.some((d) => d.tMax >= HEAT_STRESS) ? (
          <p className="mt-3 text-[12.5px] text-ink-mute">
            {mr
              ? `लाल आकडा म्हणजे ${HEAT_STRESS}°C च्या वर — पिकाला उष्णतेचा ताण. अशा दिवशी दुपारी पाणी देऊ नका.`
              : `A red high is above ${HEAT_STRESS}°C — heat stress for the crop. Don't irrigate in that afternoon's heat.`}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
