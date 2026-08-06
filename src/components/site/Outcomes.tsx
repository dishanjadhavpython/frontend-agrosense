"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { Section } from "@/components/ui/Section";
import { PhotoPanel } from "@/components/ui/PhotoPanel";
import { Reveal } from "@/components/ui/Reveal";
import { Marked } from "@/components/ui/Type";

/**
 * Outcomes, not features. Nobody wants a nutrient parser; they want to stop
 * buying urea they don't need.
 */
export function Outcomes() {
  const { lang } = useLang();
  const mr = lang === "mr";

  const outcomes = [
    {
      img: "crops/maize.jpg",
      title: mr ? "योग्य पीक निवडा" : "Pick the right crop",
      body: mr
        ? "तुमच्या मातीला, पाण्याला आणि हंगामाला जे झेपेल तेच सुचवलं जातं."
        : "Only what your soil, your water and the season can actually carry.",
    },
    {
      img: "crops/cotton.jpg",
      title: mr ? "खतावरचा खर्च कमी" : "Spend less on fertilizer",
      body: mr
        ? "जे आधीच पुरेसं आहे ते विकत घेऊ नका. कमी काय आहे तेवढंच टाका."
        : "Stop buying what your soil already has. Add only what's short.",
    },
    {
      img: "crops/pomegranate.jpg",
      title: mr ? "चांगल्या भावात विका" : "Sell at a better price",
      body: mr
        ? "जवळच्या बाजार समित्यांचे आजचे भाव, रोज सकाळी."
        : "Today's rates from the mandis near you, every morning.",
    },
  ];

  return (
    <Section
      id="what"
      eyebrow={mr ? "काय मिळेल" : "What you get"}
      heading={
        mr ? (
          <>
            आकडे नाही — <Marked>पुढचं पाऊल</Marked>
          </>
        ) : (
          <>
            Not readings — <Marked>the next move</Marked>
          </>
        )
      }
      lede={
        mr
          ? "अहवाल वाचून काय करायचं हे ठरवायची गरज नाही. ते आम्ही सांगतो."
          : "You shouldn't have to interpret a lab report to decide what to do next."
      }
    >
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {outcomes.map((item, i) => (
          <Reveal key={item.title} delay={i * 0.08}>
            <article>
              <PhotoPanel
                src={photo(item.img)}
                awaiting={item.img}
                alt={item.title}
                ratio="1 / 1"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
              <h3 className="mt-5 text-lg font-semibold text-ink">
                {item.title}
              </h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{item.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
