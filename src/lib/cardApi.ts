import "server-only";

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
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    return response.ok ? ((await response.json()) as ServiceHealth) : null;
  } catch {
    return null;
  }
}
