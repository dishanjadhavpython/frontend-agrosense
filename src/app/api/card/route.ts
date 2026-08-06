import { NextResponse } from "next/server";
import { CardError, readCard } from "@/lib/cardApi";
import type { CardErrorKind } from "@/lib/cardTypes";

/**
 * Where the card actually goes.
 *
 * The browser posts here; this posts to the Python reading service. One hop,
 * for three reasons: the reading service stays unreachable from the internet,
 * there is no CORS to configure, and every way a read can fail gets turned
 * into a sentence in the farmer's own language in exactly one place.
 *
 * Every message below exists in both languages because this page is Marathi
 * first (`<html lang="mr">`), and an error is the moment a person most needs
 * to be addressed in their own language rather than least.
 */

// Node, not edge: this proxies a multipart body and needs a real request agent.
export const runtime = "nodejs";
// A card upload is never cacheable and must never be prerendered.
export const dynamic = "force-dynamic";

/** Matches `MAX_BYTES` in CardUpload.tsx and `MAX_UPLOAD_BYTES` in config.py. */
const MAX_BYTES = 10 * 1024 * 1024;

const ACCEPTED = /\.(pdf|jpe?g|png|webp|tiff?|bmp)$/i;

type Message = { mr: string; en: string };

const MESSAGES: Record<CardErrorKind, Message> = {
  unsupported: {
    mr: "ही फाइल वाचता येत नाही. पत्रिकेची PDF, JPG किंवा PNG पाठवा.",
    en: "We can't read that file. Send the card as a PDF, JPG or PNG.",
  },
  unreadable: {
    mr: "या फोटोतून काहीच वाचता आलं नाही. पूर्ण पत्रिका चौकटीत येईल अशी, चांगल्या उजेडात, सरळ समोरून काढा.",
    en: "Nothing could be read from that photo. Retake it straight on, in good light, with the whole card in frame.",
  },
  "no-readings": {
    mr: "या कागदावर आकड्यांचा तक्ता सापडला नाही. माती आरोग्य पत्रिकेचं जे पान तक्ता असलेलं आहे तेच पाठवा.",
    en: "We couldn't find the readings table on this document. Send the page of the Soil Health Card that has the table on it.",
  },
  offline: {
    mr: "सध्या पत्रिका वाचण्याची सेवा बंद आहे. तुमची पत्रिका साठवली गेलेली नाही — थोड्या वेळाने पुन्हा पाठवा.",
    en: "The reading service is down right now. Your card was not stored — try again shortly.",
  },
  unknown: {
    mr: "पत्रिका वाचताना अडचण आली. पुन्हा प्रयत्न करा.",
    en: "Something went wrong reading the card. Please try again.",
  },
};

/** When the server has no OCR at all, "retake the photo" is useless advice. */
const NO_OCR: Message = {
  mr: "या सर्व्हरवर फोटोतून वाचण्याची सोय सध्या नाही. पत्रिकेची PDF पाठवा.",
  en: "This server can't read photographs yet. Send the PDF version of the card instead.",
};

const STATUS: Record<CardErrorKind, number> = {
  unsupported: 400,
  unreadable: 422,
  "no-readings": 422,
  offline: 503,
  unknown: 500,
};

function fail(kind: CardErrorKind, message: Message, detail?: string) {
  return NextResponse.json(
    { error: kind, message, detail },
    { status: STATUS[kind] },
  );
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("unsupported", MESSAGES.unsupported);
  }

  const card = form.get("card");
  if (!(card instanceof File) || card.size === 0) {
    return fail("unsupported", {
      mr: "पत्रिका मिळाली नाही. फाइल निवडून पुन्हा पाठवा.",
      en: "No card came through. Choose a file and send it again.",
    });
  }

  // Re-checked here even though CardUpload already enforces both: the browser
  // check is a courtesy to the farmer, this one is the actual rule.
  if (card.size > MAX_BYTES) {
    return fail("unsupported", {
      mr: "फाइल १० MB पेक्षा मोठी आहे. थोडी लहान करून पाठवा.",
      en: "That file is over 10 MB. Send a smaller one.",
    });
  }
  if (!ACCEPTED.test(card.name)) {
    return fail("unsupported", MESSAGES.unsupported);
  }

  try {
    const result = await readCard(card);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CardError) {
      const message =
        error.kind === "unreadable" && !error.ocrAvailable
          ? NO_OCR
          : MESSAGES[error.kind];
      return fail(error.kind, message, error.message);
    }
    return fail("unknown", MESSAGES.unknown);
  }
}
