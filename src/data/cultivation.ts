import type { Bi } from "./prediction";

/**
 * When and where each crop is grown in India.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NEEDS AGRONOMIST REVIEW. Compiled from ICAR crop calendars, state
 * agriculture department sowing windows and the Ministry of Agriculture's
 * crop-wise production reports. It is a careful first pass by a
 * non-agronomist and should be checked before anyone plants against it — the
 * same standing flag `backend/soil_crop_suitability.py` carries.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Written here rather than gathered by the research agents, deliberately. The
 * agents are good at what changed this week — a scheme, a price, a new
 * variety. A sowing window is not that: it is stable across years, it is the
 * one figure on the page a farmer will act on with a tractor, and an LLM
 * re-deriving it every eight hours would produce a date that quietly differs
 * between two farmers reading the same page on the same morning.
 *
 * Windows are the *national* span, which is wider than any one district's.
 * India runs from Kerala to Punjab and a single sowing month would be wrong
 * for most of the country; the calendar shows the range and the page says so.
 *
 * Months are 0-indexed, January = 0, so they index straight into a array of
 * month names without arithmetic at the call site.
 */

export type Season = "kharif" | "rabi" | "zaid" | "perennial";

/**
 * The states each crop is grown in, as the codes `GrowingRegions` lays out.
 * Only the states where the crop is a significant commercial crop — listing
 * every state where a plant will survive tells a farmer nothing.
 */
export type StateCode =
  | "JK" | "HP" | "PB" | "UK" | "HR" | "RJ" | "UP" | "BR" | "SK" | "AS"
  | "AR" | "NL" | "MN" | "MZ" | "TR" | "ML" | "WB" | "JH" | "OD" | "CT"
  | "MP" | "GJ" | "MH" | "GA" | "KA" | "TG" | "AP" | "TN" | "KL";

export type Cultivation = {
  /** Matches `CROPS[].key`. */
  key: string;
  season: Season;
  /** Month indices. `sow` and `harvest` may wrap across the new year. */
  sow: number[];
  harvest: number[];
  states: StateCode[];
  /** Days from sowing to harvest, as a range. */
  durationDays: [number, number];
  /** Relative irrigation need, 1 (rainfed-tolerant) to 5 (thirsty). */
  water: 1 | 2 | 3 | 4 | 5;
  /** The one sentence a farmer needs about timing. */
  note: Bi;
};

const M = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
} as const;

/** Inclusive month run, wrapping past December. */
const run = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let m = from; ; m = (m + 1) % 12) {
    out.push(m);
    if (m === to) break;
  }
  return out;
};

export const CULTIVATION: Cultivation[] = [
  // ---- Kharif cereals ------------------------------------------------------
  {
    key: "rice",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.oct, M.nov),
    states: ["WB", "UP", "PB", "OD", "BR", "AP", "TG", "TN", "AS", "CT", "MH"],
    durationDays: [120, 150],
    water: 5,
    note: {
      mr: "मान्सूनच्या पहिल्या पावसानंतर रोप लावणी. पाणी साचून राहील अशी जमीन लागते.",
      en: "Transplanted after the first monsoon rains. Needs standing water for most of its life.",
    },
  },
  {
    key: "maize",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.sep, M.oct),
    states: ["KA", "MP", "BR", "TG", "MH", "AP", "RJ", "UP", "TN"],
    durationDays: [90, 120],
    water: 3,
    note: {
      mr: "खरीप, रब्बी आणि उन्हाळी — तिन्ही हंगामांत घेता येतं. पाणी साचलेलं चालत नाही.",
      en: "Grown in all three seasons. Will not tolerate waterlogging at any stage.",
    },
  },

  // ---- Rabi pulses ---------------------------------------------------------
  {
    key: "chickpea",
    season: "rabi",
    sow: run(M.oct, M.nov),
    harvest: run(M.feb, M.mar),
    states: ["MP", "MH", "RJ", "UP", "KA", "AP", "GJ"],
    durationDays: [95, 120],
    water: 1,
    note: {
      mr: "थंडीत येणारं पीक. एक-दोन पाण्यावर येतं, जास्त पाणी दिलं तर वाढ फुकट जाते.",
      en: "A cool-season crop. One or two irrigations is enough — more grows leaf, not grain.",
    },
  },
  {
    key: "pigeonpeas",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.dec, M.jan),
    states: ["MH", "KA", "MP", "UP", "GJ", "TG", "AP", "JH"],
    durationDays: [150, 270],
    water: 2,
    note: {
      mr: "जमिनीत नत्र सोडणारं खोल मुळांचं पीक. कोरडवाहूतही टिकतं.",
      en: "Deep-rooted and nitrogen-fixing — one of the few that holds up on rainfed land.",
    },
  },
  {
    key: "mungbean",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.sep, M.oct),
    states: ["RJ", "MH", "KA", "MP", "AP", "TG", "OD", "BR"],
    durationDays: [60, 75],
    water: 2,
    note: {
      mr: "साठ दिवसांत येणारं पीक — दोन मोठ्या पिकांच्या मधल्या काळात घेता येतं.",
      en: "Ready in about 60 days, which makes it the classic catch crop between two main ones.",
    },
  },
  {
    key: "blackgram",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.sep, M.oct),
    states: ["MP", "UP", "MH", "AP", "TN", "RJ", "TG", "OD"],
    durationDays: [70, 90],
    water: 2,
    note: {
      mr: "भाताच्या नंतर उरलेल्या ओलाव्यावर घेता येतं.",
      en: "Often grown on the residual moisture left after a rice crop.",
    },
  },
  {
    key: "lentil",
    season: "rabi",
    sow: run(M.oct, M.nov),
    harvest: run(M.feb, M.mar),
    states: ["MP", "UP", "BR", "WB", "JH", "RJ"],
    durationDays: [100, 130],
    water: 1,
    note: {
      mr: "थंडी लागते. उत्तर भारतातलं रब्बीचं पीक.",
      en: "Needs a real winter — a north Indian rabi crop rather than a Deccan one.",
    },
  },
  {
    key: "mothbeans",
    season: "kharif",
    sow: run(M.jul, M.aug),
    harvest: run(M.oct, M.nov),
    states: ["RJ", "GJ", "MH", "MP", "HR"],
    durationDays: [70, 90],
    water: 1,
    note: {
      mr: "अत्यंत कमी पावसातही येतं. वाळवंटी भागातलं खात्रीचं पीक.",
      en: "The most drought-hardy pulse on this list — it makes a crop where others fail.",
    },
  },
  {
    key: "kidneybeans",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.sep, M.oct),
    states: ["HP", "UK", "JK", "MH", "KA"],
    durationDays: [90, 120],
    water: 3,
    note: {
      mr: "थंड हवामान लागतं — डोंगराळ भागात चांगलं येतं.",
      en: "Wants cool weather, so it is largely a hill crop in India.",
    },
  },

  // ---- Fruit ---------------------------------------------------------------
  {
    key: "banana",
    season: "perennial",
    sow: run(M.jun, M.aug),
    harvest: run(M.sep, M.dec),
    states: ["TN", "MH", "GJ", "AP", "KA", "MP", "BR", "WB", "KL"],
    durationDays: [300, 365],
    water: 5,
    note: {
      mr: "वर्षभराचं पीक, भरपूर पाणी आणि भरपूर पालाश लागतं. वाऱ्याचा धोका असतो.",
      en: "A year in the ground, thirsty, and a heavy potassium feeder. Wind is its main enemy.",
    },
  },
  {
    key: "mango",
    season: "perennial",
    sow: run(M.jul, M.aug),
    harvest: run(M.apr, M.jun),
    states: ["UP", "AP", "KA", "BR", "GJ", "TN", "MH", "WB", "OD"],
    durationDays: [1460, 1825],
    water: 2,
    note: {
      mr: "लागवडीनंतर चार-पाच वर्षांनी फळ धरतं. मोहोर येताना पाऊस आला की नुकसान.",
      en: "Four to five years to first fruit. Rain during flowering is what costs a season.",
    },
  },
  {
    key: "grapes",
    season: "perennial",
    sow: run(M.jan, M.feb),
    harvest: run(M.feb, M.apr),
    states: ["MH", "KA", "TN", "AP", "PB"],
    durationDays: [1095, 1460],
    water: 3,
    note: {
      mr: "छाटणीवर सगळं ठरतं. नाशिक-सांगली पट्ट्यात एप्रिलपर्यंत काढणी.",
      en: "Everything depends on pruning date. The Nashik–Sangli belt harvests through to April.",
    },
  },
  {
    key: "pomegranate",
    season: "perennial",
    sow: run(M.jul, M.aug),
    harvest: run(M.oct, M.feb),
    states: ["MH", "KA", "GJ", "AP", "RJ", "TN"],
    durationDays: [1095, 1460],
    water: 2,
    note: {
      mr: "कोरड्या हवेत चांगलं. बहर धरून काढणीची वेळ ठरवता येते.",
      en: "Thrives in dry air. The bahar system lets a grower choose which season to harvest in.",
    },
  },
  {
    key: "orange",
    season: "perennial",
    sow: run(M.jun, M.aug),
    harvest: run(M.nov, M.jan),
    states: ["MH", "MP", "RJ", "AS", "PB", "KA"],
    durationDays: [1095, 1460],
    water: 3,
    note: {
      mr: "विदर्भातलं नागपुरी संत्रं — निचरा होणारी जमीन लागते.",
      en: "The Nagpur belt in Vidarbha is the main producer. Demands free-draining soil.",
    },
  },
  {
    key: "papaya",
    season: "perennial",
    sow: run(M.jun, M.sep),
    harvest: run(M.mar, M.jun),
    states: ["AP", "GJ", "KA", "MH", "MP", "WB", "TN"],
    durationDays: [270, 365],
    water: 4,
    note: {
      mr: "लागवडीनंतर नऊ-दहा महिन्यांत फळ. पाणी साचलं की मुळं कुजतात.",
      en: "Fruits in nine or ten months. Standing water rots the collar within days.",
    },
  },
  {
    key: "coconut",
    season: "perennial",
    sow: run(M.may, M.jul),
    harvest: run(M.jan, M.dec),
    states: ["KL", "TN", "KA", "AP", "OD", "WB", "GA", "MH"],
    durationDays: [1825, 2555],
    water: 4,
    note: {
      mr: "पाच-सात वर्षांनी फळ, पण नंतर साठ वर्षं देतं. वर्षभर काढणी.",
      en: "Five to seven years to bear, then sixty years of it. Harvested all year round.",
    },
  },
  {
    key: "watermelon",
    season: "zaid",
    sow: run(M.jan, M.feb),
    harvest: run(M.apr, M.may),
    states: ["UP", "AP", "KA", "TN", "MH", "WB", "RJ", "GJ"],
    durationDays: [80, 100],
    water: 3,
    note: {
      mr: "उन्हाळी पीक. नदीकाठच्या वाळूमिश्रित जमिनीत चांगलं येतं.",
      en: "A summer crop, classically grown on sandy river-bed soils.",
    },
  },
  {
    key: "muskmelon",
    season: "zaid",
    sow: run(M.jan, M.feb),
    harvest: run(M.apr, M.may),
    states: ["UP", "PB", "MH", "AP", "TN", "RJ", "HR"],
    durationDays: [80, 100],
    water: 3,
    note: {
      mr: "पिकताना कोरडं हवामान लागतं — पाऊस आला की गोडी जाते.",
      en: "Needs dry weather while ripening. Rain at that stage takes the sugar out of it.",
    },
  },
  {
    key: "apple",
    season: "perennial",
    sow: run(M.jan, M.feb),
    harvest: run(M.aug, M.oct),
    states: ["JK", "HP", "UK", "AR"],
    durationDays: [1460, 2190],
    water: 2,
    note: {
      mr: "थंडीचे पुरेसे तास लागतात — फक्त डोंगराळ भागातच येतं.",
      en: "Needs a long winter chill, which confines it to the Himalayan states.",
    },
  },

  // ---- Cash crops ----------------------------------------------------------
  {
    key: "cotton",
    season: "kharif",
    sow: run(M.may, M.jul),
    harvest: run(M.oct, M.jan),
    states: ["GJ", "MH", "TG", "AP", "HR", "PB", "RJ", "MP", "KA"],
    durationDays: [160, 200],
    water: 3,
    note: {
      mr: "काळ्या जमिनीतलं मुख्य नगदी पीक. वेचणी दोन-तीन वेळा करावी लागते.",
      en: "The black-soil cash crop. Picked over two or three passes, not all at once.",
    },
  },
  {
    key: "jute",
    season: "kharif",
    sow: run(M.mar, M.apr),
    harvest: run(M.jul, M.aug),
    states: ["WB", "BR", "AS", "OD", "TR", "ML"],
    durationDays: [120, 150],
    water: 5,
    note: {
      mr: "गंगेच्या खोऱ्यातलं पीक. काढणीनंतर पाण्यात कुजवावं लागतं.",
      en: "A Gangetic delta crop. The retting after harvest needs clean standing water.",
    },
  },
  {
    key: "coffee",
    season: "perennial",
    sow: run(M.jun, M.jul),
    harvest: run(M.nov, M.jan),
    states: ["KA", "KL", "TN", "AP", "OD"],
    durationDays: [1095, 1460],
    water: 3,
    note: {
      mr: "सावलीत वाढणारं डोंगरी पीक. पश्चिम घाटातच प्रामुख्याने.",
      en: "Shade-grown, and effectively confined to the Western Ghats and their spurs.",
    },
  },
  // ---- Maharashtra's own, added with the recommendation engine -------------
  // Twelve crops the engine ranks that this file had no calendar for. Same
  // standing caveat as everything above: compiled from ICAR package-of-
  // practices and state department sowing windows by a non-agronomist, and
  // wanting a check before anyone plants against it.
  //
  // Two of these carry a genuine complication the single `season` field
  // cannot hold. Sorghum and sunflower are grown in more than one season, and
  // in Maharashtra the *rabi* crop is the important one — rabi jowar (शाळू) on
  // stored monsoon moisture is the state's signature dryland crop. The window
  // below is the national one, as this file's header requires, and the note
  // carries what the field cannot.
  {
    key: "sorghum",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.oct, M.nov),
    states: ["MH", "KA", "MP", "RJ", "TG", "AP", "TN", "GJ", "UP"],
    durationDays: [100, 130],
    water: 2,
    note: {
      mr: "महाराष्ट्रात रब्बी ज्वारी (शाळू) जास्त महत्त्वाची — सप्टेंबर-ऑक्टोबरमध्ये साठलेल्या ओलीवर पेरतात, जानेवारी-फेब्रुवारीत काढणी.",
      en: "In Maharashtra the rabi crop matters more: sown September-October on moisture the monsoon left in the profile, cut January-February.",
    },
  },
  {
    key: "pearlmillet",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.sep, M.oct),
    states: ["RJ", "MH", "GJ", "UP", "HR", "KA", "MP", "TN"],
    durationDays: [75, 95],
    water: 1,
    note: {
      mr: "सगळ्यात कमी पाण्यावर येणारं तृणधान्य. जिथे इतर काही टिकत नाही तिथेही उतरतं.",
      en: "The least thirsty cereal here, and the one that still yields on land where nothing else holds.",
    },
  },
  {
    key: "wheat",
    season: "rabi",
    sow: run(M.nov, M.dec),
    harvest: run(M.mar, M.apr),
    states: ["UP", "PB", "HR", "MP", "RJ", "BR", "MH", "GJ", "UK"],
    durationDays: [110, 140],
    water: 4,
    note: {
      mr: "थंडी लागते. उशिरा पेरलं आणि फेब्रुवारीत उन्हाळा लवकर आला की दाणा भरत नाही.",
      en: "Needs the cold. Sown late, a warm February catches it while the grain is still filling and the yield never comes.",
    },
  },
  {
    key: "fingermillet",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.oct, M.nov),
    states: ["KA", "TN", "MH", "OD", "AP", "UK", "JH"],
    durationDays: [100, 130],
    water: 2,
    note: {
      mr: "डोंगरउतारावर आणि हलक्या जमिनीत येतं. साठवणुकीत वर्षानुवर्षं टिकतं.",
      en: "Grows on hill slopes and thin soils, and stores for years without spoiling — which is most of why it is grown.",
    },
  },
  {
    key: "soybean",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.sep, M.oct),
    states: ["MP", "MH", "RJ", "KA", "TG"],
    durationDays: [90, 110],
    water: 2,
    note: {
      mr: "पेरणीच्या वेळी पुरेशी ओल हवी. काढणीच्या वेळी पाऊस आला की शेंगा जागेवरच फुटतात.",
      en: "Wants moisture at sowing and dry weather at harvest — rain on a ripe crop splits the pods in the field.",
    },
  },
  {
    key: "groundnut",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.oct, M.nov),
    states: ["GJ", "RJ", "TN", "AP", "KA", "MH", "TG", "MP"],
    durationDays: [100, 130],
    water: 3,
    note: {
      mr: "शेंगा जमिनीत लागतात, म्हणून भुसभुशीत हलकी जमीन लागते. चिकण जमिनीत काढणी अवघड.",
      en: "The pods form underground, so it needs loose, light soil — on heavy clay the crop is there but lifting it wrecks it.",
    },
  },
  {
    key: "safflower",
    season: "rabi",
    sow: run(M.sep, M.oct),
    harvest: run(M.jan, M.feb),
    states: ["MH", "KA", "TG", "MP", "AP"],
    durationDays: [120, 140],
    water: 1,
    note: {
      mr: "खोल मुळं साठलेली ओल शोधतात, म्हणून कोरडवाहू रब्बीत टिकतं. काट्यांमुळे काढणी कष्टाची.",
      en: "Deep roots chase stored moisture, which is why it survives a rainfed rabi. The spines make harvest hard work.",
    },
  },
  {
    key: "sunflower",
    season: "rabi",
    sow: run(M.sep, M.oct),
    harvest: run(M.jan, M.feb),
    states: ["KA", "MH", "AP", "TG", "BR", "OD", "HR", "PB"],
    durationDays: [90, 110],
    water: 3,
    note: {
      mr: "खरीप आणि उन्हाळी हंगामातही घेतात. मधमाश्या नसल्या की दाणे पोकळ राहतात.",
      en: "Also grown in kharif and summer. Without bees working the heads the seed sets hollow, whatever the soil gives.",
    },
  },
  {
    key: "sesame",
    season: "kharif",
    sow: run(M.jun, M.jul),
    harvest: run(M.sep, M.oct),
    states: ["MP", "RJ", "UP", "GJ", "MH", "WB", "TN", "AP"],
    durationDays: [80, 95],
    water: 1,
    note: {
      mr: "कमी पाण्यावर लवकर येणारं पीक. बोंडं फुटायच्या आत काढणी करावी लागते.",
      en: "Quick and undemanding, but it must be cut before the capsules split — a few days late and the seed is on the ground.",
    },
  },
  {
    key: "linseed",
    season: "rabi",
    sow: run(M.oct, M.nov),
    harvest: run(M.feb, M.mar),
    states: ["MP", "CT", "UP", "MH", "BR", "JH", "RJ", "OD"],
    durationDays: [110, 140],
    water: 1,
    note: {
      mr: "उरलेल्या ओलीवर घेतात. सरकारी खतशिफारशीत हे पीक फार थोड्या जिल्ह्यांत नोंदलेलं आहे.",
      en: "Grown on whatever moisture is left. The government dose table carries it for only a handful of districts, so its recipe is usually a state-wide estimate.",
    },
  },
  {
    key: "mustard",
    season: "rabi",
    sow: run(M.oct, M.nov),
    harvest: run(M.feb, M.mar),
    states: ["RJ", "HR", "MP", "UP", "WB", "GJ", "PB", "AS"],
    durationDays: [110, 140],
    water: 2,
    note: {
      mr: "थंडीत चांगलं येतं. गंधकाची कमतरता असली की तेलाचं प्रमाण घटतं.",
      en: "A cold-weather crop, and one of the few where a sulphur shortage shows up directly as less oil in the seed.",
    },
  },
  {
    key: "sugarcane",
    season: "perennial",
    sow: run(M.oct, M.nov),
    harvest: run(M.dec, M.mar),
    states: ["UP", "MH", "KA", "TN", "GJ", "BR", "HR", "AP", "TG", "PB"],
    durationDays: [300, 450],
    water: 5,
    note: {
      mr: "महाराष्ट्रात आडसाली (ऑक्टोबर-नोव्हेंबर), पूर्वहंगामी आणि सुरू (जानेवारी-मार्च) अशा तीन लागवडी. वर्षभर पाणी लागतं.",
      en: "Maharashtra plants it three ways — adsali in October-November, pre-seasonal, and suru in January-March. All three want water for the whole of a long life.",
    },
  },
];

export const findCultivation = (key: string): Cultivation | undefined =>
  CULTIVATION.find((c) => c.key === key);

export const seasonLabel: Record<Season, Bi> = {
  kharif: { mr: "खरीप", en: "Kharif" },
  rabi: { mr: "रब्बी", en: "Rabi" },
  zaid: { mr: "उन्हाळी", en: "Summer (zaid)" },
  perennial: { mr: "बहुवार्षिक", en: "Perennial" },
};

export const seasonTint: Record<Season, string> = {
  kharif: "bg-leaf-wash text-leaf-deep",
  rabi: "bg-jal-wash text-jal-ink",
  zaid: "bg-haldi-wash text-haldi-ink",
  perennial: "bg-surface text-ink-soft ring-1 ring-line",
};

export const MONTHS_MR = ["जा", "फे", "मा", "ए", "मे", "जू", "जु", "ऑ", "स", "ऑ", "नो", "डि"];
export const MONTHS_EN = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Source for the windows above, printed on the page. */
export const CULTIVATION_SOURCE =
  "https://agricoop.gov.in/en/Agriculture-Crops";
