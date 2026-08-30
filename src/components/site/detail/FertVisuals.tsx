"use client";

import Link from "next/link";
import { FlaskConical, Sprout } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { CROPS } from "@/data/crops";
import { FERTILIZERS } from "@/data/fertilizers";
import { CULTIVATION } from "@/data/cultivation";
import { Widget, WidgetGrid } from "./Widgets";

/**
 * What is actually in the bag.
 *
 * The N-P-K grade is the whole reason a farmer picks one sack over another,
 * and it is printed on every bag — so this draws it rather than restating it
 * in a sentence. The remainder (a 46-0-0 urea bag is 54% not-nitrogen) is
 * drawn too: it is filler and coating, and a bar that summed the three
 * nutrients to 100% would quietly misrepresent what is being bought.
 *
 * Nutrient colours are the ones the soil card and the readings chart already
 * use, so nitrogen is the same colour everywhere in the product.
 */
export function FertVisuals({ fertKey }: { fertKey: string }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const fert = FERTILIZERS.find((f) => f.key === fertKey);
  if (!fert) return null;

  const [n, p, k] = fert.npk;
  const filler = Math.max(0, 100 - n - p - k);

  const parts = [
    { key: "n", value: n, className: "bg-leaf", label: mr ? "नत्र (N)" : "Nitrogen (N)" },
    { key: "p", value: p, className: "bg-haldi", label: mr ? "स्फुरद (P)" : "Phosphorus (P)" },
    { key: "k", value: k, className: "bg-jal", label: mr ? "पालाश (K)" : "Potassium (K)" },
    { key: "x", value: filler, className: "bg-line", label: mr ? "इतर / भरण" : "Carrier and coating" },
  ].filter((part) => part.value > 0);

  // Which crops on this site are grown in a season this bag suits is not
  // something the data supports, so this is the honest version: every crop
  // whose calendar we carry, as a way into the crop pages. Deliberately not
  // presented as "recommended for" — that is the model's job, not a table's.
  const cropsWithPages = CULTIVATION.map((c) =>
    CROPS.find((crop) => crop.key === c.key),
  ).filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-[1.3rem] leading-tight font-semibold text-ink font-[family-name:var(--font-display)]">
        {mr ? "पिशवीत काय आहे" : "What's in the bag"}
      </h2>

      <WidgetGrid>
        <Widget
          span
          title={mr ? "अन्नद्रव्यांचं प्रमाण" : "Guaranteed analysis"}
          note={fert.npk.join("-")}
          icon={<FlaskConical className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        >
          <div className="flex h-10 w-full overflow-hidden rounded-[8px]" role="img"
            aria-label={`${n}% nitrogen, ${p}% phosphorus, ${k}% potassium, ${filler}% carrier`}>
            {parts.map((part) => (
              <div
                key={part.key}
                className={part.className}
                style={{ width: `${part.value}%` }}
                title={`${part.label}: ${part.value}%`}
              />
            ))}
          </div>

          <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {parts.map((part) => (
              <li key={part.key} className="flex items-center gap-2.5 text-[14px]">
                <span className={`size-3 shrink-0 rounded-[3px] ${part.className}`} aria-hidden />
                <span className="text-ink-soft">{part.label}</span>
                <span className="tnum ml-auto font-semibold text-ink">{part.value}%</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[13px] leading-relaxed text-ink-mute">
            {mr
              ? `१०० किलोच्या पिशवीत ${n + p + k} किलो अन्नद्रव्यं असतात; बाकीचं वाहक आणि आवरण. भाव ठरवताना हा हिशेब बघा.`
              : `Of every 100 kg you buy, ${n + p + k} kg is nutrient — the rest is carrier and coating. That is the number to compare prices against.`}
          </p>
        </Widget>

        <Widget
          span
          title={mr ? "कोणत्या पिकांसाठी" : "Crops on this site"}
          icon={<Sprout className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        >
          <p className="mb-3 text-[14px] leading-relaxed text-ink-mute">
            {mr
              ? "कोणतं खत घ्यायचं हे तुमच्या पत्रिकेवरून ठरतं, या यादीवरून नाही. पीक बघण्यासाठी नाव दाबा."
              : "Whether to buy this is decided by your card, not by this list. Tap a crop to read about it."}
          </p>
          <ul className="flex flex-wrap gap-2">
            {cropsWithPages.map((crop) => (
              <li key={crop.key}>
                <Link
                  href={`/prediction/crop/${crop.key}`}
                  className="inline-flex min-h-9 items-center rounded-full bg-surface px-3 py-1.5 text-[13.5px] font-medium text-ink-soft ring-1 ring-line transition-colors hover:bg-leaf-wash hover:text-leaf-deep"
                >
                  {mr ? crop.mr : crop.en}
                </Link>
              </li>
            ))}
          </ul>
        </Widget>
      </WidgetGrid>
    </section>
  );
}
