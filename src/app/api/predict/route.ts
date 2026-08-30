import { NextResponse } from "next/server";
import { authedServiceHeaders } from "@/lib/cardApi";
import type { PredictionResult } from "@/lib/cardTypes";

/**
 * Soil, crops and fertilizer for a card that has already been read.
 *
 * Same shape as `/api/card`: the browser posts here, this posts to the Python
 * service, and every failure becomes a sentence in the farmer's own language in
 * one place. The reading service stays unreachable from the internet.
 *
 * Nothing here is optional and nothing here has a default. Nine inputs go to
 * the models — four readings the farmer confirmed off their card, four field
 * conditions they typed, and the soil photograph — and a request missing any of
 * them is refused here rather than completed by the server.
 *
 * The previous version of this file forwarded four weather values "if present",
 * and they were never present: `CardUpload` posted only the document id, so
 * every prediction the product ever made ran on `26°C / 68% / 110mm / 34%`
 * hardcoded in `backend/app.py`. A skipped empty value is how a blank becomes
 * an invented number, so blanks are now errors.
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
  "missing-inputs": {
    mr: "अंदाज काढण्यासाठी सगळे आकडे भरा — पत्रिकेवरचे चार आणि शेतातले चार.",
    en: "Fill in every figure before predicting — the four off your card and the four for your field.",
  },
  "bad-figure": {
    mr: "यातला एखादा आकडा तपासा — दशांश चिन्ह चुकलं असावं.",
    en: "One of those figures looks wrong — check for a misplaced decimal point.",
  },
  "no-soil-photo": {
    mr: "मातीचा फोटो द्या. फोटोशिवाय मातीचा प्रकार ओळखता येत नाही, आणि तो ओळखल्याशिवाय खत सुचवणं म्हणजे अंदाज बांधणं.",
    en: "Add a photo of the soil. Without it the soil type cannot be identified, and recommending fertilizer for an unidentified soil is guesswork.",
  },
  "too-many": {
    mr: "आजची मर्यादा संपली. एका दिवसात ठरावीक वेळाच अंदाज काढता येतो — उद्या पुन्हा प्रयत्न करा.",
    en: "You have used today's predictions. There is a daily limit on each account — try again tomorrow.",
  },
  unknown: {
    mr: "अंदाज काढताना अडचण आली. पुन्हा प्रयत्न करा.",
    en: "Something went wrong making the prediction. Please try again.",
  },
};

/**
 * Every value the models need, and the bounds a typo has to clear.
 *
 * These are plausibility limits, not expectations: they exist to catch a
 * misplaced decimal point, never to nudge an input towards a likely value. A
 * pH of 3.6 is unusual and allowed; a pH of 36 is a typing mistake.
 */
const REQUIRED = {
  nitrogen: { min: 0, max: 2000 },
  phosphorus: { min: 0, max: 500 },
  potassium: { min: 0, max: 2000 },
  ph: { min: 2, max: 12 },
  temperature: { min: -10, max: 60 },
  humidity: { min: 0, max: 100 },
  rainfall: { min: 0, max: 5000 },
  moisture: { min: 0, max: 100 },
} as const;

const STATUS: Record<string, number> = {
  "no-document": 400,
  "no-readings": 422,
  "missing-inputs": 400,
  "bad-figure": 400,
  "no-soil-photo": 400,
  "too-many": 429,
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

  // All eight, all required. A missing or unparseable one stops here — it must
  // never reach a service that would fill it in.
  for (const [key, bounds] of Object.entries(REQUIRED)) {
    const raw = form.get(key);
    // Blank and implausible are different mistakes and get different advice:
    // one is a box nobody filled, the other is a decimal point in the wrong
    // place. Neither is ever completed on the farmer's behalf.
    if (typeof raw !== "string" || raw.trim() === "") return fail("missing-inputs");
    const value = Number(raw);
    if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) {
      return fail("bad-figure");
    }
    outgoing.append(key, String(value));
  }

  const soil = form.get("soil");
  if (!(soil instanceof File) || soil.size === 0) return fail("no-soil-photo");
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

  let response: Response;
  try {
    response = await fetch(`${BASE}/api/predict`, {
      method: "POST",
      body: outgoing,
      headers: await authedServiceHeaders(),
      // A cold torch load plus a CNN forward pass is seconds, not milliseconds.
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return fail("offline");
  }

  if (!response.ok) {
    if (response.status === 404) return fail("no-document");
    if (response.status === 503) return fail("unavailable");
    // The daily ceiling. Its own message because "try again" is wrong advice
    // here — the answer is tomorrow, and a farmer should be told that rather
    // than left retrying a button that cannot work.
    if (response.status === 429) return fail("too-many");
    if (response.status === 422) {
      // The service names the field when an input did not arrive, which is a
      // different failure from a card nothing could be read off.
      const body = await response.json().catch(() => null);
      const detail = (body as { detail?: { field?: string } } | null)?.detail;
      return fail(detail?.field ? "missing-inputs" : "no-readings");
    }
    return fail("unknown");
  }

  return NextResponse.json((await response.json()) as PredictionResult);
}
