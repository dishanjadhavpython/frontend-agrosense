"use client";

import { Quote } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { PhotoPanel } from "@/components/ui/PhotoPanel";
import { Reveal } from "@/components/ui/Reveal";

/**
 * One farmer, and what he said.
 *
 * This was a full "From the field" section — an eyebrow, a heading, and three
 * headline statistics above the quote. The section framing came off; the
 * portrait and the words stayed.
 *
 * The statistics going is no loss at all. They were invented — 12,400 farmers,
 * 38,600 acres, ₹3,200 saved per acre — and existed only to size the layout.
 * Numbers like that are the easiest thing on a landing page to believe and the
 * hardest to walk back, and this product had never been used by anyone.
 *
 * ⚠ THE QUOTE IS STILL PLACEHOLDER. The words, the name and the village are
 * invented, and it must be replaced with a real farmer's words — with consent,
 * name and village — before this page goes anywhere public. A fabricated
 * testimonial shipped as genuine is not a design detail. The dev-only badge
 * below is what stops that happening quietly, and it stays until the quote is
 * real.
 */
export function Proof() {
  const { lang } = useLang();
  const mr = lang === "mr";

  return (
    <section id="proof" className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
      {process.env.NODE_ENV !== "production" ? (
        <p className="mb-10 rounded-md border border-anar/40 bg-anar-wash px-4 py-2.5 font-mono text-[12px] text-anar">
          Placeholder quote — replace with a real, consented testimonial before
          launch.
        </p>
      ) : null}

      <Reveal>
        <figure className="grid items-center gap-8 md:grid-cols-[minmax(0,24rem)_1fr] md:gap-12">
          {/* 3:2, not a portrait crop — the source is 612×408, and cropping it
              to 4:5 would throw away most of its resolution. */}
          <PhotoPanel
            src={photo("people/farmer-portrait.jpg")}
            awaiting="people/farmer-portrait.jpg"
            alt={mr ? "शेतकऱ्याचा फोटो" : "Portrait of a farmer"}
            ratio="3 / 2"
            sizes="(max-width: 768px) 100vw, 384px"
          />
          <div>
            {/* Tinted off `leaf` rather than a fixed step of the ramp: the
                ramp is data, and this is ornament. */}
            <Quote className="size-7 text-leaf/45" aria-hidden />
            <blockquote
              className="mt-4 text-2xl leading-snug text-ink"
              style={{ fontFamily: "var(--font-doc)" }}
            >
              {mr
                ? "“कार्ड घरात पडून होतं. काय लिहिलंय ते कळत नव्हतं. आता खत किती टाकायचं ते फोनवर दिसतं.”"
                : "“The card sat at home. I couldn't read what it said. Now the phone tells me how much fertilizer to put.”"}
            </blockquote>
            <figcaption className="mt-5 text-[15px] text-ink-mute">
              <span className="font-semibold text-ink">
                {mr ? "नाव येईल" : "Name to come"}
              </span>{" "}
              · {mr ? "गाव, तालुका" : "Village, taluka"}
            </figcaption>
          </div>
        </figure>
      </Reveal>
    </section>
  );
}
