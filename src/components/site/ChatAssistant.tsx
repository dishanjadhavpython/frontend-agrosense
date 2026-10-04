"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { ArrowUp, ExternalLink, MessageCircle, Sprout, Square, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { useCard } from "@/lib/cardState";
import { cn } from "@/lib/cn";
import { CROPS } from "@/data/crops";
import { SOILS } from "@/data/soils";
import type { PredictionResult } from "@/lib/cardTypes";
import type { Recommendation } from "@/lib/recommendTypes";
import type { SoilReadResult } from "@/lib/soilTypes";

/**
 * The farmer assistant — a question box that already knows the farmer's field.
 *
 * Everything the browser holds about this farmer's result (soil from the photo,
 * the ranked crops, the fertilizer verdicts and the readings they came from,
 * the taluka and season) travels with each question, so "why jute?" is answered
 * about their jute and not about jute in general. Nothing is stored: the
 * conversation lives as long as the page does, like the card itself.
 *
 * One floating launcher, stacked above the examiner switch rather than
 * competing with it for the same corner; the panel is a bottom sheet on a phone
 * and a docked card on a wider screen. Paper and surface grounds only — the
 * night token stays reserved for the page's own punctuation.
 */

type Bi = { mr: string; en: string };
type Source = { title: string; url: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  status?: "streaming" | "done" | "error";
};

type ChatContext = {
  soil?: string;
  soil_confidence?: number;
  crops?: string[];
  crop_soil_fit?: Record<string, string>;
  fertilizers?: { name: string; verdict: "apply" | "hold" }[];
  fertilizers_for?: string;
  readings?: Record<string, number>;
  nutrient_status?: Record<string, string | null>;
  district?: string;
  taluka?: string;
  season?: string;
  engine_crops?: string[];
};

const T = {
  open: { mr: "प्रश्न विचारा", en: "Ask a question" },
  title: { mr: "AgroSense सहाय्यक", en: "AgroSense assistant" },
  withCard: { mr: "तुमच्या पत्रिकेवरून उत्तर देतो", en: "Answers from your card" },
  general: { mr: "शेतीविषयी काहीही विचारा", en: "Ask anything about your farm" },
  close: { mr: "बंद करा", en: "Close" },
  placeholder: { mr: "तुमचा प्रश्न लिहा…", en: "Type your question…" },
  send: { mr: "पाठवा", en: "Send" },
  stop: { mr: "थांबवा", en: "Stop" },
  hello: {
    mr: "नमस्कार! पीक, माती, खत, पाणी किंवा योजनांबद्दल विचारा. तुम्ही पत्रिका दिली असेल तर उत्तर तुमच्या शेतावरून देईन.",
    en: "Hello! Ask about crops, soil, fertilizer, water or schemes. If you have sent your card, I'll answer for your own field.",
  },
  signIn: {
    mr: "सहाय्यक वापरण्यासाठी लॉग इन करा — प्रत्येक उत्तर तुमच्या खात्यावर मोजलं जातं.",
    en: "Sign in to use the assistant — each answer is counted against your account.",
  },
  signInButton: { mr: "लॉग इन करा", en: "Sign in" },
  sources: { mr: "स्रोत", en: "Sources" },
  disclaimer: {
    mr: "उत्तरं AI तयार करतं. मोठ्या निर्णयापूर्वी कृषी अधिकारी किंवा KVK शी बोला.",
    en: "Answers are AI-generated. Check big decisions with your agriculture officer or KVK.",
  },
  failed: {
    mr: "उत्तर मिळालं नाही. पुन्हा प्रयत्न करा.",
    en: "No answer came back. Please try again.",
  },
  stopped: { mr: "(थांबवलं)", en: "(stopped)" },
} satisfies Record<string, Bi>;

const nameOf = (key: string, mr: boolean): string => {
  const crop = CROPS.find((c) => c.key === key.trim().toLowerCase());
  return crop ? (mr ? crop.mr : crop.en) : key;
};

function contextFrom(
  prediction: PredictionResult | null,
  recommendation: Recommendation | null,
  soilRead: SoilReadResult | null,
): ChatContext | undefined {
  const context: ChatContext = {};
  if (prediction) {
    context.soil = prediction.soil.key;
    context.soil_confidence = prediction.soil.confidence;
    context.crops = prediction.crops.map((c) => c.name).slice(0, 8);
    context.crop_soil_fit = Object.fromEntries(
      prediction.crops.filter((c) => c.soil_fit).map((c) => [c.name, String(c.soil_fit)]),
    );
    context.fertilizers = prediction.fertilizers.slice(0, 8).map((f) => ({ name: f.name, verdict: f.verdict }));
    if (prediction.fertilizers_for) context.fertilizers_for = prediction.fertilizers_for;
    context.readings = prediction.readings_used;
    context.nutrient_status = prediction.nutrient_status;
  } else if (soilRead) {
    context.soil = soilRead.key;
    context.soil_confidence = soilRead.confidence;
  }
  if (recommendation) {
    context.district = recommendation.district;
    context.taluka = recommendation.taluka;
    context.season = recommendation.season;
    context.engine_crops = recommendation.crops.slice(0, 5).map((c) => c.crop);
  }
  return Object.keys(context).length ? context : undefined;
}

function suggestionsFor(context: ChatContext | undefined, mr: boolean): string[] {
  const top = context?.crops?.[0];
  if (top) {
    const crop = nameOf(top, mr);
    const fert = context?.fertilizers?.find((f) => f.verdict === "apply")?.name;
    return mr
      ? [
          `${crop} का सुचवलं?`,
          fert ? `${fert} कधी आणि कसं द्यायचं?` : "माझ्या मातीला कोणतं खत लागेल?",
          "माझ्या मातीचा कस कसा वाढवू?",
          `${crop} साठी कोणत्या सरकारी योजना आहेत?`,
        ]
      : [
          `Why was ${crop} recommended?`,
          fert ? `When and how should I apply ${fert}?` : "Which fertilizer does my soil need?",
          "How can I improve my soil's health?",
          `Are there government schemes for ${crop}?`,
        ];
  }
  if (context?.soil) {
    const soil = SOILS.find((s) => s.key === context.soil);
    const name = soil ? (mr ? soil.mr : soil.en) : context.soil;
    return mr
      ? [`${name} मध्ये कोणती पिकं चांगली येतात?`, "मृदा आरोग्य पत्रिका कशी वाचायची?", "पाणी कसं वाचवायचं?"]
      : [`Which crops grow well in ${name}?`, "How do I read a Soil Health Card?", "How can I save water on my farm?"];
  }
  return mr
    ? ["काळ्या जमिनीत कोणती पिकं घ्यावी?", "मृदा आरोग्य पत्रिका कशी वाचायची?", "खरिपात तूर कधी पेरायची?", "ठिबक सिंचनाचे फायदे काय?"]
    : ["Which crops suit black soil?", "How do I read a Soil Health Card?", "When should I sow tur in kharif?", "What are the benefits of drip irrigation?"];
}

/* ---- A deliberately small renderer: paragraphs, lists and **bold**. ---------
   No HTML from the model ever reaches the DOM — every node here is built by
   React from plain strings, so a reply cannot inject markup or a script. */

function inline(text: string, keyBase: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${keyBase}-${i}`} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={`${keyBase}-${i}`}>{part}</Fragment>
    ),
  );
}

function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(
        <p key={k} className="whitespace-pre-line">
          {inline(para.join("\n"), k)}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const k = `l${blocks.length}`;
      const items = list.items.map((item, i) => <li key={`${k}-${i}`}>{inline(item, `${k}-${i}`)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={k} className="list-decimal space-y-1 pl-5">{items}</ol>
        ) : (
          <ul key={k} className="list-disc space-y-1 pl-5 marker:text-leaf">{items}</ul>
        ),
      );
      list = null;
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1].replace(/^#+\s*/, ""));
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.replace(/^#+\s*/, ""));
    }
  }
  flushPara();
  flushList();
  return <div className="space-y-2.5">{blocks}</div>;
}

export function ChatAssistant() {
  const { lang } = useLang();
  const mr = lang === "mr";
  const t = (s: Bi) => (mr ? s.mr : s.en);
  const { isLoaded, isSignedIn } = useAuth();
  const { prediction, recommendation, soil } = useCard();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const context = useMemo(() => contextFrom(prediction, recommendation, soil), [prediction, recommendation, soil]);
  const suggestions = useMemo(() => suggestionsFor(context, mr), [context, mr]);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Keep the newest words in view while they stream in.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Closing the page mid-answer stops the answer.
  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = (patch: (m: Message) => Message) =>
    setMessages((all) => (all.length ? [...all.slice(0, -1), patch(all[all.length - 1])] : all));

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const history = [...messages, { id: crypto.randomUUID(), role: "user" as const, text }];
    setMessages([...history, { id: crypto.randomUUID(), role: "assistant", text: "", status: "streaming" }]);
    setDraft("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          lang,
          context,
          messages: history
            .filter((m) => m.text.trim())
            .slice(-24)
            .map((m) => ({ role: m.role, content: m.text })),
        }),
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { message?: Bi } | null;
        patchLast((m) => ({ ...m, text: body?.message ? t(body.message) : t(T.failed), status: "error" }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const event = JSON.parse(line) as { t: string; text?: string; message?: Bi; sources?: Source[] };
          if (event.t === "delta" && event.text) {
            const piece = event.text;
            patchLast((m) => ({ ...m, text: m.text + piece }));
          } else if (event.t === "blocked" && event.message) {
            const message = event.message;
            patchLast((m) => ({ ...m, text: t(message) }));
          } else if (event.t === "error") {
            const message = event.message ?? T.failed;
            patchLast((m) => ({ ...m, text: m.text || t(message), status: "error" }));
          } else if (event.t === "done") {
            const sources = event.sources ?? [];
            patchLast((m) => ({ ...m, sources, status: m.status === "error" ? "error" : "done" }));
          }
        }
      }
      patchLast((m) => (m.status === "streaming" ? { ...m, status: "done" } : m));
    } catch (error) {
      const stopped = (error as Error)?.name === "AbortError";
      patchLast((m) => ({
        ...m,
        text: m.text ? (stopped ? `${m.text} ${t(T.stopped)}` : m.text) : stopped ? t(T.stopped) : t(T.failed),
        status: stopped ? "done" : "error",
      }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const signedOut = isLoaded && !isSignedIn;

  // On the sign-in and sign-up screens the launcher has nothing to offer (it
  // would only say "sign in first") and on a phone it covers the "Sign up" link.
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return null;

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        className={cn(
          "no-print fixed right-4 z-50 inline-flex min-h-12 items-center gap-2 rounded-full px-4",
          "bg-ink text-paper shadow-[var(--shadow-panel)] transition-colors duration-200 hover:bg-leaf-deep",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf",
          "dark:bg-leaf-5 dark:text-on-light dark:hover:bg-leaf-deep",
          open && "max-sm:hidden",
        )}
        style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {open ? <X className="size-5" strokeWidth={2.2} aria-hidden /> : <MessageCircle className="size-5" strokeWidth={2.2} aria-hidden />}
        <span className="text-[15px] font-semibold">{open ? t(T.close) : t(T.open)}</span>
      </button>

      {open ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className={cn(
            "no-print fixed z-[60] flex flex-col overflow-hidden",
            "rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-panel)]",
            // A bottom sheet on a phone; on a wider screen, docked above its
            // own launcher so the two never cover each other.
            "inset-x-2 top-[10dvh] bottom-2",
            "sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-[calc(8.75rem+env(safe-area-inset-bottom,0px))]",
            "sm:w-[25.5rem] sm:h-[min(38rem,calc(100dvh-11rem))]",
          )}
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-leaf-1 text-leaf-deep">
              <Sprout className="size-5" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-[16px] font-semibold text-ink">
                {t(T.title)}
              </h2>
              <p className="truncate text-[12.5px] text-ink-mute">{context ? t(T.withCard) : t(T.general)}</p>
            </div>
            <button
              type="button"
              onClick={close}
              className="grid size-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-leaf-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-leaf"
              aria-label={t(T.close)}
            >
              <X className="size-5" strokeWidth={2.2} aria-hidden />
            </button>
          </header>

          <div ref={listRef} role="log" aria-live="polite" aria-relevant="additions text" className="flex-1 space-y-3 overflow-y-auto bg-paper px-4 py-4">
            <div className="mr-auto max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink-soft">
              {t(T.hello)}
            </div>

            {messages.map((m) =>
              m.role === "user" ? (
                <div
                  key={m.id}
                  className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-line text-paper dark:bg-leaf-5 dark:text-on-light"
                >
                  {m.text}
                </div>
              ) : (
                <div
                  key={m.id}
                  className={cn(
                    "mr-auto max-w-[92%] rounded-2xl rounded-bl-md border px-4 py-3 text-[15px] leading-relaxed",
                    m.status === "error" ? "border-haldi/50 bg-haldi-wash text-haldi-ink" : "border-line bg-surface text-ink-soft",
                  )}
                >
                  {m.text ? (
                    <RichText text={m.text} />
                  ) : (
                    <span className="inline-flex gap-1 py-1" aria-label={mr ? "उत्तर लिहिलं जात आहे" : "Writing an answer"}>
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="size-2 rounded-full bg-leaf/60 motion-safe:animate-pulse" style={{ animationDelay: `${i * 160}ms` }} />
                      ))}
                    </span>
                  )}
                  {m.sources && m.sources.length > 0 ? (
                    <div className="mt-3 border-t border-line pt-2.5">
                      <p className="text-[12px] font-semibold text-ink-mute">{t(T.sources)}</p>
                      <ul className="mt-1.5 space-y-1">
                        {m.sources.map((s) => (
                          <li key={s.url}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-start gap-1.5 text-[13px] text-leaf underline decoration-leaf/35 underline-offset-2 hover:decoration-leaf"
                            >
                              <ExternalLink className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                              <span className="line-clamp-2">{s.title}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ),
            )}

            {messages.length === 0 && !signedOut ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="min-h-10 rounded-full border border-line bg-surface px-3.5 py-2 text-left text-[13.5px] text-ink transition-colors hover:border-leaf hover:bg-leaf-wash focus-visible:outline-2 focus-visible:outline-leaf"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <footer className="border-t border-line bg-surface px-3 pt-3 pb-2.5">
            {signedOut ? (
              <div className="flex flex-col items-start gap-3 px-1 pb-1">
                <p className="text-[14px] leading-relaxed text-ink-soft">{t(T.signIn)}</p>
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-[15px] font-semibold text-paper hover:bg-leaf-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf dark:bg-leaf-5 dark:text-on-light"
                  >
                    {t(T.signInButton)}
                  </button>
                </SignInButton>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(draft);
                }}
                className="relative"
              >
                <label htmlFor={`${titleId}-input`} className="sr-only">
                  {t(T.placeholder)}
                </label>
                <textarea
                  id={`${titleId}-input`}
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send(draft);
                    }
                  }}
                  rows={2}
                  placeholder={t(T.placeholder)}
                  className="block max-h-36 min-h-12 w-full resize-none rounded-2xl border border-line bg-paper py-3 pr-14 pl-4 text-[15px] leading-relaxed text-ink placeholder:text-ink-mute focus-visible:border-leaf focus-visible:outline-2 focus-visible:outline-leaf/40"
                />
                {busy ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="absolute right-2 bottom-2 grid size-10 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-leaf-wash focus-visible:outline-2 focus-visible:outline-leaf"
                    aria-label={t(T.stop)}
                  >
                    <Square className="size-4" strokeWidth={2.4} aria-hidden />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="absolute right-2 bottom-2 grid size-10 place-items-center rounded-full bg-ink text-paper transition-colors hover:bg-leaf-deep disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf dark:bg-leaf-5 dark:text-on-light"
                    aria-label={t(T.send)}
                  >
                    <ArrowUp className="size-5" strokeWidth={2.4} aria-hidden />
                  </button>
                )}
              </form>
            )}
            <p className="mt-2 px-1 text-[11.5px] leading-snug text-ink-mute">{t(T.disclaimer)}</p>
          </footer>
        </section>
      ) : null}
    </>
  );
}
