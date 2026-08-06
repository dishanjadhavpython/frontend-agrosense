"use client";

import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/assets";
import { acresGuntha } from "@/lib/format";
import { Section } from "@/components/ui/Section";
import { PhotoPanel } from "@/components/ui/PhotoPanel";
import { ArcGauge } from "@/components/ui/ArcGauge";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

/**
 * STAGED FOR THE DASHBOARD — not mounted on any route yet.
 *
 * This was the landing page's plots section. It came off the public site, but
 * the composition is exactly what PLAN.md §7 calls for on the app dashboard:
 * the aerial as canvas, the dashed boundary, stress clipped inside it, and a
 * readout panel breaking the photo's edge. Kept whole so step 6 starts from
 * working code rather than from the wireframe.
 *
 * When it moves onto /dashboard the panel should switch to variant="night" —
 * the app surface is where that one dark moment belongs.
 */

type Plot = {
  key: string;
  name: { mr: string; en: string };
  crop: { mr: string; en: string };
  acres: number;
  score: number;
  status: "low" | "medium" | "high";
  img: string;
};

const PLOTS: Plot[] = [
  {
    key: "east",
    name: { mr: "पूर्वेकडचं शेत", en: "East field" },
    crop: { mr: "तूर", en: "Tur" },
    acres: 1.75,
    score: 74,
    status: "high",
    img: "plots/east-field.jpg",
  },
  {
    key: "canal",
    name: { mr: "कालव्याजवळचं", en: "Canal side" },
    crop: { mr: "ऊस", en: "Sugarcane" },
    acres: 3.5,
    score: 58,
    status: "medium",
    img: "plots/canal-side.jpg",
  },
  {
    key: "lower",
    name: { mr: "खालचं शेत", en: "Lower field" },
    crop: { mr: "सोयाबीन", en: "Soybean" },
    acres: 1.2,
    score: 41,
    status: "low",
    img: "plots/lower-field.jpg",
  },
];

/**
 * The plot boundary and the stress showing through it.
 *
 * The stress is clipped to the boundary — unclipped it reads as a stain on the
 * lens rather than something happening in the crop. The viewBox is exactly
 * 16:9, matching the container, so nothing distorts and the dashes stay even.
 *
 * Painted for now; see PLAN.md §10 on whether real NDVI data is available.
 */
function PlotOverlay() {
  const boundary = "M30 20 L98 14 L112 50 L46 68 Z";

  return (
    <svg
      viewBox="0 0 160 90"
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
    >
      <defs>
        <clipPath id="plot-boundary">
          <path d={boundary} />
        </clipPath>
        <radialGradient id="plot-stress">
          <stop offset="0%" stopColor="var(--color-anar)" stopOpacity="0.78" />
          <stop offset="55%" stopColor="var(--color-haldi)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--color-haldi)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g clipPath="url(#plot-boundary)">
        <ellipse cx="72" cy="38" rx="26" ry="19" fill="url(#plot-stress)" />
        <ellipse cx="58" cy="52" rx="14" ry="10" fill="url(#plot-stress)" />
      </g>

      <path
        d={boundary}
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.1"
        strokeDasharray="3.5 2.5"
        strokeLinejoin="round"
        opacity="0.92"
      />
    </svg>
  );
}

/** The three-colour language the dictionary already speaks. */
const statusTint: Record<Plot["status"], string> = {
  high: "bg-leaf-wash text-leaf-deep",
  medium: "bg-haldi-wash text-haldi-ink",
  low: "bg-anar-wash text-anar",
};

export function PlotMap() {
  const { t, lang } = useLang();
  const mr = lang === "mr";

  const statusLabel: Record<Plot["status"], string> = {
    high: t("stSufficient"),
    medium: t("stMedium"),
    low: t("stLow"),
  };

  return (
    <Section
      id="plots"
      eyebrow={t("secPlots")}
      heading={
        mr ? "प्रत्येक शेताची स्थिती, वेगळी" : "Every plot, read separately"
      }
      lede={
        mr
          ? "एका बांधाच्या अलीकडे आणि पलीकडे माती वेगळी असते. प्रत्येक शेताचा सल्ला वेगळा येतो."
          : "Soil changes across a bund. Each plot gets read on its own, and advised on its own."
      }
    >
      <Reveal className="mt-12">
        <PhotoPanel
          src={photo("plots/upper-field.jpg")}
          awaiting="plots/upper-field.jpg"
          alt={
            mr
              ? "वरच्या शेताचा वरून काढलेला फोटो"
              : "Aerial photograph of the upper field"
          }
          ratio="16 / 9"
          position="bottom-left"
          sizes="(max-width: 1024px) 100vw, 1100px"
          panel={
            <div className="w-56">
              <p className="text-[15px] font-semibold text-ink">
                {mr ? "वरचं शेत" : "Upper field"}
              </p>
              <p className="mt-0.5 text-[13px] text-ink-mute">
                {mr ? "ज्वारी" : "Jowar"} · {acresGuntha(2.5, lang)}
              </p>
              <ArcGauge
                value={62}
                label={mr ? "एकूण गुण" : "Overall score"}
                className="mt-3"
              />
              <dl className="mt-3 grid grid-cols-2 gap-y-1.5 border-t border-line pt-3 text-[13px]">
                <dt className="text-ink-mute">{t("nutPh")}</dt>
                <dd className="tnum text-right font-medium text-ink">8.4</dd>
                <dt className="text-ink-mute">{mr ? "ओलावा" : "Moisture"}</dt>
                <dd className="tnum text-right font-medium text-ink">32%</dd>
              </dl>
            </div>
          }
        >
          <PlotOverlay />
        </PhotoPanel>
      </Reveal>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PLOTS.map((plot, i) => (
          <Reveal key={plot.key} delay={i * 0.06}>
            <article className="group">
              <PhotoPanel
                src={photo(plot.img)}
                awaiting={plot.img}
                alt={mr ? plot.name.mr : plot.name.en}
                ratio="5 / 3"
                sizes="(max-width: 640px) 100vw, 33vw"
              />
              <div className="mt-3.5 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">
                    {mr ? plot.name.mr : plot.name.en}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-ink-mute">
                    {mr ? plot.crop.mr : plot.crop.en} ·{" "}
                    {acresGuntha(plot.acres, lang)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold",
                    statusTint[plot.status],
                  )}
                >
                  {statusLabel[plot.status]}
                </span>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
