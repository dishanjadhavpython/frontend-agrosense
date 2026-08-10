import { NextResponse } from "next/server";
import { serviceHeaders } from "@/lib/cardApi";
import type { PredictionResult } from "@/lib/cardTypes";

/**
 * Soil, crops and fertilizer for a card that has already been read.
 *
 * Same shape as `/api/card`: the browser posts here, this posts to the Python
 * service, and every failure becomes a sentence in the farmer's own language in
 * one place. The reading service stays unreachable from the internet.
 *
 * The soil photograph is optional by design. A farmer who sent only a Soil
 * Health Card still gets a crop ranking from the nutrients, and the response
 * says `soil_applied: false` so the UI can be honest about which answer it is
 * showing rather than implying a soil-aware result it did not get.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const BASE = (process.env.AGROSENSE_API_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "");

type Message = { mr: string; en: string };

const MESSAGES: Record<string, Message> = {
  "no-document": {
    mr: "आधी माती आरोग्य पत्रिका द्या. तिच्यावरच्या आकड्यांशिवाय अंदाज काढता येत नाही.",
    en: "Send a Soil Health Card first — there is nothing to predict from without its readings.",
  },
  "no-readings": {
    mr: "या पत्रिकेतून आकडे वाचता आले नाहीत, त्यामुळे अंदाज काढता येत नाही.",
    en: "No readings came off that card, so there is nothing to predict from.",
  },
  unavailable: {
    mr: "अंदाज काढणारी मॉडेल सध्या उपलब्ध नाहीत. थोड्या वेळाने पुन्हा प्रयत्न करा.",
    en: "The prediction models aren't loaded on the server yet. Try again shortly.",
  },
  offline: {
    mr: "सध्या सेवा बंद आहे. थोड्या वेळाने पुन्हा प्रयत्न करा.",
    en: "The service is down right now. Try again shortly.",
  },
  unknown: {
    mr: "अंदाज काढताना अडचण आली. पुन्हा प्रयत्न करा.",
    en: "Something went wrong making the prediction. Please try again.",
  },
};

const STATUS: Record<string, number> = {
  "no-document": 400,
  "no-readings": 422,
  unavailable: 503,
  offline: 503,
  unknown: 500,
};

function fail(kind: keyof typeof MESSAGES) {
  return NextResponse.json(
    { error: kind, message: MESSAGES[kind] },
    { status: STATUS[kind] ?? 500 },
  );
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("no-document");
  }

  const documentId = form.get("documentId");
  if (typeof documentId !== "string" || !documentId) {
    return fail("no-document");
  }

  const outgoing = new FormData();
  outgoing.append("document_id", documentId);

  // The weather panel already fetches real values for this location; passing
  // them through means the crop model sees today's field, not a default.
  for (const key of ["temperature", "humidity", "rainfall", "moisture"]) {
    const value = form.get(key);
    if (typeof value === "string" && value !== "") outgoing.append(key, value);
  }

  const soil = form.get("soil");
  if (soil instanceof File && soil.size > 0) {
    if (soil.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          error: "unsupported",
          message: {
            mr: "मातीचा फोटो १० MB पेक्षा मोठा आहे.",
            en: "That soil photo is over 10 MB.",
          },
        },
        { status: 400 },
      );
    }
    outgoing.append("soil_image", soil, soil.name);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}/api/predict`, {
      method: "POST",
      body: outgoing,
      headers: serviceHeaders(),
      // A cold torch load plus a CNN forward pass is seconds, not milliseconds.
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return fail("offline");
  }

  if (!response.ok) {
    if (response.status === 404) return fail("no-document");
    if (response.status === 422) return fail("no-readings");
    if (response.status === 503) return fail("unavailable");
    return fail("unknown");
  }

  return NextResponse.json((await response.json()) as PredictionResult);
}
