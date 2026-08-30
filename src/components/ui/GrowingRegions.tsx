"use client";

import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { StateCode } from "@/data/cultivation";

/**
 * Where in India this is grown, as a tile map.
 *
 * A schematic grid rather than a geographic outline, and the choice is
 * deliberate on three counts. A real India shapefile is several hundred
 * kilobytes of path data for a picture that answers one yes/no question per
 * state. At 360px — the phone this is actually read on — Goa and Tripura
 * become unclickable slivers while Rajasthan dominates, so the states that
 * matter for a plantation crop are the hardest to see. And a true map implies
 * a precision this data does not have: "grown in Maharashtra" is a
 * state-level fact, and drawing it over real district borders would suggest
 * we know which districts.
 *
 * So: one tile per state, laid out so the arrangement is recognisably India —
 * Kashmir top, Kerala bottom, the north-east in its own limb — and lit where
 * the crop is grown. Each tile carries its code, so the map is readable
 * without colour.
 */

//: [column, row] on a 7x9 grid, positioned to read as the subcontinent.
const GRID: Record<StateCode, [number, number]> = {
  JK: [2, 0],
  HP: [3, 1], PB: [2, 1], UK: [4, 1],
  HR: [3, 2], RJ: [1, 2], UP: [4, 2], BR: [5, 2],
  SK: [6, 2],
  GJ: [1, 3], MP: [3, 3], JH: [5, 3], WB: [6, 3],
  AS: [7, 2], AR: [8, 1], NL: [8, 2], MN: [8, 3], MZ: [7, 4], TR: [7, 3], ML: [6, 1],
  MH: [2, 4], CT: [4, 4], OD: [5, 4],
  GA: [2, 5], TG: [3, 5],
  KA: [2, 6], AP: [4, 6],
  KL: [2, 7], TN: [3, 7],
};

const NAME: Record<StateCode, { mr: string; en: string }> = {
  JK: { mr: "जम्मू-काश्मीर", en: "Jammu & Kashmir" },
  HP: { mr: "हिमाचल", en: "Himachal Pradesh" },
  PB: { mr: "पंजाब", en: "Punjab" },
  UK: { mr: "उत्तराखंड", en: "Uttarakhand" },
  HR: { mr: "हरियाणा", en: "Haryana" },
  RJ: { mr: "राजस्थान", en: "Rajasthan" },
  UP: { mr: "उत्तर प्रदेश", en: "Uttar Pradesh" },
  BR: { mr: "बिहार", en: "Bihar" },
  SK: { mr: "सिक्कीम", en: "Sikkim" },
  AS: { mr: "आसाम", en: "Assam" },
  AR: { mr: "अरुणाचल", en: "Arunachal Pradesh" },
  NL: { mr: "नागालँड", en: "Nagaland" },
  MN: { mr: "मणिपूर", en: "Manipur" },
  MZ: { mr: "मिझोराम", en: "Mizoram" },
  TR: { mr: "त्रिपुरा", en: "Tripura" },
  ML: { mr: "मेघालय", en: "Meghalaya" },
  WB: { mr: "पश्चिम बंगाल", en: "West Bengal" },
  JH: { mr: "झारखंड", en: "Jharkhand" },
  OD: { mr: "ओडिशा", en: "Odisha" },
  CT: { mr: "छत्तीसगड", en: "Chhattisgarh" },
  MP: { mr: "मध्य प्रदेश", en: "Madhya Pradesh" },
  GJ: { mr: "गुजरात", en: "Gujarat" },
  MH: { mr: "महाराष्ट्र", en: "Maharashtra" },
  GA: { mr: "गोवा", en: "Goa" },
  KA: { mr: "कर्नाटक", en: "Karnataka" },
  TG: { mr: "तेलंगणा", en: "Telangana" },
  AP: { mr: "आंध्र प्रदेश", en: "Andhra Pradesh" },
  TN: { mr: "तमिळनाडू", en: "Tamil Nadu" },
  KL: { mr: "केरळ", en: "Kerala" },
};

const ALL = Object.keys(GRID) as StateCode[];

const COLS = 9;
const ROWS = 8;
const CELL = 30;
const GAP = 3;

export function GrowingRegions({ states }: { states: StateCode[] }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const lit = new Set(states);

  const width = COLS * (CELL + GAP);
  const height = ROWS * (CELL + GAP);

  return (
    <div>
      {/* Scrolls inside its own box rather than pushing the page sideways. */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full max-w-[22rem]"
          role="img"
          aria-label={
            mr
              ? `हे पीक घेतलं जाणारी राज्यं: ${states.map((s) => NAME[s].mr).join(", ")}`
              : `Grown in ${states.map((s) => NAME[s].en).join(", ")}`
          }
        >
          {ALL.map((code) => {
            const [col, row] = GRID[code];
            const on = lit.has(code);
            return (
              <g key={code} transform={`translate(${col * (CELL + GAP)} ${row * (CELL + GAP)})`}>
                <title>{mr ? NAME[code].mr : NAME[code].en}</title>
                <rect
                  width={CELL}
                  height={CELL}
                  rx={6}
                  // Tokens, not hex: this has to survive the theme flip, and
                  // `currentColor` would tie every tile to one value.
                  className={cn(on ? "fill-leaf" : "fill-line/50")}
                />
                <text
                  x={CELL / 2}
                  y={CELL / 2 + 3.5}
                  textAnchor="middle"
                  className={cn(
                    "text-[10px] font-semibold",
                    on ? "fill-paper" : "fill-ink-mute",
                  )}
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {code}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Named in full underneath. The tiles are for the shape of the answer;
          this is for reading it. */}
      <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
        {states.map((s) => (mr ? NAME[s].mr : NAME[s].en)).join(" · ")}
      </p>
      <p className="mt-2 text-[12px] text-ink-mute">
        {mr
          ? "नकाशा प्रातिनिधिक आहे — कोणत्या राज्यात, एवढंच दाखवतो."
          : "Schematic, not geographic — it shows which states, not where within them."}
      </p>
    </div>
  );
}
