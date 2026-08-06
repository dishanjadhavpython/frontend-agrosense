"use client";

/**
 * Bilingual layer — Marathi and English.
 *
 * Headings, labels and primary actions render as pairs: the active language
 * leads, the other follows quietly underneath. The toggle swaps which leads.
 * Long-form explanatory copy stays English by design.
 *
 * Terminology follows the Maharashtra Soil Health Card, which prints
 * नत्र / स्फुरद / पालाश rather than transliterated English. Farmers read
 * that card; the app should speak the same words.
 *
 * `Entry` carries an optional `hi` so Hindi can be filled in later without
 * touching a single call site.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Lang = "mr" | "en";

type Entry = { mr: string; en: string; hi?: string };

export const dict = {
  // ---- Product ----------------------------------------------------------
  appName: { mr: "अ‍ॅग्रोसेन्स", en: "AgroSense" },
  tagline: { mr: "मातीपासून बाजारापर्यंत", en: "From soil to sale" },

  // ---- Navigation -------------------------------------------------------
  navDashboard: { mr: "माझी शेती", en: "My farm" },
  navInsights: { mr: "सल्ला", en: "Insights" },
  navMarket: { mr: "बाजारभाव", en: "Market" },
  navChat: { mr: "विचारा", en: "Ask" },
  navReports: { mr: "अहवाल", en: "Reports" },
  navProfile: { mr: "माझी माहिती", en: "Profile" },
  navSupport: { mr: "मदत", en: "Support" },
  navSoilScan: { mr: "माती तपासा", en: "Soil scan" },
  navMore: { mr: "अधिक", en: "More" },

  // ---- Actions ----------------------------------------------------------
  actTestSoil: { mr: "माती तपासा", en: "Test my soil" },
  actGetStarted: { mr: "सुरुवात करा", en: "Get started" },
  actSignIn: { mr: "लॉग इन करा", en: "Sign in" },
  actSignUp: { mr: "नोंदणी करा", en: "Create account" },
  actSignOut: { mr: "बाहेर पडा", en: "Sign out" },
  actContinue: { mr: "पुढे चला", en: "Continue" },
  actBack: { mr: "मागे", en: "Back" },
  actSkip: { mr: "नंतर करा", en: "Skip for now" },
  actUpload: { mr: "अपलोड करा", en: "Upload" },
  actConfirm: { mr: "होय, बरोबर आहे", en: "Looks right" },
  actEdit: { mr: "दुरुस्त करा", en: "Edit values" },
  actViewAll: { mr: "सर्व पहा", en: "View all" },
  actDownload: { mr: "डाउनलोड करा", en: "Download" },
  actShare: { mr: "शेअर करा", en: "Share" },
  actPrint: { mr: "प्रिंट करा", en: "Print" },
  actSend: { mr: "पाठवा", en: "Send" },
  actTakePhoto: { mr: "फोटो घ्या", en: "Take photo" },
  actRetake: { mr: "पुन्हा फोटो घ्या", en: "Retake" },
  actChooseFile: { mr: "फाइल निवडा", en: "Choose file" },
  actTrySample: { mr: "नमुना कार्ड वापरा", en: "Try a sample card" },
  actAddPlot: { mr: "शेत जोडा", en: "Add plot" },
  actSave: { mr: "जतन करा", en: "Save" },
  actCancel: { mr: "रद्द करा", en: "Cancel" },
  actCall: { mr: "फोन करा", en: "Call" },
  actSeeReport: { mr: "अहवाल पहा", en: "Open report" },
  actAskThis: { mr: "याबद्दल विचारा", en: "Ask about this" },

  // ---- Soil nutrients — as printed on the Soil Health Card --------------
  nutPh: { mr: "सामू", en: "pH" },
  nutEc: { mr: "क्षारता", en: "Salinity (EC)" },
  nutOc: { mr: "सेंद्रिय कर्ब", en: "Organic carbon" },
  nutN: { mr: "नत्र", en: "Nitrogen" },
  nutP: { mr: "स्फुरद", en: "Phosphorus" },
  nutK: { mr: "पालाश", en: "Potassium" },
  nutS: { mr: "गंधक", en: "Sulphur" },
  nutZn: { mr: "जस्त", en: "Zinc" },
  nutFe: { mr: "लोह", en: "Iron" },
  nutMn: { mr: "मंगल", en: "Manganese" },
  nutCu: { mr: "तांबे", en: "Copper" },
  nutB: { mr: "बोरॉन", en: "Boron" },

  // ---- Status — the three-colour language ------------------------------
  stLow: { mr: "कमी", en: "Low" },
  stMedium: { mr: "मध्यम", en: "Medium" },
  stHigh: { mr: "जास्त", en: "High" },
  stSufficient: { mr: "पुरेसे", en: "Sufficient" },
  stDeficient: { mr: "कमतरता", en: "Deficient" },
  /* Distinct from stHigh on purpose: "जास्त" describes a level, this names a
     mistake — there is more in the soil than the crop can use, and it was
     paid for. */
  stExcess: { mr: "गरजेपेक्षा जास्त", en: "Excess" },
  stAlkaline: { mr: "क्षारयुक्त", en: "Alkaline" },
  stAcidic: { mr: "आम्लधर्मी", en: "Acidic" },
  stNeutral: { mr: "सर्वसाधारण", en: "Neutral" },

  // ---- Weather ----------------------------------------------------------
  // Conditions are the seven a farmer here would actually distinguish; the
  // WMO's snow and freezing-rain codes fold into their nearest neighbour in
  // `src/data/weather.ts` rather than earning words that never render.
  wxClear: { mr: "निरभ्र", en: "Clear" },
  wxPartly: { mr: "थोडे ढग", en: "Partly cloudy" },
  wxOvercast: { mr: "ढगाळ", en: "Overcast" },
  wxFog: { mr: "धुकं", en: "Fog" },
  wxDrizzle: { mr: "रिमझिम", en: "Drizzle" },
  wxRain: { mr: "पाऊस", en: "Rain" },
  wxStorm: { mr: "गडगडाटी पाऊस", en: "Thunderstorm" },

  wxFeelsLike: { mr: "जाणवतं", en: "Feels like" },
  wxAirMoisture: { mr: "हवेतला ओलावा", en: "Air moisture" },
  wxSoilMoisture: { mr: "मातीतला ओलावा", en: "Soil moisture" },
  wxWind: { mr: "वारा", en: "Wind" },
  wxEt0: { mr: "पिकाने घेतलेलं पाणी", en: "Crop water use" },
  wxRainToday: { mr: "आजचा पाऊस", en: "Rain today" },
  wxLast10: { mr: "मागचे १० दिवस", en: "Last 10 days" },
  wxNext7: { mr: "पुढचे ७ दिवस", en: "Next 7 days" },
  wxToday: { mr: "आज", en: "Today" },
  wxWaterIn: { mr: "पाऊस पडला", en: "Water in" },
  wxWaterOut: { mr: "पीक घेऊन गेलं", en: "Water out" },
  wxWaterNet: { mr: "फरक", en: "Net" },
  wxBalance: { mr: "पाण्याचा हिशेब", en: "Water balance" },
  wxRainfall: { mr: "पाऊस (मिमी)", en: "Rainfall (mm)" },
  wxTempRange: { mr: "तापमान (°C)", en: "Temperature (°C)" },
  wxUnavailable: {
    mr: "हवामानाची माहिती आत्ता मिळत नाही. थोड्या वेळाने पुन्हा बघा.",
    en: "Weather data isn't reachable right now. Try again shortly.",
  },

  // ---- Farming vocabulary ----------------------------------------------
  soil: { mr: "माती", en: "Soil" },
  crop: { mr: "पीक", en: "Crop" },
  fertilizer: { mr: "खत", en: "Fertilizer" },
  weather: { mr: "हवामान", en: "Weather" },
  rainfall: { mr: "पाऊस", en: "Rainfall" },
  risk: { mr: "धोका", en: "Risk" },
  price: { mr: "भाव", en: "Price" },
  mandi: { mr: "बाजार समिती", en: "Mandi" },
  village: { mr: "गाव", en: "Village" },
  taluka: { mr: "तालुका", en: "Taluka" },
  district: { mr: "जिल्हा", en: "District" },
  season: { mr: "हंगाम", en: "Season" },
  kharif: { mr: "खरीप", en: "Kharif" },
  rabi: { mr: "रब्बी", en: "Rabi" },
  summer: { mr: "उन्हाळी", en: "Summer" },
  today: { mr: "आज", en: "Today" },
  yesterday: { mr: "काल", en: "Yesterday" },
  soilCard: { mr: "माती आरोग्य पत्रिका", en: "Soil Health Card" },
  recommendation: { mr: "शिफारस", en: "Recommendation" },

  // ---- Units ------------------------------------------------------------
  unitAcre: { mr: "एकर", en: "acre" },
  unitGuntha: { mr: "गुंठा", en: "guntha" },
  unitQuintal: { mr: "क्विंटल", en: "quintal" },
  unitKg: { mr: "किलो", en: "kg" },
  unitBag: { mr: "बोरा", en: "bag" },

  // ---- Page headings ----------------------------------------------------
  pgDashboard: { mr: "तुमच्या शेताची स्थिती", en: "Your farm today" },
  pgSoilReport: { mr: "माती अहवाल द्या", en: "Add your soil report" },
  pgSoilImage: { mr: "मातीचा फोटो घ्या", en: "Photograph your soil" },
  pgInsights: { mr: "आजचा सल्ला", en: "What to do next" },
  pgMarket: { mr: "आजचे बाजारभाव", en: "Today's mandi prices" },
  pgChat: { mr: "काहीही विचारा", en: "Ask anything" },
  pgReports: { mr: "तुमचे अहवाल", en: "Your reports" },
  pgProfile: { mr: "माझी माहिती", en: "Your details" },
  pgSupport: { mr: "मदत हवी आहे?", en: "Need help?" },

  // ---- Landing ----------------------------------------------------------
  heroTitle: {
    mr: "तुमच्या मातीला काय हवंय,\nते आम्ही सांगू",
    en: "Know exactly what\nyour soil needs",
  },
  heroSub: {
    mr: "माती आरोग्य पत्रिका द्या. पीक, खत आणि भावाचा सल्ला मिळवा.",
    en: "Share your Soil Health Card. Get crop, fertilizer and price advice.",
  },

  // ---- Section headings -------------------------------------------------
  secUpload: { mr: "पत्रिका द्या", en: "Your card" },
  secHowItWorks: { mr: "कसं चालतं", en: "How it works" },
  secCrops: { mr: "शिफारस केलेली पिकं", en: "Recommended crops" },
  secFertilizer: { mr: "खताचं वेळापत्रक", en: "Fertilizer schedule" },
  secAlerts: { mr: "लक्ष द्या", en: "Needs attention" },
  secWeather: { mr: "पुढील ७ दिवस", en: "Next 7 days" },
  secRisk: { mr: "धोक्याचं मूल्यांकन", en: "Risk assessment" },
  secSchemes: { mr: "सरकारी योजना", en: "Government schemes" },
  secGlossary: { mr: "शब्दार्थ", en: "Glossary" },
  secFaq: { mr: "नेहमीचे प्रश्न", en: "Common questions" },
  secPlots: { mr: "माझी शेतं", en: "Your plots" },
  secPrefs: { mr: "सेटिंग्ज", en: "Preferences" },
} satisfies Record<string, Entry>;

export type DictKey = keyof typeof dict;

type LangContextValue = {
  lang: Lang;
  other: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  /** String in the active language. */
  t: (key: DictKey) => string;
  /** Both languages: active first, the other second. */
  pair: (key: DictKey) => { lead: string; sub: string };
};

const LangContext = createContext<LangContextValue | null>(null);

const STORAGE_KEY = "agrosense.lang";

/**
 * The saved language is external state, so it's read through
 * useSyncExternalStore rather than copied into React state inside an effect.
 * The effect version rendered Marathi first and corrected itself a frame
 * later, so anyone who had chosen English watched it flip on every load.
 *
 * `subscribe` also listens for `storage`, which keeps two open tabs in step.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Lang {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "en" || saved === "mr" ? saved : "mr";
}

/** Marathi leads by default — it is what this audience reads. */
function getServerSnapshot(): Lang {
  return "mr";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    window.localStorage.setItem(STORAGE_KEY, l);
    // `storage` doesn't fire in the tab that wrote it, so tell this one.
    listeners.forEach((cb) => cb());
  }, []);

  const value = useMemo<LangContextValue>(() => {
    const other: Lang = lang === "mr" ? "en" : "mr";
    return {
      lang,
      other,
      setLang,
      toggle: () => setLang(other),
      t: (key) => dict[key][lang],
      pair: (key) => ({ lead: dict[key][lang], sub: dict[key][other] }),
    };
  }, [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside <LanguageProvider>");
  return ctx;
}

/**
 * Picks the right half of a bilingual data record, e.g. a crop name that
 * ships as { mr: "सोयाबीन", en: "Soybean" }.
 */
export function useBi() {
  const { lang, other } = useLang();
  return {
    pick: (entry: { mr: string; en: string }) => entry[lang],
    both: (entry: { mr: string; en: string }) => ({
      lead: entry[lang],
      sub: entry[other],
    }),
  };
}
