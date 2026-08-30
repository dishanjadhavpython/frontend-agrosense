"use client";

import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { MONTHS_EN, MONTHS_MR, type Cultivation } from "@/data/cultivation";

/**
 * The farming year, as one strip.
 *
 * The single most useful thing a crop page can answer is "when do I put this
 * in the ground", and a farmer should not have to read a paragraph to get it.
 * Twelve columns, three states — sow, growing, harvest — and a marker on the
 * month it currently is, so the answer is either "now", "you have missed it",
 * or "in four months" without any arithmetic.
 *
 * Drawn in DOM rather than SVG. It is a twelve-cell grid, which CSS grid does
 * natively and accessibly; an SVG would need its own text positioning and
 * would not reflow on a 360px phone. Colour is never the only carrier —
 * every band is also labelled underneath.
 */
export function CropCalendar({ c }: { c: Cultivation }) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const months = mr ? MONTHS_MR : MONTHS_EN;
  const now = new Date().getMonth();

  const sow = new Set(c.sow);
  const harvest = new Set(c.harvest);

  // Growing is the span between the two rather than a third stored list —
  // deriving it means a calendar can never disagree with itself about when
  // the crop is in the ground.
  const growing = new Set<number>();
  if (c.sow.length && c.harvest.length) {
    const from = c.sow[c.sow.length - 1];
    const to = c.harvest[0];
    for (let m = (from + 1) % 12; m !== to; m = (m + 1) % 12) growing.add(m);
  }

  const stateOf = (m: number) =>
    sow.has(m) ? "sow" : harvest.has(m) ? "harvest" : growing.has(m) ? "grow" : "off";

  return (
    <div>
      <div className="grid grid-cols-12 gap-1">
        {months.map((label, m) => {
          const state = stateOf(m);
          return (
            <div key={m} className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "text-[11px] leading-none",
                  m === now ? "font-bold text-ink" : "text-ink-mute",
                )}
              >
                {label}
              </span>
              <div
                className={cn(
                  "h-9 w-full rounded-[5px] transition-colors",
                  state === "sow" && "bg-leaf",
                  state === "grow" && "bg-leaf-3",
                  state === "harvest" && "bg-haldi",
                  state === "off" && "bg-line/60",
                )}
                // Colour alone never carries this. Each cell says what it is.
                title={`${label}: ${state}`}
                aria-label={`${label}: ${state}`}
              />
              {/* Today, marked under its own column. A farmer opening this in
                  October should see immediately that the sowing window shut in
                  July, rather than reading the bands and working it out. */}
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  m === now ? "bg-ink" : "bg-transparent",
                )}
                aria-hidden
              />
            </div>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-mute">
        <Key className="bg-leaf" label={mr ? "पेरणी" : "Sowing"} />
        <Key className="bg-leaf-3" label={mr ? "वाढ" : "Growing"} />
        <Key className="bg-haldi" label={mr ? "काढणी" : "Harvest"} />
        <li className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-ink" aria-hidden />
          {mr ? "आजचा महिना" : "This month"}
        </li>
      </ul>
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("size-3 rounded-[3px]", className)} aria-hidden />
      {label}
    </li>
  );
}
