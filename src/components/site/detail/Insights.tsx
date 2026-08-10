"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BadgeIndianRupee,
  ExternalLink,
  Info,
  Landmark,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { InsightsResponse, TopicReport } from "@/lib/cardTypes";

/**
 * What the research agents found, on a detail page.
 *
 * Everything above this on the page is editorial — written, checked, and true
 * until someone changes it. This is not: it is four language models' summary of
 * pages they fetched this morning. So it is fenced off and labelled, the same
 * way an OCR-derived reading is marked `unconfirmed` rather than mixed in with
 * the numbers read from a PDF. A farmer should always be able to tell which
 * kind of claim they are looking at.
 *
 * The fence used to be a hairline rule and a 13px caption, which fenced the
 * section off so successfully that it read as a footer. It is now a panel with
 * a dated masthead — the mandi notice board this content actually comes from,
 * where the rates go up each morning under the day's date.
 *
 * Colour carries provenance here, and it is the only place on the site that
 * does, so it is worth stating plainly:
 *
 *   jal (blue)      a government record. Prices came from the Agmarknet API
 *                   with a mandi and a date on them; schemes link to the
 *                   ministry's own page. No model wrote these numbers.
 *   haldi (turmeric) freshly gathered, and dated for that reason.
 *   leaf (green)    the product's own voice.
 *
 * Fetched on the client rather than server-rendered, deliberately: the detail
 * page is statically generated at build time, and this content changes every
 * eight hours. Blocking the page's HTML on a research report would either make
 * the page dynamic or bake in a stale one.
 */
export function Insights({
  category,
  slug,
}: {
  category: "crop" | "soil" | "fertilizer";
  slug: string;
}) {
  const { lang } = useLang();
  const mr = lang === "mr";
  const [state, setState] = useState<InsightsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/insights/${category}/${slug}`)
      .then((response) => response.json())
      .then((payload: InsightsResponse) => {
        if (!cancelled) setState(payload);
      })
      .catch(() => {
        if (!cancelled) setState({ available: false, reason: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [category, slug]);

  // Still asking. The panel keeps its space rather than appearing under the
  // reader's thumb a second after they start reading the section above it.
  if (!state) {
    return (
      <Panel mr={mr} dateline={null}>
        <p className="text-[15px] text-ink-mute">
          {mr ? "ताजी माहिती आणतो आहे…" : "Fetching the latest updates…"}
        </p>
      </Panel>
    );
  }

  // No report yet. This used to render nothing at all, which told a farmer the
  // product has no live information — when the truth is that it has not been
  // gathered for *this* topic yet and will be at the next sweep. An empty
  // state that explains itself is worth the space.
  //
  // The wording is written here rather than taken from the service's `reason`,
  // which is a single English sentence. On a page that is Marathi first, the
  // one state a farmer is most likely to hit is not the place to switch
  // languages on them.
  //
  // `enabled` is the discriminator, and its absence is meaningful. The reading
  // service sends it either way, so a payload without it did not come from the
  // reading service at all — the proxy route could not reach it and answered
  // for it. Promising that a report "will appear after the next sweep" in that
  // state would be a promise nothing is running to keep, which is exactly the
  // failure a farmer cannot detect: an empty section that says wait, forever.
  if (!state.available) {
    return (
      <Panel mr={mr} dateline={null}>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {state.enabled === undefined
            ? mr
              ? "ताजी माहिती देणारी सेवा सध्या पोहोचत नाही. पानावरची बाकीची माहिती जशीच्या तशी आहे."
              : "The service that gathers updates can't be reached right now. Everything else on this page still stands."
            : state.enabled
              ? mr
                ? "या विषयाची ताजी माहिती अजून गोळा केलेली नाही. पुढच्या फेरीत ती इथे दिसेल."
                : "The latest updates for this topic have not been gathered yet. They will appear here after the next research sweep."
              : mr
                ? "या सर्व्हरवर ताजी माहिती गोळा करण्याची सोय सुरू केलेली नाही."
                : "Live updates are not switched on for this server."}
        </p>
      </Panel>
    );
  }

  const report = state.report;

  return (
    <Panel
      mr={mr}
      dateline={<Dateline report={report} ageHours={state.age_hours} stale={state.stale} mr={mr} />}
    >
      {/* The standing caveat. Not decoration: everything above this line on
          the page was written by a person, and everything below it was
          summarised by a language model from pages it fetched. */}
      <p className="text-[14px] leading-relaxed text-ink-mute">
        {mr
          ? "ही माहिती इंटरनेटवरून आपोआप गोळा केली आहे. खाली दिलेले दुवे मूळ स्रोत आहेत — मोठा खर्च करण्याआधी ते स्वतः बघा."
          : "Collected automatically from the web. The links below are the original sources — check them yourself before spending money on any of this."}
      </p>

      {report.needs_review ? (
        <p
          role="status"
          className="mt-4 rounded-[var(--radius-card)] border border-haldi/50 bg-haldi-wash px-4 py-3 text-[14px] leading-relaxed text-haldi-ink"
        >
          {mr
            ? "यातील काही भाग तपासणीत पूर्णपणे मंजूर झालेला नाही. स्रोत बघूनच खात्री करा."
            : "Parts of this did not fully pass review. Check it against the sources."}
        </p>
      ) : null}

      {report.overview ? (
        <p className="mt-6 text-[1.05rem] leading-relaxed text-ink-soft">
          {report.overview}
        </p>
      ) : null}

      {/* Money first. A farmer who already knows how to grow the crop opens
          this page for the rate and the subsidy, not the spacing. */}
      <Prices report={report} mr={mr} />
      <Schemes report={report} mr={mr} />

      <Bullets
        items={report.new_developments}
        title={mr ? "नवीन काय आहे" : "What's new"}
        icon={<Sparkles className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        tint="bg-haldi-wash text-haldi-ink"
      />
      <Bullets
        items={report.key_facts}
        title={mr ? "मुख्य मुद्दे" : "Key points"}
        icon={<Info className="size-[18px]" strokeWidth={1.9} aria-hidden />}
        tint="bg-leaf-wash text-leaf"
      />

      <Videos report={report} mr={mr} />
      <Sources report={report} mr={mr} />
    </Panel>
  );
}

/**
 * The notice board itself.
 *
 * A haldi rule across the top and a masthead under it. The rule is the whole
 * signal: turmeric is this product's one accent and it means "this is dated",
 * so a reader who has seen it once on the card reader knows what this band of
 * the page is before reading a word of it.
 */
function Panel({
  mr,
  dateline,
  children,
}: {
  mr: boolean;
  dateline: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id="updates" className="mt-16 scroll-mt-8">
      <div
        className="overflow-hidden rounded-[var(--radius-photo)] border border-line bg-surface"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <div className="h-1.5 w-full bg-haldi" aria-hidden />

        <div className="px-5 py-6 md:px-8 md:py-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-[1.45rem] leading-tight font-semibold text-ink font-[family-name:var(--font-display)]">
              {mr ? "ताजी माहिती" : "Latest updates"}
            </h2>
            {dateline}
          </div>

          <div className="mt-5">{children}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * When it was gathered and how much of it there is, in the data face.
 *
 * Set in mono because these are figures a farmer is being asked to weigh — a
 * three-hour-old report and a two-day-old one carry different amounts of trust,
 * and that difference should be legible at a glance rather than parsed out of a
 * grey sentence.
 */
function Dateline({
  report,
  ageHours,
  stale,
  mr,
}: {
  report: TopicReport;
  ageHours: number | null;
  stale: boolean;
  mr: boolean;
}) {
  const count = report.sources?.length ?? 0;
  const hours = ageHours === null ? null : Math.max(0, Math.round(ageHours));
  const when =
    hours === null
      ? null
      : hours < 1
        ? mr
          ? "आत्ताच"
          : "just now"
        : mr
          ? `${hours} तासांपूर्वी`
          : `${hours}h ago`;

  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] tracking-wide text-ink-mute font-[family-name:var(--font-mono)]">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          stale ? "bg-ink-mute" : "bg-leaf",
        )}
        aria-hidden
      />
      {when ? (
        <span className="text-ink-soft">
          {mr ? "अद्ययावत " : "Updated "}
          {when}
        </span>
      ) : null}
      {count ? (
        <>
          <span aria-hidden>·</span>
          <span>
            {count} {mr ? "स्रोत" : count === 1 ? "source" : "sources"}
          </span>
        </>
      ) : null}
      {/* Staleness is stated, not hidden. Serving yesterday's scheme list is
          fine; implying it is live is not. */}
      {stale ? (
        <>
          <span aria-hidden>·</span>
          <span>{mr ? "लवकरच नव्याने" : "refreshing shortly"}</span>
        </>
      ) : null}
    </p>
  );
}

/**
 * One block inside the panel.
 *
 * The icon tile carries the tint, so provenance is readable before the heading
 * is — blue tiles are government records, turmeric is what changed recently.
 */
function Block({
  title,
  icon,
  tint,
  children,
}: {
  title: string;
  icon: ReactNode;
  tint: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-9 border-t border-line pt-6 first:border-0 first:pt-0">
      <h3 className="flex items-center gap-2.5 text-[1.05rem] font-semibold text-ink font-[family-name:var(--font-display)]">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px]", tint)}>
          {icon}
        </span>
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Bullets({
  items,
  title,
  icon,
  tint,
}: {
  items: string[];
  title: string;
  icon: ReactNode;
  tint: string;
}) {
  if (!items?.length) return null;
  return (
    <Block title={title} icon={icon} tint={tint}>
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item}
            className="flex gap-3 text-[1.02rem] leading-relaxed text-ink-soft"
          >
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-leaf" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </Block>
  );
}

/**
 * Government prices. Every figure here came from the Agmarknet API with a mandi
 * and a date attached — none of it was written by a model, which is the whole
 * reason this is a table rather than a sentence.
 */
function Prices({ report, mr }: { report: TopicReport; mr: boolean }) {
  const prices = report.prices ?? [];
  if (!prices.length && !report.market_notes && !report.price_note) return null;

  return (
    <Block
      title={mr ? "सरकारी बाजारभाव" : "Government mandi prices"}
      icon={<BadgeIndianRupee className="size-[18px]" strokeWidth={1.9} aria-hidden />}
      tint="bg-jal-wash text-jal-ink"
    >
      {prices.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-mute">
                <th className="pb-2 pr-4 font-medium">{mr ? "बाजार" : "Market"}</th>
                <th className="pb-2 pr-4 font-medium">{mr ? "तारीख" : "Date"}</th>
                <th className="pb-2 text-right font-medium">
                  {mr ? "भाव (रु./क्विंटल)" : "Modal (Rs/quintal)"}
                </th>
              </tr>
            </thead>
            <tbody>
              {prices.slice(0, 8).map((price, index) => (
                <tr
                  key={`${price.market}-${price.arrival_date}-${index}`}
                  className="border-b border-line/60 last:border-0"
                >
                  <td className="py-2.5 pr-4 text-ink">
                    {price.market}
                    {price.district ? (
                      <span className="text-ink-mute"> · {price.district}</span>
                    ) : null}
                  </td>
                  <td className="tnum py-2.5 pr-4 text-ink-mute">{price.arrival_date}</td>
                  <td className="tnum py-2.5 text-right font-semibold text-ink">
                    {Math.round(price.modal_price).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // "We could not ask" and "there is nothing" are different facts, and
        // the farmer is told which.
        <p className="text-[15px] leading-relaxed text-ink-mute">
          {report.price_note ||
            (mr
              ? "सरकारी भावाची माहिती सध्या उपलब्ध नाही."
              : "Government price data is unavailable right now.")}
        </p>
      )}

      {report.market_notes ? (
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          {report.market_notes}
        </p>
      ) : null}
    </Block>
  );
}

function Schemes({ report, mr }: { report: TopicReport; mr: boolean }) {
  const schemes = report.government_schemes ?? [];
  if (!schemes.length) return null;

  return (
    <Block
      title={mr ? "सरकारी योजना" : "Government schemes"}
      icon={<Landmark className="size-[18px]" strokeWidth={1.9} aria-hidden />}
      tint="bg-jal-wash text-jal-ink"
    >
      {/* One scheme in a two-column grid is a tall half-width card with a
          hole beside it. The columns only appear once there is something to
          put in them. */}
      <ul className={cn("grid gap-3", schemes.length > 1 && "sm:grid-cols-2")}>
        {schemes.map((scheme) => (
          <li
            key={scheme.name}
            className="rounded-[var(--radius-card)] border border-line bg-paper p-5"
          >
            <p className="text-[1.02rem] font-semibold text-ink">{scheme.name}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
              {scheme.description}
            </p>
            {scheme.url ? (
              <a
                href={scheme.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-jal-ink underline decoration-jal/40 underline-offset-4 hover:decoration-jal-ink"
              >
                {mr ? "अधिकृत पान" : "Official page"}
                <ExternalLink className="size-3.5" strokeWidth={2} aria-hidden />
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </Block>
  );
}

function Videos({ report, mr }: { report: TopicReport; mr: boolean }) {
  const videos = report.youtube_resources ?? [];
  if (!videos.length) return null;

  return (
    <Block
      title={mr ? "बघण्यासारखं" : "Worth watching"}
      icon={<PlayCircle className="size-[18px]" strokeWidth={1.9} aria-hidden />}
      tint="bg-leaf-wash text-leaf"
    >
      <ul className={cn("grid gap-3", videos.length > 1 && "sm:grid-cols-2")}>
        {videos.map((video) => (
          <li key={video.url}>
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-16 items-start gap-3 rounded-[var(--radius-card)] border border-line bg-paper p-4 transition-colors hover:border-leaf/45 hover:bg-leaf-wash"
            >
              <PlayCircle
                className="mt-0.5 size-6 shrink-0 text-leaf"
                strokeWidth={1.8}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-[15px] leading-snug font-medium text-ink">
                  {video.title}
                </span>
                {/* The channel, always. It is how a farmer judges whether to
                    trust a ten-minute video before spending ten minutes. */}
                {video.channel ? (
                  <span className="mt-0.5 block text-[13px] text-ink-mute">
                    {video.channel}
                  </span>
                ) : null}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function Sources({ report, mr }: { report: TopicReport; mr: boolean }) {
  const sources = report.sources ?? [];
  if (!sources.length) return null;

  return (
    <div className="mt-9 border-t border-line pt-5">
      <p className="eyebrow text-ink-mute">{mr ? "स्रोत" : "Sources"}</p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1 text-[13px] text-ink-mute",
                "underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink-mute",
              )}
            >
              {source.title || source.url}
              <ExternalLink className="size-3" strokeWidth={2} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
