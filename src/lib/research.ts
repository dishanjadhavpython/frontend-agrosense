/**
 * Asking the research agents for a topic now — the client half of
 * `POST /api/research`.
 *
 * Used from two places: the recommendation board asks for the crops and
 * fertilisers it shows the moment it renders, and a detail page asks for its
 * own topic when the farmer taps "get the latest". Both then read the report
 * through `/api/insights`, which is where "researching" and "ready" show up.
 */

export type ResearchTopics = Partial<Record<"soil" | "crop" | "fertilizer", string[]>>;

export type ResearchStart = {
  started: string[];
  skipped: string[];
  enabled?: boolean;
  reason?: string;
};

export type ResearchOutcome =
  | { ok: true; result: ResearchStart }
  | { ok: false; error: "signed-out" | "limit" | "offline" | "unavailable" };

export async function requestResearch(topics: ResearchTopics): Promise<ResearchOutcome> {
  try {
    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(topics),
    });
    if (response.status === 401) return { ok: false, error: "signed-out" };
    if (response.status === 429) return { ok: false, error: "limit" };
    if (!response.ok) return { ok: false, error: "unavailable" };
    return { ok: true, result: (await response.json()) as ResearchStart };
  } catch {
    return { ok: false, error: "offline" };
  }
}
