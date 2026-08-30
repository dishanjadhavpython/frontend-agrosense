import { NextResponse } from "next/server";
import { serviceHeaders } from "@/lib/cardApi";
import type { InsightsResponse } from "@/lib/cardTypes";

/**
 * Current Indian information for one crop, soil or fertilizer.
 *
 * Reads whatever the research sweep last stored. Never triggers research —
 * that runs on the backend's own 8-hour cycle, and a detail page must render
 * in the time a file read takes, not the time four agents take.
 *
 * A failure here is not an error page. The detail pages carry real editorial
 * content of their own; this section is an addition, so when it cannot be
 * fetched the answer is "no insights right now" and the rest of the page
 * stands.
 */

export const runtime = "nodejs";
/**
 * Not cached, and that is a change.
 *
 * This used to hold for 1800s, matching the refresh interval — sound while a
 * report could only change on an eight-hour timer. Predict now starts research
 * for what it just predicted, so this endpoint carries a `researching` flag
 * that flips within seconds and a report that lands a minute later. A
 * half-hour cache would pin the page to "not researched yet" for the entire
 * time the answer was actually being written.
 *
 * The cost is small: upstream this is a JSON file read, not a model call.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE = (process.env.AGROSENSE_API_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const CATEGORIES = new Set(["crop", "soil", "fertilizer"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ category: string; slug: string }> },
) {
  const { category, slug } = await params;

  if (!CATEGORIES.has(category)) {
    return NextResponse.json({ available: false, reason: "Unknown category." }, { status: 404 });
  }

  try {
    const response = await fetch(
      `${BASE}/api/insights/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`,
      {
        headers: serviceHeaders(),
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { available: false, reason: "No information stored for this yet." },
        { status: response.status === 404 ? 404 : 200 },
      );
    }

    return NextResponse.json((await response.json()) as InsightsResponse);
  } catch {
    return NextResponse.json({
      available: false,
      reason: "The information service is not reachable right now.",
    });
  }
}
