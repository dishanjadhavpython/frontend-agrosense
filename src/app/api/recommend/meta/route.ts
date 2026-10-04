import { NextResponse } from "next/server";
import { getAtlas, getSeasons, getTalukas, RecommendError } from "@/lib/recommendApi";
import type { AtlasResponse, SeasonsResponse, TalukasResponse } from "@/lib/recommendTypes";

/**
 * Everything the location step needs to draw itself: the 351-taluka list
 * (for the combobox), the atlas (for the map), and the season vocabulary —
 * fetched once, server-side, so the client never learns the recommend
 * service's own base URL. Static in practice (the taluka universe does not
 * change between deploys), so it's safe to cache at the edge.
 */

export const revalidate = 3600;

export type RecommendMeta = {
  talukas: TalukasResponse;
  atlas: AtlasResponse;
  seasons: SeasonsResponse;
};

export async function GET() {
  try {
    const [talukas, atlas, seasons] = await Promise.all([
      getTalukas(),
      getAtlas(),
      getSeasons(),
    ]);
    return NextResponse.json<RecommendMeta>({ talukas, atlas, seasons });
  } catch (e) {
    const offline = e instanceof RecommendError && e.kind === "offline";
    return NextResponse.json(
      {
        error: "offline",
        message: {
          mr: "शिफारस देणारी सेवा सध्या बंद आहे.",
          en: "The recommendation service is down right now.",
        },
      },
      { status: offline ? 503 : 500 },
    );
  }
}
