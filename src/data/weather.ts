import type { DictKey } from "@/lib/i18n";

/**
 * Weather for one place, from Open-Meteo.
 *
 * The only section on this site that runs on real data. Everything else —
 * crops, fertilizers, the soil reading — is a fixture behind an honesty notice,
 * because extraction isn't wired up. Weather doesn't need a notice: it is free,
 * needs no key, and is true at the moment it is fetched.
 *
 * What matters agronomically is not the temperature. It is the pair of
 * rainfall and ET₀ — what the sky put in against what the crop took out — which
 * is why the water balance below is the point of this file and the °C is
 * garnish. A farmer deciding whether to irrigate this week is asking exactly
 * that question, and no consumer weather app answers it.
 *
 * Only `fetchWeather` touches the network. Everything under it is pure
 * derivation from the payload, so the component can be handed one object and
 * ask it questions.
 */

/* ---- The place ----------------------------------------------------------
   Fixed, and named plainly on screen. This is a public landing page: a
   visitor must never take a demonstration for a reading from their own field,
   which is the same rule the Predict panel follows for soil. */

export const PLACE = {
  mr: "बारामती",
  en: "Baramati",
  districtMr: "पुणे जिल्हा",
  districtEn: "Pune district",
  lat: 18.1516,
  lon: 74.5815,
} as const;

/** 10 behind + today + 7 ahead. Today lands at index 10 of `days`. */
const PAST_DAYS = 10;
const FORECAST_DAYS = 8;
export const TODAY_INDEX = PAST_DAYS;

export type When = "past" | "today" | "ahead";

export type Day = {
  /** "2026-08-05", in the location's own timezone. */
  date: string;
  /** mm that fell, or is expected to. */
  rain: number;
  tMin: number;
  tMax: number;
  /** Reference evapotranspiration — mm the crop and soil gave back. */
  et0: number;
  /** Mean relative humidity, %. */
  humidity: number;
  /** Strongest wind of the day, km/h. */
  wind: number;
  /** WMO code. See `conditionOf`. */
  code: number;
  when: When;
};

export type Now = {
  /** The API's own clock, not ours — see the note on `fetchWeather`. */
  time: string;
  temp: number;
  feels: number;
  humidity: number;
  rain: number;
  wind: number;
  code: number;
  /** Water in the top 7 cm, m³/m³. What a root actually meets. */
  soil: number | null;
};

export type Weather = {
  now: Now;
  days: Day[];
};

/* ---- Fetching ----------------------------------------------------------- */

const ENDPOINT =
  "https://api.open-meteo.com/v1/forecast" +
  `?latitude=${PLACE.lat}&longitude=${PLACE.lon}` +
  `&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}` +
  "&daily=precipitation_sum,temperature_2m_max,temperature_2m_min," +
  "et0_fao_evapotranspiration,relative_humidity_2m_mean,weather_code," +
  "wind_speed_10m_max" +
  "&current=temperature_2m,relative_humidity_2m,apparent_temperature," +
  "precipitation,weather_code,wind_speed_10m" +
  "&hourly=soil_moisture_0_to_7cm&forecast_hours=1" +
  "&timezone=Asia%2FKolkata";

type ApiShape = {
  current: Record<string, number | string>;
  daily: Record<string, (number | string)[]>;
  hourly?: { soil_moisture_0_to_7cm?: (number | null)[] };
};

/**
 * One call covers the whole window: the forecast endpoint's `past_days` reaches
 * backwards, so the separate archive API — which lags several days and would
 * have left a hole either side of today — isn't needed.
 *
 * Cached for an hour. `cacheComponents` is not enabled in `next.config.ts`, so
 * this project is on the previous model and `next.revalidate` is the correct
 * lever; the page stays prerendered and refreshes hourly.
 *
 * Returns `null` rather than throwing, and that is not defensive habit: this
 * runs during `next build`, which prerenders `/`. An unreachable API must
 * degrade to a section that says so, never to a failed build.
 */
export async function fetchWeather(): Promise<Weather | null> {
  try {
    const res = await fetch(ENDPOINT, { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const raw = (await res.json()) as ApiShape;
    const d = raw.daily;
    const dates = d.time as string[];
    if (!Array.isArray(dates) || dates.length === 0) return null;

    const num = (row: (number | string)[] | undefined, i: number) => {
      const v = row?.[i];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    };

    const days: Day[] = dates.map((date, i) => ({
      date,
      rain: num(d.precipitation_sum, i),
      tMin: num(d.temperature_2m_min, i),
      tMax: num(d.temperature_2m_max, i),
      et0: num(d.et0_fao_evapotranspiration, i),
      humidity: num(d.relative_humidity_2m_mean, i),
      wind: num(d.wind_speed_10m_max, i),
      code: num(d.weather_code, i),
      when: i < TODAY_INDEX ? "past" : i === TODAY_INDEX ? "today" : "ahead",
    }));

    const c = raw.current;
    const soil = raw.hourly?.soil_moisture_0_to_7cm?.[0];

    return {
      days,
      now: {
        time: typeof c.time === "string" ? c.time : days[TODAY_INDEX].date,
        temp: Number(c.temperature_2m) || 0,
        feels: Number(c.apparent_temperature) || 0,
        humidity: Number(c.relative_humidity_2m) || 0,
        rain: Number(c.precipitation) || 0,
        wind: Number(c.wind_speed_10m) || 0,
        code: Number(c.weather_code) || 0,
        soil: typeof soil === "number" ? soil : null,
      },
    };
  } catch {
    return null;
  }
}

/* ---- Reading the window -------------------------------------------------
   `days` is always ordered oldest → newest with today at TODAY_INDEX, so both
   halves are a slice. Never recompute "today" from a clock: the array was
   built in Asia/Kolkata and a browser in another timezone would disagree with
   the server about which column carries the rule. */

/**
 * Exactly the ten days before today, and exactly the seven after. Today is in
 * neither: it is half-measured and half-forecast, and folding it into either
 * span would make a panel labelled "last 10 days" quietly sum eleven.
 */
export const past = (days: Day[]) => days.slice(0, TODAY_INDEX);
export const ahead = (days: Day[]) => days.slice(TODAY_INDEX + 1);

const sum = (days: Day[], pick: (d: Day) => number) =>
  days.reduce((total, d) => total + pick(d), 0);

export const rainTotal = (days: Day[]) => sum(days, (d) => d.rain);
export const et0Total = (days: Day[]) => sum(days, (d) => d.et0);

export type Balance = { rain: number; et0: number; net: number };

/**
 * What the sky put in, against what the crop took out. A positive net means the
 * soil gained water over the span; a negative one is the shortfall a farmer
 * would have to make up with irrigation, in millimetres they can act on.
 */
export function balance(days: Day[]): Balance {
  const rain = rainTotal(days);
  const et0 = et0Total(days);
  return { rain, et0, net: rain - et0 };
}

/* ---- Axes ---------------------------------------------------------------
   Both scales come from the data. A fixed 0–100 mm axis turns a normal week
   into eighteen invisible stubs, and a fixed 0–50 °C axis flattens a Deccan
   fortnight — which sits inside about eight degrees — into a straight line. */

/** Top of the rainfall axis, with a floor so a dry spell still draws. */
export function rainCeiling(days: Day[]) {
  const peak = Math.max(...days.map((d) => d.rain), 0);
  return Math.max(10, Math.ceil(peak / 5) * 5);
}

/**
 * °C bounds, padded just off the observed range. One degree, not several: a
 * monsoon fortnight here lives inside about eight degrees, and every degree of
 * slack spent on empty axis is a degree of difference the eye can't see.
 */
export function tempBounds(days: Day[]) {
  const lo = Math.floor(Math.min(...days.map((d) => d.tMin)) - 1);
  const hi = Math.ceil(Math.max(...days.map((d) => d.tMax)) + 1);
  return { lo, hi, span: Math.max(1, hi - lo) };
}

/** Above this a Deccan afternoon is crop stress, not just a warm day. */
export const HEAT_STRESS = 38;

/* ---- Gauges -------------------------------------------------------------
   Each metric widget carries a small fill behind its number. A number on its
   own — "21 km/h" — is a fact nobody can place; the same number against the
   range it lives in is a reading. These give every tile the two things it
   needs: how full the bar is, and which of three words to print. */

export type Level = "low" | "ok" | "high";

export const pctOf = (value: number, max: number) =>
  Math.max(0, Math.min(100, (value / max) * 100));

export function levelOf(value: number, under: number, over: number): Level {
  if (value < under) return "low";
  if (value > over) return "high";
  return "ok";
}

/* ---- Conditions ---------------------------------------------------------
   WMO codes, collapsed to the seven a Maharashtra farmer would distinguish.
   Snow and freezing rain fold into their nearest sensible neighbour rather
   than earning icons that will never render here. */

export type Condition =
  | "clear"
  | "partly"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "storm";

export function conditionOf(code: number): Condition {
  if (code >= 95) return "storm";
  if (code >= 80) return "rain";
  if (code >= 61) return "rain";
  if (code >= 51) return "drizzle";
  if (code >= 45) return "fog";
  if (code === 3) return "overcast";
  if (code >= 1) return "partly";
  return "clear";
}

export const conditionKey: Record<Condition, DictKey> = {
  clear: "wxClear",
  partly: "wxPartly",
  overcast: "wxOvercast",
  fog: "wxFog",
  drizzle: "wxDrizzle",
  rain: "wxRain",
  storm: "wxStorm",
};

/* ---- What to do about it ------------------------------------------------
   Generated from the same arrays the chart draws, so a sentence can never
   contradict the picture above it. Each rule returns a fact and an
   instruction; a rule that can only say "the weather is normal" is left out,
   because a farmer who reads three sentences of nothing stops reading.

   NOT CURRENTLY RENDERED. The advisory cards came off the weather board on
   request. This is kept because the rules and the Marathi copy are the
   expensive part and the board is the cheap part — re-mounting `<Advisories>`
   is a few lines, rewriting these thresholds is not. Delete it outright if the
   feature is genuinely dead rather than parked. */

export type Advice = {
  id: string;
  tone: "dry" | "wet" | "disease" | "spray" | "heat";
  mr: string;
  en: string;
};

const mm = (n: number) => Math.round(n);

export function advice(w: Weather): Advice[] {
  const out: Advice[] = [];
  const next = ahead(w.days);
  const before = past(w.days);
  const nextBalance = balance(next);
  const dryRun = next.filter((d) => d.rain < 1).length;

  // The one that matters most this week: water going out with none coming in.
  if (nextBalance.net < -10) {
    out.push({
      id: "irrigate",
      tone: "dry",
      // The dry-day count leads, because "six of the next seven days" is a
      // thing a farmer can picture and "−30 mm" is not.
      mr: `पुढच्या ${next.length} पैकी ${dryRun} दिवस कोरडे. पाऊस फक्त ${mm(nextBalance.rain)} मिमी, आणि पीक ${mm(nextBalance.et0)} मिमी पाणी घेणार — सुमारे ${mm(Math.abs(nextBalance.net))} मिमी कमी पडेल. पाण्याची सोय करून ठेवा.`,
      en: `${dryRun} of the next ${next.length} days are dry. Only ${mm(nextBalance.rain)} mm of rain is coming while the crop loses ${mm(nextBalance.et0)} mm — about ${mm(Math.abs(nextBalance.net))} mm short. Plan to irrigate.`,
    });
  } else if (nextBalance.net > 25) {
    out.push({
      id: "wet",
      tone: "wet",
      mr: `पुढच्या सात दिवसांत ${mm(nextBalance.rain)} मिमी पाऊस अपेक्षित आहे. शेतात पाणी साचणार नाही याकडे लक्ष द्या.`,
      en: `${mm(nextBalance.rain)} mm of rain is expected over the next seven days. Check that your field drains — standing water does more damage than a dry week.`,
    });
  }

  // Top-dressed urea washes off. Three days is the window that matters.
  const soon = next.slice(0, 3);
  const soonRain = rainTotal(soon);
  if (soonRain > 20) {
    out.push({
      id: "hold-urea",
      tone: "wet",
      mr: `पुढच्या तीन दिवसांत ${mm(soonRain)} मिमी पाऊस येतोय. आत्ता वरून खत टाकू नका — ते वाहून जाईल.`,
      en: `${mm(soonRain)} mm is due in the next three days. Don't top-dress fertilizer now — it will wash straight off.`,
    });
  }

  // Sustained damp air is what fungal disease waits for.
  const damp = before.filter((d) => d.humidity >= 75).length;
  if (damp >= 7) {
    // "10 of the last 10 days" is a sentence no one writes out loud.
    const every = damp === before.length;
    out.push({
      id: "disease",
      tone: "disease",
      mr: every
        ? `गेले सलग ${before.length} दिवस हवेतला ओलावा ७५% च्या वर आहे. बुरशीजन्य रोगाकडे लक्ष ठेवा.`
        : `गेल्या ${before.length} दिवसांपैकी ${damp} दिवस हवेतला ओलावा ७५% च्या वर होता. बुरशीजन्य रोगाकडे लक्ष ठेवा.`,
      en: every
        ? `Air moisture has been above 75% every one of the last ${before.length} days. That is fungal disease weather — check the underside of leaves.`
        : `Air moisture stayed above 75% on ${damp} of the last ${before.length} days. That is fungal disease weather — check the underside of leaves.`,
    });
  }

  // A spraying day is a dry, still one. Worth naming when it exists.
  const sprayDay = next.find((d) => d.rain < 1 && d.wind < 20);
  if (sprayDay) {
    out.push({
      id: "spray",
      tone: "spray",
      mr: `${weekdayMr(sprayDay.date)}: पाऊस नाही, वारा कमी. फवारणीसाठी चांगला दिवस.`,
      en: `${weekdayEn(sprayDay.date)} is dry with light wind — a good day to spray.`,
    });
  }

  const hot = w.days.filter((d) => d.tMax >= HEAT_STRESS).length;
  if (hot > 0) {
    out.push({
      id: "heat",
      tone: "heat",
      mr: `${hot} दिवस ${HEAT_STRESS}°C च्या वर जाणार. दुपारी पाणी देऊ नका.`,
      en: `${hot} ${hot === 1 ? "day goes" : "days go"} above ${HEAT_STRESS}°C. Don't irrigate in the afternoon heat.`,
    });
  }

  // Three is what a farmer standing in a field will actually read.
  return out.slice(0, 3);
}

/* ---- Dates --------------------------------------------------------------
   Parsed as local noon, not midnight UTC: `new Date("2026-08-05")` is midnight
   UTC, which in a timezone behind GMT lands on the 4th and shifts every
   weekday letter on the axis by one. */

const at = (iso: string) => new Date(`${iso}T12:00:00`);

const MR_DAYS = ["रवि", "सोम", "मंगळ", "बुध", "गुरु", "शुक्र", "शनि"];

export const weekdayMr = (iso: string) => MR_DAYS[at(iso).getDay()];

export const weekdayEn = (iso: string) =>
  at(iso).toLocaleDateString("en-IN", { weekday: "short" });

/** Single letter for the axis, where eighteen columns leave no room. */
export const weekdayInitial = (iso: string, mr: boolean) =>
  mr ? MR_DAYS[at(iso).getDay()][0] : weekdayEn(iso).slice(0, 1);

export const dayNumber = (iso: string) => at(iso).getDate();

/** "5 Aug" — used sparsely, where a column needs anchoring. */
export const dayMonthShort = (iso: string) =>
  at(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** "12:00" straight off the payload — never a clock on the rendering machine. */
export const hhmm = (isoTime: string) => isoTime.slice(11, 16);
