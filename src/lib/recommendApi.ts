import "server-only";

import { authedServiceHeaders } from "./cardApi";
import type {
  AtlasResponse,
  Recommendation,
  RecommendErrorKind,
  RecommendRequest,
  SeasonsResponse,
  TalukasResponse,
} from "./recommendTypes";

/**
 * The one place that talks to the recommend service.
 *
 * `server-only` for the same reason `cardApi.ts` is: the engine has no
 * authentication or CORS headers of its own and is reachable only from the
 * Next server. A second process, a second base URL, a second env var — see
 * the plan's "run it as its own microservice" decision.
 */

const BASE = (process.env.RECOMMEND_API_BASE ?? "http://127.0.0.1:8001").replace(/\/$/, "");

export class RecommendError extends Error {
  constructor(readonly kind: RecommendErrorKind, message: string) {
    super(message);
    this.name = "RecommendError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(await authedServiceHeaders()), ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new RecommendError("offline", "The recommendation service is not responding.");
  }
  if (!response.ok) {
    if (response.status === 404) {
      throw new RecommendError(
        "unsupported-taluka",
        "That district/taluka is not one of the 351 the engine covers.",
      );
    }
    if (response.status === 400) {
      throw new RecommendError("bad-season", "That season is not one the engine recognises.");
    }
    throw new RecommendError("unknown", `The recommendation service returned ${response.status}.`);
  }
  return (await response.json()) as T;
}

export const getTalukas = (district?: string): Promise<TalukasResponse> =>
  call(`/talukas${district ? `?district=${encodeURIComponent(district)}` : ""}`);

export const getSeasons = (): Promise<SeasonsResponse> => call("/seasons");

export const getAtlas = (): Promise<AtlasResponse> => call("/atlas");

export async function recommend(request: RecommendRequest): Promise<Recommendation> {
  return call<Recommendation>("/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}
