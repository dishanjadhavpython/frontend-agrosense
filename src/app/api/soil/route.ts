import { NextResponse } from "next/server";
import { authedServiceHeaders } from "@/lib/cardApi";
import type { SoilReadResult } from "@/lib/soilTypes";

/**
 * What a photograph of the ground says the soil is.
 *
 * Same three-layer shape as `/api/card` and `/api/predict`: the browser posts
 * here, this posts to the Python reading service, and every failure becomes a
 * sentence in the farmer's own language in one place.
 *
 * This asks for one thing — the photograph — where `/api/predict` asked for
 * nine. The four field conditions it required (temperature, humidity,
 * rainfall, soil moisture) are the four the recommendation engine now derives
 * from the taluka's own climatology, and the four card readings mattered only
 * to the fertilizer head the engine has replaced. Asking a farmer to type a
 * number they cannot measure, so a model can rank a crop that a better model
 * now ranks without it, is a question with no purpose left.
 *
 * The answer is a soil class, and it stays a soil class. It is checked against
 * the taluka's surveyed soil type in the UI, never merged into it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const BASE = (process.env.AGROSENSE_API_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "");

type Message = { mr: string; en: string };

const MESSAGES: Record<string, Message> = {
  "no-image": {
    mr: "मातीचा फोटो द्या. फोटोशिवाय जमिनीचा प्रकार ओळखता येत नाही.",
    en: "Send a photo of the soil — the ground cannot be named without one.",
  },
  "too-large": {
    mr: "फोटो खूप मोठा आहे. १० MB पेक्षा लहान फोटो पाठवा.",
    en: "That photo is too large. Send one under 10 MB.",
  },
  unreadable: {
    mr: "हा फोटो वाचता आला नाही. उजेडात, जमिनीच्या जवळून पुन्हा काढा.",
    en: "That photo could not be read. Retake it in daylight, close to the ground.",
  },
  unavailable: {
    mr: "माती ओळखणारं मॉडेल सध्या उपलब्ध नाही. थोड्या वेळाने पुन्हा प्रयत्न करा.",
    en: "The soil model is not loaded right now. Try again shortly.",
  },
  limit: {
    mr: "आजची मर्यादा संपली आहे. उद्या पुन्हा प्रयत्न करा.",
    en: "You have used today's allowance. Try again tomorrow.",
  },
  offline: {
    mr: "सेवा सध्या बंद आहे. थोड्या वेळाने पुन्हा प्रयत्न करा.",
    en: "The service is down right now. Try again shortly.",
  },
  unknown: {
    mr: "माती ओळखताना अडचण आली. पुन्हा प्रयत्न करा.",
    en: "Something went wrong naming the soil. Please try again.",
  },
};

const STATUS: Record<string, number> = {
  "no-image": 400,
  "too-large": 413,
  unreadable: 422,
  unavailable: 503,
  limit: 429,
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
    return fail("no-image");
  }

  const image = form.get("soil");
  if (!(image instanceof File) || image.size === 0) return fail("no-image");
  if (image.size > MAX_IMAGE_BYTES) return fail("too-large");

  const body = new FormData();
  body.append("soil_image", image, image.name || "soil.jpg");

  let response: Response;
  try {
    response = await fetch(`${BASE}/api/soil`, {
      method: "POST",
      headers: await authedServiceHeaders(),
      body,
      // A CNN forward pass is measured in seconds on a shared CPU, not
      // milliseconds — but it must still not hold the page open forever.
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return fail("offline");
  }

  if (!response.ok) {
    if (response.status === 429) return fail("limit");
    if (response.status === 503) return fail("unavailable");
    if (response.status === 422) return fail("unreadable");
    return fail("unknown");
  }

  return NextResponse.json<SoilReadResult>(await response.json());
}
