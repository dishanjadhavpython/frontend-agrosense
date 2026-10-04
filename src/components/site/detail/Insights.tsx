"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeIndianRupee,
  Bot,
  ExternalLink,
  Info,
  Landmark,
  LoaderCircle,
  PlayCircle,
  RefreshCw,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { InsightsResponse, TopicReport } from "@/lib/cardTypes";
import { requestResearch } from "@/lib/research";

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
 *   ink (neutral)   a shop. Deliberately colourless: a place to spend money
 *                   must never wear the colour this product uses for its own
 *                   recommendations, or a listing starts to read as advice.
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
  const [ask, setAsk] = useState<Ask>({ kind: "idle" });
  // Bumped to restart the fetch loop — after a tap starts the agents, the
  // next read is the one that sees `researching` and begins polling.
  const [round, setRound] = useState(0);

  // A tap that arrives before the first read has landed is kept, not
  // dropped: the link is at the top of the page and the read is not instant.
  const pending = useRef(false);

  /** Start the agents on this topic now. */
  const getLatest = useCallback(async () => {
    setAsk({ kind: "asking" });
    const outcome = await requestResearch({ [category]: [slug] });
    if (!outcome.ok) {
      setAsk({ kind: "error", error: outcome.error });
      return;
    }
    const key = `${category}/${slug}`;
    const mine = outcome.result.skipped.find((s) => s.startsWith(`${key} `)) ?? "";
    if (outcome.result.started.includes(key) || mine.includes("already running")) {
      setAsk({ kind: "started" });
      // Shown as working at once, not after the next read: between the tap
      // and that read, the old "nothing yet" state would otherwise flash the
      // failure sentence below.
      setState((prev) => (prev ? { ...prev, researching: true } : prev));
    } else if (mine.includes("fresh")) {
      setAsk({ kind: "fresh" });
    } else if (mine.includes("queue full")) {
      setAsk({ kind: "busy" });
    } else if (outcome.result.enabled === false) {
      setAsk({ kind: "error", error: "unavailable" });
      return;
    } else {
      setAsk({ kind: "error", error: "unavailable" });
      return;
    }
    setRound((r) => r + 1);
  }, [category, slug]);

  /**
   * Fetch, and keep fetching while the agents are on this topic.
   *
   * Every eight seconds, and only while `researching` is true. A run takes
   * about a minute, so a farmer who tapped "get the latest" sees the report
   * arrive within seconds of it being written; a topic that is merely stale
   * is not polled, because nobody is waiting on it.
   */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const response = await fetch(`/api/insights/${category}/${slug}`, { cache: "no-store" });
        const payload = (await response.json()) as InsightsResponse;
        if (cancelled) return;
        setState(payload);
        if (pending.current) {
          pending.current = false;
          if ((!payload.available || payload.stale) && !payload.researching) {
            void getLatest();
            return;
          }
        }
        if (payload.researching) timer = setTimeout(load, 8_000);
      } catch {
        // A failed poll stops the loop rather than retrying forever against a
        // service that is down. The panel says so and the page still stands.
        if (!cancelled) setState({ available: false, reason: "" });
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [category, slug, round, getLatest]);


  /**
   * The page header's "See the latest updates" is a request, not only a
   * scroll: it announces itself with this event, and a topic with no report
   * or a stale one starts the agents. A fresh report is just shown.
   */
  useEffect(() => {
    const onRequest = () => {
      if (!state) {
        pending.current = true;
        return;
      }
      const stale = !state.available || state.stale;
      if (stale && !state.researching && ask.kind !== "asking") void getLatest();
    };
    window.addEventListener(LATEST_EVENT, onRequest);
    return () => window.removeEventListener(LATEST_EVENT, onRequest);
  }, [state, ask.kind, getLatest]);


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

  // `enabled` is the discriminator, and its absence is meaningful: the
  // reading service sends it either way, so a payload without it came from
  // the proxy answering for a service it could not reach.
  const reachable = state.enabled !== undefined;
  const enabled = state.enabled === true;

  if (!state.available) {
    // Being written right now — by a tap here, a prediction, or the sweep.
    if (state.researching) {
      return (
        <Panel mr={mr} dateline={null}>
          <Working mr={mr} />
        </Panel>
      );
    }

    return (
      <Panel mr={mr} dateline={null}>
        {!reachable ? (
          <p className="text-[15px] leading-relaxed text-ink-soft">
            {mr
              ? "ताजी माहिती देणारी सेवा सध्या पोहोचत नाही. पानावरची बाकीची माहिती जशीच्या तशी आहे."
              : "The service that gathers updates can't be reached right now. Everything else on this page still stands."}
          </p>
        ) : !enabled ? (
          <p className="text-[15px] leading-relaxed text-ink-soft">
            {mr
              ? "या सर्व्हरवर ताजी माहिती गोळा करण्याची सोय सुरू केलेली नाही."
              : "Live updates are not switched on for this server."}
          </p>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed text-ink-soft">
              {ask.kind === "started"
                ? mr
                  ? "या वेळी माहिती गोळा करता आली नाही. थोड्या वेळाने पुन्हा प्रयत्न करा."
                  : "The agents could not put a report together this time. Try again in a little while."
                : mr
                  ? "या विषयाची ताजी माहिती अजून गोळा केलेली नाही. बटण दाबा — आमचे संशोधन एजंट सरकारी संकेतस्थळं, बाजारभाव आणि व्हिडिओ आत्ता शोधतील."
                  : "Nothing has been gathered on this yet. Tap the button and our research agents will search government sites, market prices and videos for it now."}
            </p>
            <GetLatest ask={ask} onAsk={getLatest} mr={mr} />
          </>
        )}
      </Panel>
    );
  }

  const report = state.report;

  return (
    <Panel
      mr={mr}
      dateline={
        <Dateline
          report={report}
          ageHours={state.age_hours}
          stale={state.stale}
          researching={state.researching ?? false}
          mr={mr}
        />
      }
    >
      {/* The standing caveat. Not decoration: everything above this line on
          the page was written by a person, and everything below it was
          summarised by a language model from pages it fetched. */}
      <p className="text-[14px] leading-relaxed text-ink-mute">
        {mr
          ? "ही माहिती इंटरनेटवरून आपोआप गोळा केली आहे. खाली दिलेले दुवे मूळ स्रोत आहेत — मोठा खर्च करण्याआधी ते स्वतः बघा."
          : "Collected automatically from the web. The links below are the original sources — check them yourself before spending money on any of this."}
      </p>

      <Provenance model={report.model} mr={mr} />

      {/* A stale report can be refreshed from here. While a new one is being
          written the old one stays on screen, marked as refreshing. */}
      {state.researching ? (
        <div className="mt-4">
          <Working mr={mr} compact />
        </div>
      ) : state.stale && enabled ? (
        <div className="mt-4">
          <GetLatest ask={ask} onAsk={getLatest} mr={mr} refresh />
        </div>
      ) : null}

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

      {/* Money first, then what to do, then where to get it, then what to
          watch. A farmer who already knows how to grow the crop opens this
          page for the rate and the subsidy, not the spacing.

          Laid out as a grid rather than a single column: seven sections
          stacked vertically is the "wall of text" this restructure exists to
          undo. Each block is now its own card and can be scanned past. */}
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <Prices report={report} mr={mr} />
        <Schemes report={report} mr={mr} />
        <Bullets
          items={report.key_facts}
          title={mr ? "मुख्य मुद्दे" : "Key points"}
          icon={<Info className="size-[18px]" strokeWidth={1.9} aria-hidden />}
          tint="bg-leaf-wash text-leaf"
        />
        <Bullets
          items={report.new_developments}
          title={mr ? "नवीन काय आहे" : "What's new"}
          icon={<Sparkles className="size-[18px]" strokeWidth={1.9} aria-hidden />}
          tint="bg-haldi-wash text-haldi-ink"
        />
        <WhereToBuy report={report} mr={mr} />
        <Videos report={report} mr={mr} />
      </div>

      <Sources report={report} mr={mr} />
    </Panel>
  );
}

/** Dispatched by the page header's "See the latest updates". */
export const LATEST_EVENT = "agrosense:get-latest";

type Ask =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "started" }
  | { kind: "fresh" }
  | { kind: "busy" }
  | { kind: "error"; error: "signed-out" | "limit" | "offline" | "unavailable" };

/**
 * The button that starts the agents, and what came of the last tap.
 *
 * Signed out is the common case on a page anyone can open, so it is a link to
 * sign in that comes back here — not an error after the tap.
 */
function GetLatest({
  ask,
  onAsk,
  mr,
  refresh = false,
}: {
  ask: Ask;
  onAsk: () => void;
  mr: boolean;
  refresh?: boolean;
}) {
  const busy = ask.kind === "asking";
  const here =
    typeof window === "undefined" ? "/" : `${window.location.pathname}#updates`;

  if (ask.kind === "error" && ask.error === "signed-out") {
    return (
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-ink-soft">
        <a
          href={`/sign-in?redirect_url=${encodeURIComponent(here)}`}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-paper transition-colors hover:bg-leaf-deep"
        >
          {mr ? "लॉग इन करा" : "Sign in"}
          <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
        </a>
        {mr ? "ताजी माहिती मिळवण्यासाठी लॉग इन करावं लागतं." : "Sign in to have the agents gather the latest."}
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onAsk}
        disabled={busy}
        className={cn(
          "inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-[14.5px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-70",
          refresh
            ? "border border-line bg-surface text-ink hover:border-leaf/50 hover:bg-leaf-wash"
            : "bg-ink text-paper hover:bg-leaf-deep dark:bg-leaf dark:text-on-light dark:hover:bg-leaf-4",
        )}
      >
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" strokeWidth={2.2} aria-hidden />
        ) : (
          <RefreshCw className="size-4" strokeWidth={2.2} aria-hidden />
        )}
        {refresh
          ? mr ? "नवी माहिती आत्ता आणा" : "Refresh it now"
          : mr ? "ताजी माहिती आत्ता मिळवा" : "Get the latest information now"}
      </button>
      {ask.kind === "busy" ? (
        <p className="mt-2 text-[13.5px] text-haldi-ink">
          {mr
            ? "एजंट सध्या इतर विषयांवर काम करत आहेत. एका मिनिटाने पुन्हा दाबा."
            : "The agents are busy with other topics. Tap again in a minute."}
        </p>
      ) : ask.kind === "fresh" ? (
        <p className="mt-2 text-[13.5px] text-ink-soft">
          {mr ? "ही माहिती आत्ताच अद्ययावत केली आहे." : "This was brought up to date only recently."}
        </p>
      ) : ask.kind === "error" ? (
        <p className="mt-2 text-[13.5px] text-anar">
          {ask.error === "limit"
            ? mr ? "आजची मर्यादा संपली. उद्या पुन्हा प्रयत्न करा." : "You've reached today's limit. Try again tomorrow."
            : mr ? "आत्ता सुरू करता आलं नाही. थोड्या वेळाने पुन्हा प्रयत्न करा." : "Couldn't start it right now. Try again shortly."}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The agents at work. What it lists is what the pipeline does, not a
 * progress bar — nothing on the server reports which step a run is on, and a
 * bar that moved on its own would be inventing one.
 */
function Working({ mr, compact = false }: { mr: boolean; compact?: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-[var(--radius-card)] border border-haldi/45 bg-haldi-wash",
        compact ? "px-4 py-3" : "px-5 py-4",
      )}
    >
      <p className="flex items-center gap-2.5 text-[15px] font-semibold text-haldi-ink">
        <LoaderCircle className="size-4 shrink-0 animate-spin" strokeWidth={2.4} aria-hidden />
        {compact
          ? mr ? "नवी माहिती आत्ता गोळा होत आहे…" : "A fresh report is being gathered now…"
          : mr ? "आमचे संशोधन एजंट आत्ता माहिती गोळा करत आहेत…" : "Our research agents are gathering this now…"}
      </p>
      {compact ? null : (
        <>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
            {mr
              ? "साधारण एक मिनिट लागतो. पान आपोआप भरेल — थांबून राहायची गरज नाही."
              : "It takes about a minute, and the page fills in on its own — no need to wait here."}
          </p>
          <ul className="mt-3 grid gap-1.5 text-[13px] text-ink-soft sm:grid-cols-2">
            {(mr
              ? [
                  "सरकारी व कृषी संकेतस्थळं शोधणं आणि वाचणं",
                  "data.gov.in वरचे बाजारभाव",
                  "शेतकऱ्यांसाठी उपयोगी व्हिडिओ",
                  "प्रत्येक मुद्दा स्रोताशी तपासणं",
                ]
              : [
                  "Searching and reading government and farm sites",
                  "Market prices from data.gov.in",
                  "A video worth a farmer's time",
                  "Checking every claim against its source",
                ]
            ).map((step) => (
              <li key={step} className="flex items-start gap-2">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-haldi" aria-hidden />
                {step}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Which model wrote this, named plainly. */
function Provenance({ model, mr }: { model?: string; mr: boolean }) {
  if (!model) return null;
  const nova = /nova-pro/i.test(model);
  return (
    <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-1.5 text-[12.5px] text-ink-soft">
      <Bot className="size-4 shrink-0 text-leaf" strokeWidth={1.9} aria-hidden />
      {nova
        ? mr
          ? "AWS Bedrock वरच्या Amazon Nova Pro वर चालणाऱ्या AgroSense संशोधन एजंटनी तयार केलं"
          : "Written by AgroSense research agents on Amazon Nova Pro (AWS Bedrock)"
        : mr
          ? `AgroSense संशोधन एजंटनी तयार केलं · ${model}`
          : `Written by AgroSense research agents · ${model}`}
    </p>
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
  researching,
  mr,
}: {
  report: TopicReport;
  ageHours: number | null;
  stale: boolean;
  /** A newer report is being written while this one is on screen. */
  researching: boolean;
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
          researching ? "animate-pulse bg-haldi" : stale ? "bg-ink-mute" : "bg-leaf",
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
          fine; implying it is live is not. "Refreshing now" is the stronger
          claim and only gets made when a run is genuinely in flight. */}
      {researching ? (
        <>
          <span aria-hidden>·</span>
          <span className="text-haldi-ink">
            {mr ? "आत्ता नव्याने घेतो आहे" : "refreshing now"}
          </span>
        </>
      ) : stale ? (
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
/**
 * One block inside the panel, as a card.
 *
 * These used to be rules across a single column, which meant seven sections
 * read as one continuous document and a farmer looking for the price had to
 * scroll past the agronomy to find it. As cards in a grid they can be skipped
 * over, and the one that matters is findable by its icon tile.
 *
 * The icon tile carries the tint, so provenance is readable before the heading
 * is — blue tiles are government records, turmeric is what changed recently,
 * neutral is a shop.
 *
 * `span` is for content that cannot be halved: a wide price table.
 */
function Block({
  title,
  icon,
  tint,
  span,
  children,
}: {
  title: string;
  icon: ReactNode;
  tint: string;
  span?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-paper p-5",
        span && "sm:col-span-2",
      )}
    >
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

/**
 * Where to buy it.
 *
 * Every link came from `seller_server.py` — an allowlist of known Indian
 * sellers, each URL fetched and checked before publication, and re-checked
 * against the same allowlist by the reviewer. No model wrote these.
 *
 * Styled neutrally on purpose. The disclaimer is not boilerplate either: this
 * lists shops that stock the item, it does not compare prices or vouch for a
 * seller, and a farmer must not read a listing here as advice to buy from that
 * particular shop rather than their local dealer.
 */
function WhereToBuy({ report, mr }: { report: TopicReport; mr: boolean }) {
  const links = report.where_to_buy ?? [];
  if (!links.length && !report.buy_note) return null;

  return (
    <Block
      title={mr ? "कुठून घ्यायचं" : "Where to buy"}
      icon={<ShoppingCart className="size-[18px]" strokeWidth={1.9} aria-hidden />}
      tint="bg-surface text-ink-soft ring-1 ring-line"
    >
      {links.length ? (
        <>
          <ul className="space-y-2.5">
            {links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="group flex min-h-16 items-start justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-colors hover:border-ink/25"
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-ink">
                      {link.seller}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-mute">
                      {link.title}
                    </span>
                  </span>
                  <ExternalLink
                    className="mt-0.5 size-4 shrink-0 text-ink-mute"
                    strokeWidth={2}
                    aria-hidden
                  />
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-mute">
            {mr
              ? "ही दुकानं फक्त यादीसाठी आहेत — शिफारस नाही. भाव आणि साठा रोज बदलतो, तो तपासलेला नाही. गावातल्या कृषी सेवा केंद्रात स्वस्त मिळू शकतं."
              : "Listed, not recommended. Prices and stock change daily and were not checked — your local agri-input dealer may well be cheaper."}
          </p>
        </>
      ) : (
        // The page's own sentence, not the agent's `buy_note`: that is English,
        // and was once "could not be retrieved due to a tool error".
        <p className="text-[15px] leading-relaxed text-ink-mute">
          {mr
            ? "ओळखीच्या ऑनलाइन दुकानांत हे सापडलं नाही. गावातल्या कृषी सेवा केंद्रात विचारा."
            : "No listing could be verified on a known seller. Ask your local agri-input dealer."}
        </p>
      )}
    </Block>
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
      span
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
        // In the page's own words rather than the agent's `price_note`, which
        // is English on a Marathi-first page and once named a server setting.
        <p className="text-[15px] leading-relaxed text-ink-mute">
          {mr
            ? "सरकारी बाजारभावाची माहिती सध्या उपलब्ध नाही."
            : "Government market prices are not available for this right now."}
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
      <ul className="grid gap-3">
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
      <ul className="grid gap-3">
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
    <div className="mt-6 border-t border-line pt-5">
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
