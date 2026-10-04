/**
 * The running order.
 *
 * One registry, three consumers: the rail, the contents page, and the prev/next
 * pair at the foot of every chapter. They were three hand-maintained lists in
 * the first sketch and had already drifted from each other by the third chapter,
 * which is the whole argument for this file.
 *
 * Chapter files stay static and bespoke — twelve routes under a `[chapter]`
 * dynamic segment would collapse twelve different compositions into one switch
 * statement and lose per-route code splitting. This registry is the index to
 * them, not a router.
 */

export type Chapter = {
  /** Route. The contents page is `/examiner`; every chapter is a child of it. */
  href: string;
  /**
   * Printed beside the title and spoken aloud in the viva ("chapter five, the
   * soil model"). `null` for the two pages that are not chapters: the contents
   * and the ledger that cuts across all of them.
   */
  n: number | null;
  /** Rail label. Kept short enough not to wrap at the rail's fixed width. */
  short: string;
  title: string;
  /** One sentence, shown on the contents page and under the chapter title. */
  lede: string;
};

export const CHAPTERS: readonly Chapter[] = [
  {
    href: "/examiner",
    n: null,
    short: "Contents",
    title: "Contents and running order",
    lede: "Ten chapters, the running order, and where every number on them comes from.",
  },
  {
    href: "/examiner/system",
    n: 1,
    short: "System",
    title: "Four processes, one request",
    lede: "What each of the four services owns, and the path a farmer's request actually takes through them.",
  },
  {
    href: "/examiner/data",
    n: 2,
    short: "Data",
    title: "Where the data comes from",
    lede: "Six scrapers against government sources, what each one can tell you, and what it cannot.",
  },
  {
    href: "/examiner/reading",
    n: 3,
    short: "Reading",
    title: "Reading the Soil Health Card",
    lede: "A photograph of a printed card becomes twelve numbers — and the eight-pass search that made it reliable.",
  },
  {
    href: "/examiner/rag",
    n: 4,
    short: "RAG",
    title: "Retrieval: answering from the card",
    lede: "Chunking, embedding and retrieval — and why the embedding here is deliberately not a neural model.",
  },
  {
    href: "/examiner/soil-model",
    n: 5,
    short: "Soil model",
    title: "Classifying soil from a photograph",
    lede: "A leaking dataset rebuilt by scene, eight soils under grouped folds, and a promotion that could not be decided by a head-to-head.",
  },
  {
    href: "/examiner/tournaments",
    n: 6,
    short: "Tournaments",
    title: "Which model, and why that one",
    lede: "Four head-to-head comparisons, each decided on a stated protocol rather than on a single accuracy number.",
  },
  {
    href: "/examiner/engine",
    n: 7,
    short: "Engine",
    title: "The recommendation engine",
    lede: "Five datasets fused into one feature store, six stages, and the measurements that show what is real signal.",
  },
  {
    href: "/examiner/agents",
    n: 8,
    short: "Agents",
    title: "Four agents and their orchestration",
    lede: "Plan, research, write, review — and the source policy that is enforced in code rather than asked for in a prompt.",
  },
  {
    href: "/examiner/mcp",
    n: 9,
    short: "MCP",
    title: "MCP: how the agents reach the internet",
    lede: "Five tool servers, what each one is allowed to fetch, and where the agent is not permitted to talk its way past.",
  },
  {
    href: "/examiner/deployment",
    n: 10,
    short: "Deployment",
    title: "Deployment",
    lede: "Three topologies that all exist in this repository, what each costs, and the gaps between them.",
  },
  {
    href: "/examiner/decisions",
    n: null,
    short: "Decisions",
    title: "The decision ledger",
    lede: "Every engineering decision in one place: the question, what was measured, what was chosen, and what it cost.",
  },
] as const;

/** The contents page is not a chapter; it is the cover. */
export const CONTENTS = CHAPTERS[0];

export function chapterAt(href: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.href === href);
}

/**
 * Neighbours for the foot of a chapter. The contents page has no `prev` and the
 * ledger has no `next`, which is what makes the walkthrough feel finite — an
 * examiner should be able to see that they have reached the end.
 */
export function neighbours(href: string): {
  prev: Chapter | null;
  next: Chapter | null;
} {
  const i = CHAPTERS.findIndex((c) => c.href === href);
  if (i < 0) return { prev: null, next: null };
  return {
    prev: i > 0 ? CHAPTERS[i - 1] : null,
    next: i < CHAPTERS.length - 1 ? CHAPTERS[i + 1] : null,
  };
}

/**
 * Where the corner switch should land, given where you are in the product.
 *
 * A plain link to `/examiner` would be correct and useless: during a viva you
 * are standing on a screen and the question is "how does *this* work". Longest
 * prefix wins, so `/prediction/soil/black` finds the soil chapter before the
 * bare `/prediction` entry.
 */
const PRODUCT_TO_CHAPTER: ReadonlyArray<readonly [string, string]> = [
  ["/prediction/soil", "/examiner/soil-model"],
  ["/prediction/crop", "/examiner/engine"],
  ["/prediction/fertilizer", "/examiner/engine"],
  ["/prediction", "/examiner/engine"],
  ["/", "/examiner"],
];

export function examinerFor(pathname: string): string {
  const hit = PRODUCT_TO_CHAPTER.filter(([from]) =>
    from === "/" ? pathname === "/" : pathname.startsWith(from),
  ).sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1] : "/examiner";
}
