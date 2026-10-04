import { NextResponse } from "next/server";
import { authedServiceHeaders } from "@/lib/cardApi";
import type { ResearchStart } from "@/lib/research";

/**
 * Start the research agents for these topics now.
 *
 * The recommendation board calls this for the crops and fertilisers it shows,
 * and a detail page calls it when the farmer taps "get the latest" — so the
 * report is being written while they read, rather than waiting up to eight
 * hours for the next sweep. It returns at once; the page polls
 * `/api/insights/{category}/{slug}` until the report lands.
 *
 * Not public (see `middleware.ts`): every topic it starts costs four model
 * calls, so the caller must be signed in, and the service rate-limits by
 * account on top of that.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = (process.env.AGROSENSE_API_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const CATEGORIES = ["soil", "crop", "fertilizer"] as const;
type Category = (typeof CATEGORIES)[number];

/** Same caps the service enforces, applied before a request leaves. */
const CAP: Record<Category, number> = { soil: 2, crop: 5, fertilizer: 6 };

const SLUG = /^[a-z0-9-]{1,40}$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const raw = (body ?? {}) as Partial<Record<Category, unknown>>;
  const topics = Object.fromEntries(
    CATEGORIES.map((c) => [
      c,
      (Array.isArray(raw[c]) ? raw[c] : [])
        .filter((s): s is string => typeof s === "string" && SLUG.test(s))
        .slice(0, CAP[c]),
    ]),
  ) as Record<Category, string[]>;

  if (CATEGORIES.every((c) => topics[c].length === 0)) {
    return NextResponse.json({ error: "no-topics" }, { status: 400 });
  }

  try {
    const response = await fetch(`${BASE}/api/research`, {
      method: "POST",
      headers: { ...(await authedServiceHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify(topics),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (response.status === 429) {
      return NextResponse.json({ error: "limit" }, { status: 429 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: "unavailable" }, { status: 502 });
    }
    return NextResponse.json((await response.json()) as ResearchStart);
  } catch {
    return NextResponse.json({ error: "offline" }, { status: 503 });
  }
}
