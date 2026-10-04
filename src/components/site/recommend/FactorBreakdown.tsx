"use client";

import type { ComponentType } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CloudRain,
  Droplets,
  FlaskConical,
  Gem,
  Layers,
  Lightbulb,
  Ruler,
  Thermometer,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { CropNeeds, SuitabilityFactors } from "@/lib/recommendTypes";

/**
 * Why a crop suits this field, and the one thing holding it back.
 *
 * The engine's gate is Liebig's law: `score = min(eight factors)`. This used
 * to be drawn as the textbook barrel — eight staves, water up to the shortest
 * — and it was right and unreadable. Every stave was labelled with a 0-1
 * score ("0.62") and an abbreviation ("LGP"), so the picture could only be
 * read by someone who already knew what it said.
 *
 * So the same eight numbers are now said the way a farmer would say them:
 *
 *   1. **What holds it back, in a sentence** — the weakest factor named, what
 *      the field has against what the crop wants, and what can be done about
 *      it. That one sentence is what the barrel existed to show.
 *   2. **Every check, weakest first** — a meter out of 10, a word for the band,
 *      and the two real numbers behind it ("here 22 °C · likes 24–30 °C").
 *
 * The bands are the engine's own suitability classes (0.75 / 0.50 / 0.25), so
 * the word on a meter can never disagree with the word on the crop's card.
 *
 * `needs` is optional: an engine that predates it sends only `evidence`, and
 * the rows then carry the field's own value without the crop's window rather
 * than inventing one.
 */

type FactorKey = keyof SuitabilityFactors;

/** Fixed order — ties keep it, so two crops with equal scores read alike. */
const ORDER: FactorKey[] = [
  "rain", "temp", "pH", "depth", "drainage", "salinity", "LGP", "texture",
];

type Words = { mr: string; en: string };

const LABEL: Record<FactorKey, Words> = {
  rain: { mr: "हंगामातलं पाणी", en: "Water this season" },
  temp: { mr: "तापमान", en: "Temperature" },
  pH: { mr: "मातीचा सामू (pH)", en: "Soil pH" },
  depth: { mr: "मातीची खोली", en: "Soil depth" },
  drainage: { mr: "पाण्याचा निचरा", en: "Drainage" },
  salinity: { mr: "मातीतले क्षार", en: "Salt in the soil" },
  LGP: { mr: "पावसावरचा वाढीचा काळ", en: "Rain-fed growing days" },
  texture: { mr: "मातीचा पोत", en: "Soil texture" },
};

const ICON: Record<FactorKey, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  rain: CloudRain,
  temp: Thermometer,
  pH: FlaskConical,
  depth: Ruler,
  drainage: Droplets,
  salinity: Gem,
  LGP: CalendarDays,
  texture: Layers,
};

/** The name the engine uses for a factor, in the farmer's words. */
export function factorLabel(name: string, mr: boolean): string {
  const entry = (LABEL as Record<string, Words>)[name];
  return entry ? (mr ? entry.mr : entry.en) : name;
}

/* ---- Bands -------------------------------------------------------------- */

type Band = "good" | "fair" | "weak" | "poor";

const bandOf = (v: number): Band =>
  v >= 0.75 ? "good" : v >= 0.5 ? "fair" : v >= 0.25 ? "weak" : "poor";

const BAND: Record<Band, Words & { chip: string; fill: string }> = {
  good: { mr: "चांगलं", en: "Good", chip: "bg-leaf-wash text-leaf-deep", fill: "bg-leaf" },
  fair: { mr: "ठीक", en: "Fair", chip: "bg-haldi-wash text-haldi-ink", fill: "bg-haldi" },
  weak: { mr: "कमकुवत", en: "Weak", chip: "bg-anar-wash text-anar", fill: "bg-anar/80" },
  poor: { mr: "अयोग्य", en: "Poor", chip: "bg-anar-wash text-anar", fill: "bg-anar" },
};

/* ---- The numbers behind each meter ------------------------------------- */

const DRAINAGE: Record<number, Words> = {
  1: { mr: "पाणी साचून राहतं", en: "poorly drained — water stands" },
  2: { mr: "पाणी उशिरा निघतं", en: "slow to drain" },
  3: { mr: "मध्यम निचरा", en: "moderately well drained" },
  4: { mr: "चांगला निचरा", en: "well drained" },
  5: { mr: "पाणी लवकर निघून जातं", en: "drains fast" },
  6: { mr: "पाणी लगेच निघून जातं", en: "drains very fast — holds little water" },
};

/**
 * `round` for the field's own class; `ceil`/`floor` for the ends of a crop's
 * window, so a window of 3.0–5.5 names the classes wholly inside it ("moderately
 * well drained to drains fast") rather than rounding 5.5 up into the one
 * class it stops short of.
 */
const drainageWord = (ord: number, mr: boolean, snap: "round" | "ceil" | "floor" = "round") => {
  const w = DRAINAGE[Math.min(6, Math.max(1, Math[snap](ord)))];
  return mr ? w.mr : w.en;
};

const TEXTURE: Record<string, Words> = {
  Clayey: { mr: "भारी, चिकण", en: "clayey (heavy)" },
  "Clayey-skeletal": { mr: "चिकण, खडेयुक्त", en: "clayey with gravel" },
  Loamy: { mr: "पोयटा (मध्यम)", en: "loamy (medium)" },
  "Loamy-skeletal": { mr: "पोयटा, खडेयुक्त", en: "loamy with gravel" },
};

const textureWord = (t: string, mr: boolean) => {
  const w = TEXTURE[t];
  return w ? (mr ? w.mr : w.en) : t;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const fmt = (v: number, digits = 0) =>
  v.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Which way a value sits outside its window, if it does. */
type Side = "low" | "high" | null;
const sideOf = (here: number | null, window?: [number, number]): Side => {
  if (here == null || !window) return null;
  if (here < window[0]) return "low";
  if (here > window[1]) return "high";
  return null;
};

type Detail = { line: string | null; side: Side };

/**
 * "Here x · likes y–z", in the farmer's language, for one factor. Returns no
 * line where the engine sent nothing to say it from — a row with only its
 * meter is honest; a row with a number nobody measured is not.
 */
function detailFor(
  key: FactorKey,
  value: number,
  evidence: Record<string, number | boolean>,
  needs: Partial<CropNeeds> | undefined,
  mr: boolean,
): Detail {
  switch (key) {
    case "rain": {
      const here = num(evidence.effective_water_mm);
      const want = needs?.rain_mm;
      const irrigated = evidence.irrigated === true;
      const side = sideOf(here, want);
      if (irrigated && value >= 0.99 && side === "low") {
        return {
          side: null,
          line: mr
            ? "तुम्ही पाणी देता, त्यामुळे कमी पडणारं पाणी भरून निघतं."
            : "You irrigate, so the shortfall is made up.",
        };
      }
      if (here == null) return { line: null, side };
      const tail = want
        ? mr ? ` · लागतं ${fmt(want[0])}–${fmt(want[1])} मिमी` : ` · needs ${fmt(want[0])}–${fmt(want[1])} mm`
        : "";
      return { side, line: mr ? `इथे ${fmt(here)} मिमी${tail}` : `Here ${fmt(here)} mm${tail}` };
    }
    case "temp": {
      const here = num(evidence.tmean_c);
      const want = needs?.temp_c;
      if (here == null) return { line: null, side: null };
      const tail = want
        ? mr ? ` · आवडतं ${fmt(want[0])}–${fmt(want[1])} °C` : ` · likes ${fmt(want[0])}–${fmt(want[1])} °C`
        : "";
      return {
        side: sideOf(here, want),
        line: mr ? `हंगामाचं सरासरी ${fmt(here, 1)} °C${tail}` : `Season average ${fmt(here, 1)} °C${tail}`,
      };
    }
    case "pH": {
      const here = num(evidence.pH);
      const want = needs?.pH;
      if (here == null) return { line: null, side: null };
      const tail = want
        ? mr ? ` · आवडतो ${fmt(want[0], 1)}–${fmt(want[1], 1)}` : ` · likes ${fmt(want[0], 1)}–${fmt(want[1], 1)}`
        : "";
      return {
        side: sideOf(here, want),
        line: mr ? `तुमच्या मातीचा ${fmt(here, 1)}${tail}` : `Your soil ${fmt(here, 1)}${tail}`,
      };
    }
    case "depth": {
      const here = num(evidence.depth_mm);
      const min = num(needs?.min_depth_mm);
      if (here == null) return { line: null, side: null };
      const tail = min != null
        ? mr ? ` · किमान ${fmt(min / 10)} सेंमी लागते` : ` · needs at least ${fmt(min / 10)} cm`
        : "";
      return {
        side: min != null && here < min ? "low" : null,
        line: mr ? `सुमारे ${fmt(here / 10)} सेंमी खोल${tail}` : `About ${fmt(here / 10)} cm deep${tail}`,
      };
    }
    case "drainage": {
      const here = num(evidence.drainage_ord);
      const want = needs?.drainage_ord;
      if (here == null) return { line: null, side: null };
      const same = want ? Math.ceil(want[0]) >= Math.floor(want[1]) : true;
      const tail = want
        ? mr
          ? ` · आवडतो: ${drainageWord(want[0], true, "ceil")}${same ? "" : ` ते ${drainageWord(want[1], true, "floor")}`}`
          : ` · likes ${drainageWord(want[0], false, "ceil")}${same ? "" : ` to ${drainageWord(want[1], false, "floor")}`}`
        : "";
      return {
        side: sideOf(here, want),
        line: mr ? `तुमची माती: ${drainageWord(here, true)}${tail}` : `Your soil: ${drainageWord(here, false)}${tail}`,
      };
    }
    case "salinity": {
      const here = num(evidence.saline_pct);
      const max = num(needs?.max_saline_pct);
      if (here == null) return { line: null, side: null };
      const tail = max != null
        ? mr ? ` · ${fmt(max)}% पर्यंत सहन होतं` : ` · copes with up to ${fmt(max)}%`
        : "";
      // Zero is the engine's answer when the card's EC is inside its range:
      // this field is not saline. Anything else is the taluka's share.
      if (here === 0) {
        return {
          side: null,
          line: mr ? "तुमच्या पत्रिकेनुसार माती खारट नाही" : "Your card says the soil is not salty",
        };
      }
      return {
        side: max != null && here > max ? "high" : null,
        line: mr
          ? `तालुक्यातले ${fmt(here, 1)}% नमुने खारट${tail}`
          : `${fmt(here, 1)}% of the taluka's samples are salty${tail}`,
      };
    }
    case "LGP": {
      // Only a limit for short crops in the rainfed season; the engine sets it
      // to 1.0 everywhere else, and a day count printed under a factor that
      // was never applied would read as a problem that is not there.
      const here = num(evidence.lgp_days);
      const min = num(needs?.min_lgp_days);
      if (value >= 0.99 || here == null) return { line: null, side: null };
      const tail = min != null
        ? mr ? ` · ${fmt(min)} दिवस लागतात` : ` · needs ${fmt(min)}`
        : "";
      return {
        side: "low",
        line: mr ? `सुमारे ${fmt(here)} दिवस${tail}` : `About ${fmt(here)} days${tail}`,
      };
    }
    case "texture": {
      const want = needs?.textures;
      if (!want?.length) return { line: null, side: null };
      const list = want.map((t) => textureWord(t, mr)).join(mr ? ", " : " or ");
      return { side: null, line: mr ? `आवडतो: ${list}` : `Likes ${list} soil` };
    }
  }
}

/* ---- What to do about the weakest one ---------------------------------- */

/**
 * Standard agronomy for each limit, by the direction it fails in. Kept to
 * what any KVK would say and nothing crop-specific: the engine knows which
 * factor binds, not the variety, the stage or the local practice, and advice
 * pretending otherwise would be the model talking past its evidence.
 */
function remedyFor(key: FactorKey, side: Side, mr: boolean): string {
  const r = (m: string, e: string) => (mr ? m : e);
  switch (key) {
    case "rain":
      return side === "high"
        ? r("पीक जास्त पावसाचं नाही — शेतात पाणी साचू देऊ नका; सरी-वरंबा किंवा गादीवाफे मदत करतात.",
            "More rain than this crop likes — keep water from standing; ridges and furrows or raised beds help.")
        : r("फुलोरा आणि दाणे भरताना संरक्षित पाणी द्या, किंवा कमी कालावधीची जात निवडा.",
            "Give protective irrigation at flowering and grain filling, or choose a short-duration variety.");
    case "temp":
      return side === "high"
        ? r("इथे पिकाला आवडतं त्यापेक्षा उष्ण आहे — कृषी विभागाने सांगितलेल्या वेळेतच पेरणी करा आणि उष्णतेच्या दिवसांत संध्याकाळी पाणी द्या.",
            "Warmer than this crop likes — sow in the window your KVK recommends, and irrigate in the evening during hot spells.")
        : side === "low"
          ? r("इथे पिकाला आवडतं त्यापेक्षा थंड आहे — शिफारस केलेल्या वेळेत पेरणी करा, म्हणजे नाजूक अवस्था थंडीत येणार नाही.",
              "Cooler than this crop likes — sow in the recommended window so its sensitive stage misses the cold.")
          : r("शिफारस केलेल्या वेळेतच पेरणी करा, म्हणजे फुलोरा प्रतिकूल तापमानात येणार नाही.",
              "Sow in the recommended window so flowering avoids the worst of the heat or cold.");
    case "pH":
      return side === "low"
        ? r("माती आम्लयुक्त आहे — माती परीक्षणाच्या सल्ल्याप्रमाणे शेतीचा चुना वापरा.",
            "The soil is acidic — apply agricultural lime as your soil test advises.")
        : r("माती अल्कधर्मी आहे — जिप्सम आणि भरपूर शेणखत/कंपोस्ट वापरा; अमोनियम सल्फेटसारखी खतं मदत करतात.",
            "The soil is alkaline — use gypsum and plenty of farmyard manure or compost; fertilisers like ammonium sulphate help.");
    case "depth":
      return r("माती उथळ आहे — कमी कालावधीची जात निवडा, आच्छादन करून ओलावा टिकवा.",
               "The soil is shallow — choose a short-duration variety and mulch to hold moisture.");
    case "drainage":
      return side === "low"
        ? r("पाणी साचतं — चर काढा किंवा गादीवाफ्यावर लागवड करा, म्हणजे मुळांभोवती पाणी थांबणार नाही.",
            "Water stands — dig drainage channels or plant on raised beds so it does not sit around the roots.")
        : r("पाणी लवकर निघून जातं — शेणखत/कंपोस्ट घालून ओलावा धरून ठेवा, आच्छादन करा आणि थोडं-थोडं पण वारंवार पाणी द्या.",
            "Water drains away fast — add farmyard manure or compost to hold moisture, mulch, and irrigate little and often.");
    case "salinity":
      return r("निचरा सुधारा, जिप्सम वापरा, चांगल्या प्रतीचं पाणी द्या आणि क्षार सहन करणारी जात निवडा.",
               "Improve drainage, apply gypsum, irrigate with good-quality water, and choose a salt-tolerant variety.");
    case "LGP":
      return r("पावसाचा काळ या पिकासाठी कमी पडतो — कमी कालावधीची जात निवडा किंवा संरक्षित पाणी द्या.",
               "The rain-fed season is short for this crop — choose a short-duration variety or give protective irrigation.");
    case "texture":
      return r("शेणखत, कंपोस्ट किंवा हिरवळीचं खत घालून मातीचा पोत सुधारा.",
               "Improve the soil's structure with farmyard manure, compost or green manure.");
  }
}

/* ---- The widget --------------------------------------------------------- */

export function FactorBreakdown({
  crop,
  factors,
  limiting,
  evidence,
  needs,
  mr,
}: {
  /** The crop's display name, for the sentence that leads. */
  crop: string;
  factors: Partial<SuitabilityFactors>;
  /** The engine's own `limiting_factor`. */
  limiting: string;
  evidence: Record<string, number | boolean>;
  needs?: Partial<CropNeeds>;
  mr: boolean;
}) {
  // Only the factors the engine scored. A missing one is left out rather than
  // drawn at zero, which would read as a hard veto.
  const rows = ORDER.filter((k) => typeof factors[k] === "number")
    .map((key) => {
      const value = Math.max(0, Math.min(1, factors[key] as number));
      return { key, value, detail: detailFor(key, value, evidence, needs, mr) };
    })
    // Weakest first: what holds the crop back is what a farmer needs to read
    // before anything else. `sort` is stable, so ties keep the fixed order.
    .sort((a, b) => a.value - b.value);

  if (!rows.length) return null;

  const weakest =
    rows.find((r) => r.key === limiting) ?? rows[0];
  const band = bandOf(weakest.value);
  const allClear = weakest.value >= 0.99;
  const score10 = (v: number) => fmt(v * 10, 1);

  return (
    <div>
      {/* The sentence the whole chart exists to say. */}
      <div
        className={cn(
          "rounded-[16px] border p-4 sm:p-5",
          allClear || band === "good"
            ? "border-leaf/35 bg-leaf-wash"
            : band === "fair"
              ? "border-haldi/45 bg-haldi-wash"
              : "border-anar/40 bg-anar-wash",
        )}
      >
        <p
          className={cn(
            "flex items-start gap-2.5 text-[15.5px] leading-snug font-semibold",
            allClear || band === "good"
              ? "text-leaf-deep"
              : band === "fair"
                ? "text-haldi-ink"
                : "text-anar",
          )}
        >
          {allClear || band === "good" ? (
            <Check className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.2} aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-[18px] shrink-0" strokeWidth={2} aria-hidden />
          )}
          <span>
            {allClear
              ? mr
                ? `${crop} साठी आठही बाबी चांगल्या आहेत — काहीही अडथळा नाही.`
                : `Nothing holds ${crop} back here — all eight checks are comfortably met.`
              : band === "good"
                ? mr
                  ? `${crop} साठी मोठा अडथळा नाही. सगळ्यात कमी गुण: ${factorLabel(weakest.key, true)} (${score10(weakest.value)}/10).`
                  : `Nothing serious holds ${crop} back. The tightest check is ${factorLabel(weakest.key, false).toLowerCase()}, at ${score10(weakest.value)}/10.`
                : mr
                  ? `${crop} ला मागे खेचणारी गोष्ट: ${factorLabel(weakest.key, true)} (${score10(weakest.value)}/10).`
                  : `What holds ${crop} back: ${factorLabel(weakest.key, false).toLowerCase()} (${score10(weakest.value)}/10).`}
          </span>
        </p>

        {!allClear && weakest.detail.line ? (
          <p className="mt-1.5 pl-[28px] text-[14px] leading-relaxed text-ink-soft">
            {weakest.detail.line}
          </p>
        ) : null}

        {!allClear && band !== "good" ? (
          <p className="mt-3 flex items-start gap-2.5 border-t border-ink/10 pt-3 text-[14px] leading-relaxed text-ink">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-haldi-ink" strokeWidth={2} aria-hidden />
            <span>
              <strong className="font-semibold">{mr ? "काय करता येईल: " : "What you can do: "}</strong>
              {remedyFor(weakest.key, weakest.detail.side, mr)}
            </span>
          </p>
        ) : null}

        {!allClear ? (
          <p className="mt-2.5 pl-[28px] text-[12.5px] leading-relaxed text-ink-mute">
            {mr
              ? "पीक त्याच्या सगळ्यात कमकुवत बाबीइतकंच चांगलं येतं — म्हणून बाकीच्या बाबी चांगल्या असल्या तरी हीच ठरवते."
              : "A crop does only as well as its weakest condition allows — so this one decides, however good the rest are."}
          </p>
        ) : null}
      </div>

      {/* Every check, weakest first. */}
      <p className="mt-5 text-[13px] font-medium text-ink-mute">
        {mr ? "आठ बाबी — कमकुवत आधी" : "All eight checks, weakest first"}
      </p>
      <ul className="mt-2 grid gap-x-8 sm:grid-cols-2">
        {rows.map(({ key, value, detail }) => {
          const b = bandOf(value);
          const Icon = ICON[key];
          const isWeakest = key === weakest.key && !allClear;
          return (
            <li
              key={key}
              className={cn(
                "border-b border-line py-3 last:border-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-0",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-[10px]",
                    isWeakest ? BAND[b].chip : "bg-surface text-ink-mute ring-1 ring-line",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-ink">
                  {mr ? LABEL[key].mr : LABEL[key].en}
                </span>
                <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                  {score10(value)}
                  <span className="font-normal text-ink-mute">/10</span>
                </span>
                <span
                  className={cn(
                    "w-[4.5rem] shrink-0 rounded-full px-2 py-0.5 text-center text-[11.5px] font-semibold",
                    BAND[b].chip,
                  )}
                >
                  {mr ? BAND[b].mr : BAND[b].en}
                </span>
              </div>
              <div
                className="mt-2 ml-11 h-1.5 overflow-hidden rounded-full bg-ink/10"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={10}
                aria-valuenow={Math.round(value * 100) / 10}
                aria-label={mr ? LABEL[key].mr : LABEL[key].en}
              >
                <div
                  className={cn("h-full rounded-full", BAND[b].fill)}
                  style={{ width: `${Math.max(3, value * 100)}%` }}
                />
              </div>
              {detail.line ? (
                <p className="mt-1.5 ml-11 text-[12.5px] leading-snug text-ink-mute">{detail.line}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
