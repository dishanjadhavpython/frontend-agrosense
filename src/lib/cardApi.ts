import "server-only";

import { auth } from "@clerk/nextjs/server";
import type { CardErrorKind, CardReadResult } from "./cardTypes";

/**
 * The one place that talks to the reading service.
 *
 * `server-only` is load-bearing. The reading service has no authentication and
 * no CORS headers by design — it is reachable from the Next server and nowhere
 * else — so importing this into a client component has to fail at build time
 * rather than ship a browser bundle pointing at an open Python process.
 */

const BASE = (process.env.AGROSENSE_API_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "");

/**
 * Proves to the reading service that this request came from the Next server.
 *
 * Only meaningful once the service is hosted rather than on localhost — see
 * `API_KEY` in `backend/config.py`. Unset on both sides is the local default
 * and stays working; set on one side only is the misconfiguration that shows
 * up as every card read returning "the service is down".
 */
export const serviceHeaders = (): HeadersInit =>
  process.env.AGROSENSE_API_KEY
    ? { "X-AgroSense-Key": process.env.AGROSENSE_API_KEY }
    : {};

/**
 * The shared secret *and* the farmer's identity.
 *
 * Two headers answering two different questions, and neither substitutes for
 * the other. `X-AgroSense-Key` proves the call came from our own Next server
 * rather than from the internet. The Clerk bearer token proves *which* farmer
 * is asking, which is what makes a stored Soil Health Card belong to somebody
 * — before it existed, `/api/documents` returned every card the service had.
 *
 * `getToken()` returns null when nobody is signed in. That is not treated as
 * an error here: the middleware has already refused the request by then, and
 * the Python service refuses it again. Two layers, and this is neither of
 * them.
 */
export async function authedServiceHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { ...(serviceHeaders() as Record<string, string>) };
  try {
    const token = await (await auth()).getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Outside a request scope, or Clerk unconfigured. The call proceeds
    // unauthenticated and the service decides.
  }
  return headers;
}

export class CardError extends Error {
  constructor(
    readonly kind: CardErrorKind,
    message: string,
    /** False when the server has no OCR at all, which changes the advice from
     *  "retake the photo" to "send the PDF instead". */
    readonly ocrAvailable = true,
  ) {
    super(message);
    this.name = "CardError";
  }
}

function detailOf(body: unknown): { message: string; ocrAvailable: boolean } {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return { message: detail, ocrAvailable: true };
  if (detail && typeof detail === "object") {
    const record = detail as { message?: string; ocr_available?: boolean };
    return {
      message: record.message ?? "That card could not be read.",
      ocrAvailable: record.ocr_available ?? true,
    };
  }
  return { message: "That card could not be read.", ocrAvailable: true };
}

export async function readCard(file: File): Promise<CardReadResult> {
  const body = new FormData();
  body.append("file", file, file.name);

  let response: Response;
  try {
    response = await fetch(`${BASE}/api/ingest`, {
      method: "POST",
      body,
      headers: await authedServiceHeaders(),
      // A photograph goes through OCR, which is measured in seconds, not
      // milliseconds. Still bounded — a hung request must not hold the
      // farmer's page open indefinitely.
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new CardError(
      "offline",
      "The reading service is not responding. The card was not stored.",
    );
  }

  if (!response.ok) {
    const { message, ocrAvailable } = detailOf(await response.json().catch(() => null));
    if (response.status === 400) throw new CardError("unsupported", message);
    if (response.status === 422) throw new CardError("unreadable", message, ocrAvailable);
    // The account's daily ceiling. Distinct from every other failure here
    // because it is the only one where retrying now cannot help.
    if (response.status === 429) throw new CardError("too-many", message);
    throw new CardError("unknown", message);
  }

  const result = (await response.json()) as CardReadResult;

  // The service answers 200 for a document it read but found no soil table in
  // — a rent receipt, or the wrong page of the card. That is a failure from
  // the farmer's point of view, so it is one here too.
  if (result.metric_count === 0) {
    throw new CardError("no-readings", "No readings table was found in this document.");
  }

  return result;
}

export type ServiceHealth = {
  status: string;
  ocr_available: boolean;
  heic_supported: boolean;
  accepts: string[];
  max_upload_bytes: number;
};

export async function serviceHealth(): Promise<ServiceHealth | null> {
  try {
    const response = await fetch(`${BASE}/api/health`, {
      headers: serviceHeaders(),
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    return response.ok ? ((await response.json()) as ServiceHealth) : null;
  } catch {
    return null;
  }
}
