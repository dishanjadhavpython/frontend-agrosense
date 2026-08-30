"use client";

import { CalendarDays, Droplets, MapPin, Timer } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import {
  CULTIVATION_SOURCE,
  findCultivation,
  seasonLabel,
  seasonTint,
} from "@/data/cultivation";
import { CropCalendar } from "@/components/ui/CropCalendar";
import { GrowingRegions } from "@/components/ui/GrowingRegions";
import { DotMeter, Stat, Widget, WidgetGrid } from "./Widgets";

/**
 * How this crop is grown in India, as pictures.
 *
 * Sits above the prose on the page deliberately. A farmer scrolling for "when
 * do I sow this" should meet a calendar, not a paragraph that happens to
 * contain the month.
 *
 * All of it comes from `src/data/cultivation.ts` — checked, editorial, and
 * cited underneath — rather than from the research agents. The agents cover
 * what changed this week; a sowing window is not that, and an LLM re-deriving
 * one every eight hours would give two farmers reading the same page on the
 * same morning slightly different dates to plant against.
 */
export function CropVisuals({ cropKey }: { cropKey: string }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const c = findCultivation(cropKey);

  // Absent rather than empty. Twenty-two crops are covered; if one is ever
  // added to the model without a calendar, the page loses this band instead
  // of drawing an empty year.
  if (!c) return null;

  const season = seasonLabel[c.season];
  const [minDays, maxDays] = c.durationDays;
  const years = maxDays >= 365;

  const waterLabel = [
    { mr: "फार कमी पाणी", en: "Very little water" },
    { mr: "कमी पाणी", en: "Low water need" },
    { mr: "मध्यम पाणी", en: "Moderate water" },
    { mr: "भरपूर पाणी", en: "Thirsty" },
    { mr: "खूप जास्त पाणी", en: "Very thirsty" },
  ][c.water - 1];

  return (
    <section className="mt-12 border-t border-line pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-[1.3rem] leading-tight font-semibold text-ink font-[family-name:var(--font-display)]">
          {mr ? "भारतात हे पीक कसं घेतात" : "How it's grown in India"}
        </h2>
        <span
          className={cn(
            "rounded-full px-3 py-1.5 text-[13.5px] font-semibold",
            seasonTint[c.season],
          )}
        >
          {mr ? season.mr : season.en}
        </span>
      </div>

      <WidgetGrid>
        <Widget
          span
          title={mr ? "वर्षाचं वेळापत्रक" : "The year"}
          note={mr ? "देशभरातला कालावधी" : "national window"}
          icon={<CalendarDays className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        >
          <CropCalendar c={c} />
          {/* The window is the country's, not a district's. India runs from
              Kerala to Punjab and one sowing month would be wrong for most of
              it, so the strip shows the span and this says so out loud. */}
          <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
            {mr ? c.note.mr : c.note.en}
          </p>
        </Widget>

        <Widget
          title={mr ? "कुठे घेतलं जातं" : "Where it's grown"}
          note={`${c.states.length} ${mr ? "राज्यं" : "states"}`}
          icon={<MapPin className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        >
          <GrowingRegions states={c.states} />
        </Widget>

        <Widget
          title={mr ? "किती काळ, किती पाणी" : "Duration and water"}
          icon={<Timer className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        >
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            <Stat
              value={
                years
                  ? `${Math.round(minDays / 365)}–${Math.round(maxDays / 365)}`
                  : `${minDays}–${maxDays}`
              }
              label={
                years
                  ? mr
                    ? "वर्षं (फळ धरेपर्यंत)"
                    : "years to bear"
                  : mr
                    ? "दिवस (पेरणी ते काढणी)"
                    : "days, sowing to harvest"
              }
            />
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <p className="flex items-center gap-2 text-[13px] text-ink-mute">
              <Droplets className="size-4" strokeWidth={1.9} aria-hidden />
              {mr ? "पाण्याची गरज" : "Water need"}
            </p>
            <div className="mt-2.5">
              <DotMeter value={c.water} label={mr ? waterLabel.mr : waterLabel.en} />
            </div>
          </div>
        </Widget>
      </WidgetGrid>

      {/* Cited, and flagged. These are dates somebody may run a tractor
          against, and they were compiled by a programmer, not an agronomist. */}
      <p className="mt-4 text-[12.5px] leading-relaxed text-ink-mute">
        {mr
          ? "हे वेळापत्रक ICAR आणि कृषी मंत्रालयाच्या पीक दिनदर्शिकेवरून तयार केलं आहे. तुमच्या तालुक्याची नेमकी वेळ कृषी अधिकाऱ्याकडून तपासून घ्या. "
          : "Compiled from ICAR and Ministry of Agriculture crop calendars, and not reviewed by an agronomist. Check the exact window for your taluka with your agriculture officer. "}
        <a
          href={CULTIVATION_SOURCE}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-line underline-offset-4 hover:text-ink"
        >
          {mr ? "स्रोत" : "Source"}
        </a>
      </p>
    </section>
  );
}
