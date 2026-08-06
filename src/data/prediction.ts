/**
 * One prediction, end to end.
 *
 * Three models feed this: the soil classifier names the ground, the crop
 * recommender ranks what to plant in it, and the fertilizer recommender says
 * what to feed them. None of the three is wired to an endpoint yet, so this is
 * a fixture — and every surface that renders it carries the standing
 * sample-figures notice. That is not decoration (PLAN.md §6): a farmer who
 * mistakes a demonstration for their own result buys fertilizer against it.
 *
 * The fixture is deliberately consistent with the card in `cardReading.ts`
 * rather than invented separately, because the two are shown on the same page
 * and a visitor will read across them. That card says pH 4.88 — sharply acidic
 * — with iron well above its range, which is laterite's signature. So the
 * classifier says laterite, the crops are the Konkan laterite belt's, and the
 * fertilizer advice has to reckon with the same card's other finding: nitrogen,
 * phosphorus and potassium are all *already* above range. Two of the four bags
 * below are therefore a hold, not a buy. A recommender that only ever says
 * "apply" is a sales channel, not a recommendation.
 *
 * Keys join to CROPS / SOILS / FERTILIZERS. Names, photographs, categories and
 * NPK grades are looked up there and never copied here.
 *
 * MARATHI NEEDS REVIEW. Drafted, not authored by a native speaker — PLAN.md §10
 * asks for exactly this flag rather than a silent guess.
 */

import { CROPS, type Crop } from "./crops";
import { SOILS, type Soil } from "./soils";
import { FERTILIZERS, type Fertilizer } from "./fertilizers";

export type Bi = { mr: string; en: string };

/** A labelled figure on a detail page. */
export type Fact = { label: Bi; value: Bi };

export type SoilPrediction = {
  key: string;
  /** Percent, as the classifier's softmax reads. */
  score: number;
  /** The classes it also considered, in order. */
  alternatives: { key: string; score: number }[];
  why: Bi;
  facts: Fact[];
  notes: Bi[];
};

export type CropPrediction = {
  key: string;
  score: number;
  why: Bi;
  facts: Fact[];
  notes: Bi[];
  /** Fertilizer keys that apply to this crop. */
  fertilizers: string[];
};

/**
 * `hold` is a real answer. This soil is already over-supplied with P and K, and
 * the honest output is to name the bag and tell someone not to buy it.
 */
export type FertVerdict = "apply" | "hold";

export type FertPrediction = {
  key: string;
  score: number;
  verdict: FertVerdict;
  dose: Bi;
  timing: Bi;
  why: Bi;
  facts: Fact[];
  notes: Bi[];
  /** Crop keys this bag was matched to. */
  crops: string[];
};

const fact = (
  labelMr: string,
  labelEn: string,
  valueMr: string,
  valueEn: string,
): Fact => ({
  label: { mr: labelMr, en: labelEn },
  value: { mr: valueMr, en: valueEn },
});

/* ---- The soil ----------------------------------------------------------- */

export const PREDICTED_SOIL: SoilPrediction = {
  key: "laterite",
  score: 91,
  alternatives: [
    { key: "red", score: 6 },
    { key: "cinder", score: 2 },
  ],
  why: {
    mr: "पत्रिकेवरचा सामू ४.८८ आणि लोह प्रमाणाबाहेर — हे जांभ्या जमिनीचं नेमकं लक्षण आहे. फोटोतला तांबडसर, सच्छिद्र पोत त्याला दुजोरा देतो.",
    en: "The card reads pH 4.88 with iron well above its range, which is laterite's signature — it weathers acidic and it is rich in iron oxide. The reddish, porous texture in your photograph agrees with it.",
  },
  facts: [
    fact("पाणी धरण्याची क्षमता", "Water holding", "कमी — पाणी लवकर झिरपतं", "Low — drains fast"),
    fact("सामू", "Typical pH", "४.५ – ६.०", "4.5 – 6.0"),
    fact("कुठे आढळते", "Where it is found", "कोकण पट्टा, घाटमाथा", "The Konkan belt and the ghats"),
    fact("मुख्य अडचण", "Main constraint", "आम्लता आणि झिरपणारं पाणी", "Acidity, and water that runs straight through"),
    fact("वर्गीकरणाची खात्री", "Classifier confidence", "९१%", "91%"),
  ],
  notes: [
    {
      mr: "जांभी जमीन भरपूर पावसात तयार होते — पाऊस वरचे क्षार वाहून नेतो आणि मागे लोह-अ‍ॅल्युमिनियमचे ऑक्साइड राहतात. म्हणूनच ती तांबडी दिसते आणि म्हणूनच ती आम्लधर्मी असते.",
      en: "Laterite is what heavy rain leaves behind. Decades of monsoon wash the bases out of the profile and concentrate iron and aluminium oxides in what remains — which is why it is red, and why it turns acidic.",
    },
    {
      mr: "इथे सर्वात मोठा फायदा चुना टाकून मिळतो, खत टाकून नाही. सामू ५.५ च्या वर आणला तर जमिनीत आधीच असलेली स्फुरद आणि पालाश पिकाला उपलब्ध होते.",
      en: "The biggest single gain here comes from lime, not from fertilizer. Lift the pH toward 5.5 and the phosphorus and potassium already sitting in this soil become available to the crop — you stop paying for nutrients you have and cannot reach.",
    },
  ],
};

/* ---- The crops ---------------------------------------------------------- */

export const PREDICTED_CROPS: CropPrediction[] = [
  {
    key: "rice",
    score: 94,
    why: {
      mr: "आम्लधर्मी जमिनीत भात सर्वात कमी तक्रार करतो, आणि जांभ्या जमिनीत पाणी साचवून ठेवायची पद्धत या भागात आधीच रुळलेली आहे.",
      en: "Rice complains least about acid ground — it will work at pH 5 where most of this list will not — and puddling is already how laterite is farmed in this belt.",
    },
    facts: [
      fact("हंगाम", "Season", "खरीप — जून ते ऑक्टोबर", "Kharif — June to October"),
      fact("कालावधी", "Duration", "११० – १३५ दिवस", "110 – 135 days"),
      fact("पाणी", "Water", "जास्त — साचवून ठेवावं लागतं", "High — needs standing water"),
      fact("लागवडीचं अंतर", "Spacing", "२० × १५ सेंमी", "20 × 15 cm"),
      fact("अपेक्षित उत्पादन", "Expected yield", "१६ – २२ क्विंटल/एकर", "16 – 22 quintal/acre"),
    ],
    notes: [
      {
        mr: "पाणी साचवल्यावर जमिनीचा सामू आपोआप ६ च्या जवळ सरकतो. आम्लधर्मी जांभ्या जमिनीत भात चांगला येतो याचं तेच खरं कारण आहे.",
        en: "Flooding a field does something useful on its own: submerged soil drifts toward pH 6 within a few weeks, whatever it started at. That, more than anything, is why rice does well on acid laterite.",
      },
      {
        mr: "तुमच्या जमिनीत नत्र आधीच जास्त आहे, त्यामुळे युरियाची नेहमीची मात्रा निम्मी करा. जास्त नत्रामुळे पीक लोळतं आणि करपा वाढतो.",
        en: "Your nitrogen is already above range, so halve the usual urea. Excess nitrogen on rice buys you lodging and blast, not grain.",
      },
    ],
    fertilizers: ["urea", "17-17-17"],
  },
  {
    key: "mango",
    score: 89,
    why: {
      mr: "हापूससाठी जांभी जमीनच हवी असते — पाणी झिरपणारी, खोल आणि आम्लधर्मी. कोकणातल्या बागा नेमक्या याच जमिनीवर आहेत.",
      en: "Alphonso country is laterite country. Deep, sharply drained, mildly acid ground is exactly what mango wants, and it is what the Konkan orchards sit on.",
    },
    facts: [
      fact("हंगाम", "Season", "बहुवार्षिक — फेब्रुवारीत मोहोर", "Perennial — flowers in February"),
      fact("पहिलं पीक", "First harvest", "लागवडीनंतर ४ – ५ वर्षं", "4 – 5 years after planting"),
      fact("पाणी", "Water", "कमी — मोहोराच्या वेळी अजिबात नको", "Low — none at all during flowering"),
      fact("लागवडीचं अंतर", "Spacing", "१० × १० मी", "10 × 10 m"),
      fact("अपेक्षित उत्पादन", "Expected yield", "पूर्ण वाढलेल्या झाडाला ५० – ८० किलो", "50 – 80 kg per mature tree"),
    ],
    notes: [
      {
        mr: "मोहोर येताना पाणी दिलं की तो गळतो. डिसेंबर ते फेब्रुवारी पाणी बंद ठेवणं ही आंब्याची सर्वात महत्त्वाची गोष्ट आहे.",
        en: "Water during flowering and the flowers drop. Holding irrigation from December through February is the single most important thing anyone does to a mango tree, and it costs nothing.",
      },
      {
        mr: "खड्डा भरताना चुना आणि शेणखत घाला. या जमिनीची आम्लता झाडाच्या मुळाभोवती तेवढ्यापुरती कमी करता येते.",
        en: "Line the planting pit with lime and farmyard manure. You cannot economically de-acidify a whole orchard, but you can fix the half metre a young tree's roots actually occupy.",
      },
    ],
    fertilizers: ["10-26-26"],
  },
  {
    key: "coconut",
    score: 84,
    why: {
      mr: "नारळाला खोल, पाणी झिरपणारी जमीन लागते आणि आम्लता तो सहन करतो. किनारपट्टीच्या जांभ्या जमिनीत तो पिढ्यानपिढ्या आहे.",
      en: "Coconut wants depth and drainage more than it wants fertility, and it tolerates acidity down to about pH 5. It has been grown on coastal laterite for generations.",
    },
    facts: [
      fact("हंगाम", "Season", "बहुवार्षिक — वर्षभर उत्पन्न", "Perennial — yields year round"),
      fact("पहिलं पीक", "First harvest", "लागवडीनंतर ५ – ७ वर्षं", "5 – 7 years after planting"),
      fact("पाणी", "Water", "मध्यम — पण खंड पडू देऊ नका", "Medium — but never let it break"),
      fact("लागवडीचं अंतर", "Spacing", "७.५ × ७.५ मी", "7.5 × 7.5 m"),
      fact("अपेक्षित उत्पादन", "Expected yield", "झाडाला वर्षाला ८० – १२० नारळ", "80 – 120 nuts per tree per year"),
    ],
    notes: [
      {
        mr: "नारळाला पालाश सर्वात जास्त लागतं. तुमच्या जमिनीत ते आधीच भरपूर आहे — म्हणून पालाशयुक्त खतावर खर्च करू नका, तो पैसा चुन्यावर घाला.",
        en: "Potassium is the nutrient coconut removes most of, and yours is already at 488 against a 120–280 range. Spend nothing on potash here; spend it on lime instead.",
      },
      {
        mr: "आळ्यात नारळाच्या सोडणं पुरून ठेवा. पाणी धरून ठेवायला त्याचा उपयोग होतो, आणि झिरपणाऱ्या जमिनीत तेच हवं असतं.",
        en: "Bury husks in the basin, convex side up. They hold water in a soil that otherwise loses it fast, and on laterite that is worth more than an extra bag of anything.",
      },
    ],
    fertilizers: ["urea"],
  },
  {
    key: "banana",
    score: 78,
    why: {
      mr: "केळी लवकर आणि भरपूर उत्पन्न देते, पण तिला सलग पाणी लागतं. झिरपणाऱ्या जमिनीत ठिबक असेल तरच परवडतं.",
      en: "Banana turns a season into cash faster than anything else here, but it drinks continuously. On a soil that drains this fast it only works with drip.",
    },
    facts: [
      fact("हंगाम", "Season", "जून किंवा ऑक्टोबर लागवड", "Planted June or October"),
      fact("कालावधी", "Duration", "११ – १३ महिने", "11 – 13 months"),
      fact("पाणी", "Water", "जास्त — ठिबक आवश्यक", "High — drip effectively required"),
      fact("लागवडीचं अंतर", "Spacing", "१.८ × १.८ मी", "1.8 × 1.8 m"),
      fact("अपेक्षित उत्पादन", "Expected yield", "२० – २५ टन/एकर", "20 – 25 tonne/acre"),
    ],
    notes: [
      {
        mr: "केळीचं खत थोडं थोडं करून द्यावं लागतं. या जमिनीत एकदम टाकलेलं खत पहिल्याच पावसात वाहून जातं.",
        en: "Split every dose. Laterite holds nutrients poorly, so a full application goes past the roots with the first heavy rain — little and often is not fussiness here, it is the only way the fertilizer stays.",
      },
      {
        mr: "सामू ५.५ च्या खाली असेल तर केळीला सूक्ष्म अन्नद्रव्यांची कमतरता दिसते. लागवडीआधी चुना टाकणं इथे सर्वात स्वस्त उपाय आहे.",
        en: "Below pH 5.5 banana starts showing micronutrient disorders even in soil that has plenty. Liming before planting is the cheapest intervention available on this field.",
      },
    ],
    fertilizers: ["17-17-17", "urea"],
  },
  {
    key: "papaya",
    score: 71,
    why: {
      mr: "पपई लवकर पैसा देते आणि जांभ्या जमिनीतला निचरा तिला मानवतो. पण मुळाशी पाणी साचलं की झाड जातं.",
      en: "Papaya pays back inside a year and the drainage here suits it — but it will not forgive standing water at the collar for even a few days.",
    },
    facts: [
      fact("हंगाम", "Season", "जून – जुलै किंवा फेब्रुवारी", "June–July, or February"),
      fact("पहिलं पीक", "First harvest", "८ – १० महिन्यांनी", "8 – 10 months"),
      fact("पाणी", "Water", "मध्यम — पण साचू देऊ नका", "Medium — never waterlogged"),
      fact("लागवडीचं अंतर", "Spacing", "२ × २ मी", "2 × 2 m"),
      fact("अपेक्षित उत्पादन", "Expected yield", "३० – ४० टन/एकर", "30 – 40 tonne/acre"),
    ],
    notes: [
      {
        mr: "गादीवाफ्यावर लागवड करा. जांभ्या जमिनीत निचरा चांगला असला तरी पावसाळ्यात खोलगट भागात पाणी थांबतं आणि तिथेच मर रोग सुरू होतो.",
        en: "Plant on raised beds even though this soil drains well. In a Konkan monsoon the low spots still pond, and collar rot starts in exactly those spots.",
      },
      {
        mr: "नर आणि मादी झाडं ओळखून नर झाडं काढून टाका — दर दहा झाडांमागे एक पुरेसं आहे.",
        en: "Thin the males once flowering identifies them. One in ten is plenty for pollination, and every male you leave is a plant's worth of water and fertilizer producing nothing.",
      },
    ],
    fertilizers: ["17-17-17", "10-26-26"],
  },
];

/* ---- The fertilizers ---------------------------------------------------- */

export const PREDICTED_FERTILIZERS: FertPrediction[] = [
  {
    key: "urea",
    score: 88,
    verdict: "apply",
    dose: { mr: "२५ किलो/एकर — नेहमीच्या निम्मी", en: "25 kg/acre — half the usual" },
    timing: {
      mr: "पेरणीनंतर ३० आणि ६० दिवसांनी, दोन हप्त्यांत",
      en: "Split at 30 and 60 days after sowing",
    },
    why: {
      mr: "भात आणि केळीला हंगामभर नत्र लागतं. पण तुमच्या जमिनीत नत्र आधीच ६२८ आहे — म्हणून मात्रा निम्मी.",
      en: "Rice and banana draw nitrogen right through the season. But your soil already reads 628 against a 280–560 range, so this is a maintenance dose at half strength — not the label rate.",
    },
    facts: [
      fact("ग्रेड", "Grade", "४६-०-०", "46-0-0"),
      fact("काय पुरवतं", "Supplies", "फक्त नत्र", "Nitrogen only"),
      fact("मात्रा", "Dose", "२५ किलो/एकर", "25 kg/acre"),
      fact("किती हप्ते", "Splits", "दोन", "Two"),
    ],
    notes: [
      {
        mr: "युरिया वरून टाकून पाणी दिलं नाही तर त्यातलं बरंचसं नत्र हवेत उडून जातं. टाकल्यावर लगेच पाणी द्या किंवा मातीत मिसळा.",
        en: "Urea broadcast on a dry surface loses a large share of its nitrogen to the air within days. Water it in immediately, or work it into the soil — otherwise you are paying for a gas.",
      },
      {
        mr: "पाऊस येण्याच्या आदल्या दिवशी युरिया टाकू नका. या जमिनीत तो वाहून जातो.",
        en: "Don't apply ahead of heavy rain. On laterite it leaches past the root zone and is gone.",
      },
    ],
    crops: ["rice", "banana", "coconut"],
  },
  {
    key: "17-17-17",
    score: 74,
    verdict: "apply",
    dose: { mr: "४० किलो/एकर, लागवडीच्या वेळी", en: "40 kg/acre at planting" },
    timing: {
      mr: "लागवडीच्या वेळी बेसल डोस म्हणून",
      en: "As a basal dose, at planting",
    },
    why: {
      mr: "नवीन रोपाला सुरुवातीला तिन्ही अन्नद्रव्यं थोड्या प्रमाणात लागतात. संतुलित ग्रेड असल्याने कशाचाही अतिरेक होत नाही.",
      en: "A young transplant needs a little of all three at once, and a balanced grade adds none of them disproportionately — which matters on a soil already high in two of them.",
    },
    facts: [
      fact("ग्रेड", "Grade", "१७-१७-१७", "17-17-17"),
      fact("काय पुरवतं", "Supplies", "नत्र, स्फुरद, पालाश समान", "Equal N, P and K"),
      fact("मात्रा", "Dose", "४० किलो/एकर", "40 kg/acre"),
      fact("कधी", "When", "लागवडीच्या वेळी", "At planting"),
    ],
    notes: [
      {
        mr: "संतुलित ग्रेड सोयीचा असतो, पण तो नेहमी थोडं जास्तच देतो. तुमच्या जमिनीत स्फुरद आणि पालाश आधीच जास्त आहे हे लक्षात ठेवा.",
        en: "A balanced grade is convenient, and convenience always over-applies something. Here it over-applies phosphorus and potassium — acceptable in a small basal dose, not as a season-long habit.",
      },
    ],
    crops: ["rice", "banana", "papaya"],
  },
  {
    key: "10-26-26",
    score: 41,
    verdict: "hold",
    dose: { mr: "या हंगामात नको", en: "Not this season" },
    timing: { mr: "—", en: "—" },
    why: {
      mr: "हे खत स्फुरद आणि पालाशसाठी घेतलं जातं. तुमच्या पत्रिकेत स्फुरद ५७ (हवं १०–२५) आणि पालाश ४८८ (हवं १२०–२८०) आहे. दोन्ही आधीच खूप जास्त.",
      en: "This bag is bought for phosphorus and potassium. Your card reads 57 against 10–25 for phosphorus and 488 against 120–280 for potassium. Both are already far past the top of the range.",
    },
    facts: [
      fact("ग्रेड", "Grade", "१०-२६-२६", "10-26-26"),
      fact("काय पुरवतं", "Supplies", "स्फुरद आणि पालाश", "Phosphorus and potassium"),
      fact("शिफारस", "Recommendation", "या हंगामात टाळा", "Skip it this season"),
      fact("वाचणारा खर्च", "What that saves", "सुमारे ₹१,४०० / एकर", "About ₹1,400 per acre"),
    ],
    notes: [
      {
        mr: "आधीच जास्त असलेलं पालाश आणखी वाढवलं की मॅग्नेशियम आणि कॅल्शियम घेण्यात अडथळा येतो. म्हणजे खर्च करून नुकसान.",
        en: "Pushing potassium higher when it is already at 488 starts interfering with magnesium and calcium uptake. This is one of the few cases where more fertilizer makes the crop worse, not just the bank balance.",
      },
      {
        mr: "पुढच्या हंगामात पुन्हा माती तपासा. सामू सुधारला की आकडे बदलतील.",
        en: "Re-test before next season. If the pH comes up, these numbers move — and the answer may change.",
      },
    ],
    crops: ["mango", "papaya"],
  },
  {
    key: "dap",
    score: 33,
    verdict: "hold",
    dose: { mr: "या हंगामात नको", en: "Not this season" },
    timing: { mr: "—", en: "—" },
    why: {
      mr: "डीएपी मुख्यतः स्फुरदासाठी असतो, आणि तुमच्या जमिनीत स्फुरद हवं त्यापेक्षा दुपटीहून जास्त आहे.",
      en: "DAP is bought for phosphorus, and yours is more than double the top of its range at 57 against 10–25.",
    },
    facts: [
      fact("ग्रेड", "Grade", "१८-४६-०", "18-46-0"),
      fact("काय पुरवतं", "Supplies", "स्फुरद, थोडं नत्र", "Phosphorus, with some nitrogen"),
      fact("शिफारस", "Recommendation", "या हंगामात टाळा", "Skip it this season"),
      fact("वाचणारा खर्च", "What that saves", "सुमारे ₹१,६०० / एकर", "About ₹1,600 per acre"),
    ],
    notes: [
      {
        mr: "आम्लधर्मी जमिनीत स्फुरद लोहाला चिकटून बांधलं जातं आणि पिकाला मिळत नाही. आणखी स्फुरद टाकून हे सुटत नाही — चुना टाकून सुटतं.",
        en: "In acid soil phosphorus locks onto iron and stops being available — which is exactly what this field is doing. Adding more phosphorus does not solve that; raising the pH does. Lime is the answer here, not another bag of DAP.",
      },
    ],
    crops: ["rice"],
  },
];

/* ---- Joins -------------------------------------------------------------- */

const byKey = <T extends { key: string }>(list: T[], key: string) =>
  list.find((x) => x.key === key);

export const cropOf = (p: CropPrediction): Crop | undefined =>
  byKey(CROPS, p.key);
export const soilOf = (p: SoilPrediction | { key: string }): Soil | undefined =>
  byKey(SOILS, p.key);
export const fertOf = (p: FertPrediction): Fertilizer | undefined =>
  byKey(FERTILIZERS, p.key);

export const findCropPrediction = (key: string) =>
  PREDICTED_CROPS.find((p) => p.key === key);
export const findFertPrediction = (key: string) =>
  PREDICTED_FERTILIZERS.find((p) => p.key === key);

/** Every key with a detail page. Drives `generateStaticParams`. */
export const predictedCropKeys = () => PREDICTED_CROPS.map((p) => p.key);
export const predictedFertKeys = () => PREDICTED_FERTILIZERS.map((p) => p.key);
export const predictedSoilKeys = () => [PREDICTED_SOIL.key];

/** How many bags are worth buying — the headline the board leads with. */
export const applyCount = () =>
  PREDICTED_FERTILIZERS.filter((f) => f.verdict === "apply").length;

export const verdictLabel: Record<FertVerdict, Bi> = {
  apply: { mr: "द्यायचं", en: "Apply" },
  hold: { mr: "नको", en: "Hold off" },
};

/** The three-colour language, unchanged: green is go, pomegranate is stop. */
export const verdictTint: Record<FertVerdict, string> = {
  apply: "bg-leaf-wash text-leaf-deep",
  hold: "bg-anar-wash text-anar",
};
