import { NextResponse } from "next/server";
import { authedServiceHeaders } from "@/lib/cardApi";

/**
 * The farmer assistant, proxied to the reading service's `/api/chat`.
 *
 * Signed-in only — `middleware.ts` does not list this path as public, because
 * every message is a paid Bedrock call. The reply is NDJSON and is passed
 * through as a stream, byte for byte: buffering it here would hold the first
 * words back until the last one was written, which on a 2G connection is the
 * difference between an assistant and a loading spinner.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = (process.env.AGROSENSE_API_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "");

type Bi = { mr: string; en: string };

const MESSAGES = {
  "bad-request": {
    mr: "प्रश्न वाचता आला नाही. पुन्हा लिहून पाठवा.",
    en: "That message could not be read. Please send it again.",
  },
  busy: {
    mr: "आजचे प्रश्न संपले. उद्या पुन्हा विचारा.",
    en: "You have reached today's limit. Please ask again tomorrow.",
  },
  offline: {
    mr: "सहाय्यक सध्या उपलब्ध नाही. थोड्या वेळाने पुन्हा प्रयत्न करा.",
    en: "The assistant is not available right now. Please try again shortly.",
  },
  unknown: {
    mr: "उत्तर मिळवताना अडचण आली. पुन्हा प्रयत्न करा.",
    en: "Something went wrong getting an answer. Please try again.",
  },
} satisfies Record<string, Bi>;

type Kind = keyof typeof MESSAGES;

function fail(kind: Kind, status: number, message?: Bi, headers?: HeadersInit) {
  return NextResponse.json(
    { error: kind, message: message ?? MESSAGES[kind] },
    { status, headers },
  );
}

const MAX_TURNS = 24;
const MAX_CHARS = 2000;

type Turn = { role: "user" | "assistant"; content: string };

/**
 * Only the shape the service accepts goes upstream. The context object is
 * passed as given — the service validates every field of it with Pydantic and
 * treats all of it as data, never as instructions.
 */
function sanitize(body: unknown): { messages: Turn[]; lang: "mr" | "en"; context?: unknown } | null {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.messages)) return null;

  const messages: Turn[] = [];
  for (const raw of input.messages.slice(-MAX_TURNS)) {
    if (!raw || typeof raw !== "object") return null;
    const { role, content } = raw as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const text = content.trim().slice(0, MAX_CHARS);
    if (text) messages.push({ role, content: text });
  }
  if (!messages.length || messages[messages.length - 1].role !== "user") return null;

  const lang = input.lang === "en" ? "en" : "mr";
  const context =
    input.context && typeof input.context === "object" && !Array.isArray(input.context)
      ? input.context
      : undefined;
  return { messages, lang, ...(context ? { context } : {}) };
}

function upstreamMessage(body: unknown): Bi | undefined {
  const detail = (body as { detail?: { message?: unknown } } | null)?.detail;
  const message = detail?.message;
  if (message && typeof message === "object") {
    const m = message as Partial<Bi>;
    if (typeof m.mr === "string" && typeof m.en === "string") return { mr: m.mr, en: m.en };
  }
  return undefined;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad-request", 400);
  }
  const payload = sanitize(body);
  if (!payload) return fail("bad-request", 400);

  let upstream: Response;
  try {
    upstream = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: {
        ...((await authedServiceHeaders()) as Record<string, string>),
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      // A farmer who closes the panel stops paying for the rest of the answer.
      signal: request.signal,
    });
  } catch {
    return fail("offline", 503);
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.json().catch(() => null);
    if (upstream.status === 429) {
      const retry = upstream.headers.get("Retry-After");
      return fail("busy", 429, undefined, retry ? { "Retry-After": retry } : undefined);
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 });
    }
    if (upstream.status === 503) return fail("offline", 503, upstreamMessage(detail));
    if (upstream.status === 422) return fail("bad-request", 400);
    return fail("unknown", 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
