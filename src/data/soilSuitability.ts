/**
 * What each soil suits, and what it fights.
 *
 * A display mirror of `SUITABILITY` in `backend/soil_crop_suitability.py`.
 * That file is the source of truth — it is what actually re-ranks the crop
 * model's output — and this exists so a soil page opened cold, with no
 * prediction in context, can still show what grows on the ground the reader is
 * standing on. Keep the two in step: a crop favoured here but not there is a
 * page that promises a ranking the model will not deliver.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NEEDS AGRONOMIST REVIEW — the same standing flag the Python table carries.
 * Compiled from general Indian soil-suitability guidance (ICAR crop-soil
 * suitability, state agriculture department crop calendars).
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { Bi } from "./prediction";

export type SoilSuitability = {
  key: string;
  /** Crop keys, joining to `CROPS`. */
  favoured: string[];
  discouraged: string[];
  why: Bi;
};

export const SOIL_SUITABILITY: SoilSuitability[] = [
  {
    key: "alluvial",
    favoured: ["rice", "jute", "maize", "banana", "papaya", "lentil", "chickpea", "mungbean", "blackgram", "kidneybeans"],
    discouraged: [],
    why: {
      mr: "खोल, सुपीक आणि निचरा चांगला — गंगेच्या खोऱ्यातली मुख्य जमीन. जवळपास सगळंच येतं, त्यामुळे कशालाच नकार नाही.",
      en: "Deep, fertile and well drained with good moisture holding — the Indo-Gangetic staple soil. Suits nearly everything, so it discourages nothing.",
    },
  },
  {
    key: "black",
    favoured: ["cotton", "pigeonpeas", "chickpea", "grapes", "pomegranate", "orange"],
    discouraged: ["coconut", "papaya", "watermelon", "muskmelon"],
    why: {
      mr: "चिकणमातीचं प्रमाण जास्त, ओलावा धरून ठेवते — कापसाची पारंपरिक जमीन. निचरा कमी असल्याने मुळं कुजणाऱ्या पिकांना त्रास होतो.",
      en: "Vertisol — high clay, swells and holds moisture, the classic cotton soil. Poor drainage counts against crops that rot in wet feet or need a light, quick-draining bed.",
    },
  },
  {
    key: "red",
    favoured: ["mango", "blackgram", "mothbeans", "mungbean", "pigeonpeas", "pomegranate"],
    discouraged: ["rice", "jute"],
    why: {
      mr: "निचरा चांगला, नत्र आणि स्फुरद कमी, किंचित आम्लधर्मी. कडधान्यं आणि काटक फळबागा चांगल्या; साचलेलं पाणी लागणारी पिकं नाहीत.",
      en: "Well drained, low in nitrogen and phosphorus, mildly acidic. Good for pulses and hardy orchards; poor for crops that need standing water or sustained moisture.",
    },
  },
  {
    key: "laterite",
    favoured: ["coconut", "mango", "coffee", "rice"],
    discouraged: ["chickpea", "lentil", "grapes"],
    why: {
      mr: "पावसाने क्षार वाहून गेलेली, आम्लधर्मी, लोह-अ‍ॅल्युमिनियम जास्त — कोकण आणि मलबारची जमीन. बागायती पिकं चांगली येतात.",
      en: "Heavily leached, acidic, high in iron and aluminium — the Konkan and Malabar soil. Plantation crops do well; crops wanting a neutral pH and high base status do not.",
    },
  },
  {
    key: "clay",
    favoured: ["rice", "jute"],
    discouraged: ["watermelon", "muskmelon", "mothbeans", "coconut"],
    why: {
      mr: "जड आणि निचरा कमी, पाणी चांगलं धरून ठेवते. चिखलणी करून भात लावायला उत्तम; मोकळी हवा लागणाऱ्या मुळांना नाही.",
      en: "Heavy and slow draining, holds water well. Ideal for puddled rice; hostile to anything needing a light, aerated root zone.",
    },
  },
  {
    key: "peat",
    favoured: ["rice"],
    discouraged: ["grapes", "pomegranate", "apple", "orange", "cotton", "chickpea", "lentil"],
    why: {
      mr: "सेंद्रिय, आम्लधर्मी आणि पाणथळ — केरळची कारी जमीन. फार थोडी पिकं टिकतात.",
      en: "Organic, acidic and waterlogged — Kerala's kari lands. Very few field crops tolerate it; deep-rooted orchards and pulses will not.",
    },
  },
  {
    key: "yellow",
    favoured: ["mothbeans", "mungbean", "blackgram", "maize"],
    discouraged: ["rice", "jute", "banana"],
    why: {
      mr: "झिजलेली आणि कमी सुपीक, तांबड्या जमिनीसारखीच वागते. कमी मागणीची कडधान्यं आणि तृणधान्यं बरी.",
      en: "Weathered and low in fertility, close to red soil in behaviour. Suits undemanding pulses and millets rather than heavy feeders.",
    },
  },
  {
    key: "cinder",
    favoured: ["watermelon", "muskmelon", "mothbeans"],
    discouraged: ["rice", "jute", "banana", "coconut"],
    why: {
      mr: "ज्वालामुखीची राख — निचरा अतिशय जलद, अन्नद्रव्यं आणि पाणी धरून ठेवण्याची क्षमता कमी. फक्त काटक पिकंच.",
      en: "Volcanic scoria — extremely free draining and low in nutrients and water-holding capacity. Only drought-tolerant crops make sense; anything wanting standing water is a non-starter.",
    },
  },
];

export const findSuitability = (key: string): SoilSuitability | undefined =>
  SOIL_SUITABILITY.find((s) => s.key === key);
