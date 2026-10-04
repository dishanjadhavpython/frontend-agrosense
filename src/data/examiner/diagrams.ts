import type { FlowEdge, FlowNode } from "@/components/examiner/viz/Flow";

/**
 * Architecture diagrams as data.
 *
 * Kept out of the page files so that a diagram is a diff of a few integers when
 * the architecture changes, rather than a hunt through JSX. One `<Flow>` renders
 * all of them.
 */
export type FlowSpec = {
  cols: number;
  rows: number;
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  /** Reading order for the stacked and screen-reader renderings. */
  order: readonly string[];
};

/** Chapter 1: the four processes, and what may talk to what. */
export const SYSTEM_TOPOLOGY: FlowSpec = {
  cols: 3,
  rows: 5,
  nodes: [
    {
      id: "browser",
      col: 2,
      row: 1,
      kind: "external",
      tone: "slate",
      label: "The farmer's browser",
      sub: "Next 16",
      meta: ["Marathi and English"],
    },
    {
      id: "middleware",
      col: 2,
      row: 2,
      tone: "blue",
      label: "Clerk middleware",
      sub: "middleware.ts",
      meta: ["Public by exception", "Strict CSP"],
    },
    {
      id: "routes",
      col: 2,
      row: 3,
      tone: "gold",
      label: "Next route handlers",
      sub: "6 endpoints",
      meta: ["Adds the key + session"],
    },
    {
      id: "reading",
      col: 1,
      row: 4,
      tone: "blue",
      label: "Reading service",
      sub: "FastAPI :8000",
      meta: ["OCR · RAG · 4 agents"],
    },
    {
      id: "engine",
      col: 3,
      row: 4,
      tone: "blue",
      label: "Regur engine",
      sub: "FastAPI :8001",
      meta: ["Ranks crops, doses NPK"],
    },
    {
      id: "store",
      col: 1,
      row: 5,
      kind: "store",
      tone: "green",
      label: "Uploads and the index",
      sub: "backend/data/",
      meta: ["Owned per farmer"],
    },
    {
      id: "features",
      col: 3,
      row: 5,
      kind: "store",
      tone: "green",
      label: "Feature store",
      sub: "351 × 311",
      meta: ["Built offline"],
    },
  ],
  edges: [
    { from: "browser", to: "middleware", fromSide: "b", toSide: "t" },
    { from: "middleware", to: "routes", fromSide: "b", toSide: "t" },
    // Offset, or the two branches share one horizontal run through the gutter
    // and the pair reads as a single line with an arrowhead at each end.
    {
      from: "routes",
      to: "reading",
      fromSide: "b",
      toSide: "t",
      offset: -0.28,
    },
    { from: "routes", to: "engine", fromSide: "b", toSide: "t", offset: 0.28 },
    { from: "reading", to: "store", fromSide: "b", toSide: "t" },
    { from: "engine", to: "features", fromSide: "b", toSide: "t" },
  ],
  order: [
    "browser",
    "middleware",
    "routes",
    "reading",
    "engine",
    "store",
    "features",
  ],
};

/** Chapter 8: the four agents, and the one code step between two of them. */
export const AGENT_PIPELINE: FlowSpec = {
  cols: 3,
  rows: 5,
  nodes: [
    {
      id: "trigger",
      col: 2,
      row: 1,
      kind: "external",
      tone: "slate",
      label: "A prediction names a crop",
      sub: "or the 30-minute sweep",
    },
    {
      id: "planner",
      col: 2,
      row: 2,
      tone: "blue",
      label: "Planner",
      sub: "1 call for the whole batch",
      meta: ["Sets each topic's focus"],
    },
    {
      id: "research",
      col: 2,
      row: 3,
      tone: "gold",
      label: "Research",
      sub: "max 30 turns",
      meta: ["The only agent with tools"],
    },
    {
      id: "creator",
      col: 1,
      row: 4,
      tone: "blue",
      label: "Creator",
      sub: "writes the report",
    },
    {
      id: "strip",
      col: 3,
      row: 4,
      kind: "note",
      tone: "clay",
      label: "strip_unsourced_claims()",
      sub: "code, not a prompt",
      meta: ["Deletes what it cannot cite"],
    },
    {
      id: "reviewer",
      col: 2,
      row: 5,
      tone: "green",
      label: "Reviewer",
      sub: "approves or returns it",
      meta: ["Exactly one revision"],
    },
  ],
  edges: [
    { from: "trigger", to: "planner", fromSide: "b", toSide: "t" },
    { from: "planner", to: "research", fromSide: "b", toSide: "t" },
    { from: "research", to: "creator", fromSide: "b", toSide: "t" },
    {
      from: "creator",
      to: "strip",
      fromSide: "r",
      toSide: "l",
      kind: "control",
    },
    {
      from: "strip",
      to: "reviewer",
      fromSide: "b",
      toSide: "t",
      kind: "control",
    },
    {
      from: "reviewer",
      to: "creator",
      fromSide: "l",
      toSide: "b",
      kind: "retry",
      label: "one retry",
    },
  ],
  order: ["trigger", "planner", "research", "creator", "strip", "reviewer"],
};

/**
 * Chapter 9: the Research agent's five tool servers.
 *
 * One column of servers rather than a block of them. Laid out two-wide, the
 * edge from the agent to the far column runs straight through whatever sits in
 * the near one — `Flow` routes an orthogonal elbow and does not know a node is
 * in the way — and the arrowhead then reads as if the near server were calling
 * the far one.
 */
export const MCP_FANOUT: FlowSpec = {
  cols: 3,
  rows: 5,
  nodes: [
    {
      id: "agent",
      // Row 3 of 5 and one row tall, not rows 2-4 spanned. Spanned, the box was
      // three times the height of its own text and the fan left from the middle
      // of a mostly empty rectangle.
      col: 1,
      row: 3,
      tone: "gold",
      label: "Research agent",
      sub: "OpenAI Agents SDK",
      meta: ["All five, or none", "Hard stop at 30 calls"],
    },
    {
      id: "search",
      col: 3,
      row: 1,
      tone: "blue",
      label: "web_search",
      sub: "ddgs",
      meta: ["10 results"],
    },
    {
      id: "fetch",
      col: 3,
      row: 2,
      tone: "blue",
      label: "fetch_url",
      sub: "httpx + lxml",
      meta: ["6,000 chars"],
    },
    {
      id: "youtube",
      col: 3,
      row: 3,
      tone: "slate",
      label: "search_youtube",
      sub: "YouTube Data v3",
      meta: ["safeSearch strict"],
    },
    {
      id: "mandi",
      col: 3,
      row: 4,
      tone: "green",
      label: "mandi_prices",
      sub: "data.gov.in",
      meta: ["Rs/quintal, by market"],
    },
    {
      id: "sellers",
      col: 3,
      row: 5,
      tone: "clay",
      label: "buy_links",
      sub: "7-domain allowlist",
      meta: ["Fetched and verified"],
    },
  ],
  edges: [
    { from: "agent", to: "search", fromSide: "r", toSide: "l" },
    { from: "agent", to: "fetch", fromSide: "r", toSide: "l" },
    { from: "agent", to: "youtube", fromSide: "r", toSide: "l" },
    { from: "agent", to: "mandi", fromSide: "r", toSide: "l" },
    { from: "agent", to: "sellers", fromSide: "r", toSide: "l" },
  ],
  order: ["agent", "search", "fetch", "youtube", "mandi", "sellers"],
};

/** Chapter 10: the AWS topology, the largest of the three that exist. */
export const AWS_TOPOLOGY: FlowSpec = {
  cols: 3,
  rows: 4,
  nodes: [
    {
      id: "cf",
      col: 2,
      row: 1,
      tone: "blue",
      label: "CloudFront + WAF",
      sub: "PriceClass_200",
      meta: ["3 origins, 3 behaviours"],
    },
    {
      id: "s3",
      col: 1,
      row: 2,
      kind: "store",
      tone: "green",
      label: "S3 static assets",
      sub: "/_next/static/*",
    },
    {
      id: "lambda",
      col: 2,
      row: 2,
      tone: "blue",
      label: "Next on Lambda",
      sub: "OpenNext",
    },
    {
      id: "alb",
      col: 3,
      row: 2,
      tone: "blue",
      label: "ALB",
      sub: "/api/py/*",
      meta: ["CloudFront prefix list only"],
    },
    {
      id: "fargate",
      col: 3,
      row: 3,
      tone: "gold",
      label: "Fargate ARM64",
      sub: "torch + tesseract",
      meta: ["desired_count 1"],
    },
    {
      id: "agents",
      col: 1,
      row: 3,
      tone: "green",
      label: "Agents on Lambda",
      sub: "EventBridge, 30 min",
      meta: ["No torch in the image"],
    },
    {
      id: "data",
      col: 2,
      row: 4,
      colSpan: 2,
      kind: "store",
      tone: "green",
      label: "S3 · DynamoDB · Secrets Manager",
      meta: ["Provisioned, not all read yet"],
    },
    {
      id: "obs",
      col: 1,
      row: 4,
      kind: "note",
      tone: "slate",
      label: "SNS alarms + budget",
      sub: "~$50/mo",
    },
  ],
  edges: [
    { from: "cf", to: "s3", fromSide: "b", toSide: "t" },
    { from: "cf", to: "lambda", fromSide: "b", toSide: "t" },
    { from: "cf", to: "alb", fromSide: "b", toSide: "t" },
    { from: "alb", to: "fargate", fromSide: "b", toSide: "t" },
    {
      from: "fargate",
      to: "data",
      fromSide: "b",
      toSide: "t",
      kind: "offline",
      offset: 0.3,
    },
    {
      from: "agents",
      to: "data",
      fromSide: "b",
      toSide: "t",
      kind: "offline",
      offset: -0.3,
    },
  ],
  order: ["cf", "s3", "lambda", "alb", "fargate", "agents", "data", "obs"],
};

/**
 * Chapter 1: the trust boundary, and the two headers that cross it.
 *
 * Separate from SYSTEM_TOPOLOGY on purpose. That one answers "what is running";
 * this one answers "what proves a request is allowed", which is a different
 * question with a different set of boxes, and drawing both on one grid produced
 * a picture that answered neither.
 */
export const REQUEST_TRACE: FlowSpec = {
  cols: 4,
  rows: 3,
  nodes: [
    {
      id: "browser",
      col: 1,
      row: 2,
      kind: "external",
      tone: "slate",
      label: "The farmer's browser",
      meta: ["Holds a Clerk session", "Holds no key"],
    },
    {
      id: "handler",
      col: 2,
      row: 2,
      tone: "gold",
      label: "Next route handler",
      sub: "server-only",
      meta: ["The only holder of the key"],
    },
    {
      id: "reading",
      col: 3,
      row: 1,
      tone: "blue",
      label: "Reading service",
      sub: ":8000",
      meta: ["Checks both headers"],
    },
    {
      id: "engine",
      col: 3,
      row: 3,
      tone: "blue",
      label: "Regur engine",
      sub: ":8001",
      meta: ["Needs no identity"],
    },
    {
      id: "closed",
      col: 4,
      row: 1,
      rowSpan: 3,
      kind: "note",
      label: "Neither is reachable from the internet",
      meta: ["No CORS config exists in the backend"],
    },
  ],
  edges: [
    { from: "browser", to: "handler", fromSide: "r", toSide: "l" },
    {
      from: "handler",
      to: "reading",
      fromSide: "r",
      toSide: "l",
      label: "key + bearer",
    },
    {
      from: "handler",
      to: "engine",
      fromSide: "r",
      toSide: "l",
      label: "key",
    },
  ],
  order: ["browser", "handler", "reading", "engine", "closed"],
};

/** Chapter 2: from a government portal to a column in the feature store. */
export const SCRAPE_PATH: FlowSpec = {
  cols: 5,
  rows: 2,
  nodes: [
    {
      id: "portal",
      col: 1,
      row: 1,
      kind: "external",
      tone: "slate",
      label: "Government portal",
      sub: "GraphQL or REST",
      meta: ["Six of them"],
    },
    {
      id: "scraper",
      col: 2,
      row: 1,
      tone: "blue",
      label: "Scraper script",
      sub: "run by hand",
      meta: ["Never on a schedule"],
    },
    {
      id: "raw",
      col: 3,
      row: 1,
      kind: "store",
      tone: "green",
      label: "CSV on disk",
      sub: "scrape data imp/output/",
    },
    {
      id: "ingest",
      col: 4,
      row: 1,
      tone: "gold",
      label: "ingest_weather.py",
      sub: "five checks",
      meta: ["Refuses, never repairs"],
    },
    {
      id: "store",
      col: 5,
      row: 1,
      kind: "store",
      tone: "green",
      label: "Feature store",
      sub: "351 × 311",
    },
    {
      id: "rejected",
      col: 3,
      row: 2,
      colSpan: 3,
      kind: "note",
      tone: "clay",
      label: "data/raw/_rejected/",
      meta: ["Quarantined with a README, not deleted"],
    },
  ],
  edges: [
    { from: "portal", to: "scraper", fromSide: "r", toSide: "l" },
    { from: "scraper", to: "raw", fromSide: "r", toSide: "l" },
    { from: "raw", to: "ingest", fromSide: "r", toSide: "l" },
    { from: "ingest", to: "store", fromSide: "r", toSide: "l" },
    {
      from: "ingest",
      to: "rejected",
      fromSide: "b",
      toSide: "t",
      kind: "veto",
      label: "fails",
    },
  ],
  order: ["portal", "scraper", "raw", "ingest", "store", "rejected"],
};

/** Chapter 4: a question about a card, and the check that comes first. */
export const RAG_PATH: FlowSpec = {
  cols: 4,
  rows: 3,
  nodes: [
    {
      id: "question",
      col: 1,
      row: 2,
      kind: "external",
      tone: "slate",
      label: "A question",
      sub: "Marathi or English",
    },
    {
      id: "owner",
      col: 2,
      row: 2,
      tone: "clay",
      label: "Ownership check",
      sub: "before any retrieval",
      meta: ["Document id vs the caller"],
    },
    {
      id: "retrieve",
      col: 3,
      row: 2,
      tone: "blue",
      label: "Top-k chunks",
      sub: "one matrix multiply",
      meta: ["Cosine, L2-normalised"],
    },
    {
      id: "answer",
      col: 4,
      row: 2,
      tone: "gold",
      label: "Answer with citations",
      sub: "llama3.2:3b, local",
      meta: ["Document, page, score"],
    },
    {
      id: "notfound",
      col: 2,
      row: 3,
      kind: "note",
      tone: "clay",
      label: "404, not 403",
      meta: ["A 403 confirms the document exists"],
    },
    {
      id: "extractive",
      col: 4,
      row: 1,
      kind: "note",
      label: "Extractive fallback",
      meta: ["A real sentence, never an error"],
    },
  ],
  edges: [
    { from: "question", to: "owner", fromSide: "r", toSide: "l" },
    { from: "owner", to: "retrieve", fromSide: "r", toSide: "l" },
    {
      from: "owner",
      to: "notfound",
      fromSide: "b",
      toSide: "t",
      kind: "veto",
      label: "it does not",
    },
    { from: "retrieve", to: "answer", fromSide: "r", toSide: "l" },
    {
      from: "extractive",
      to: "answer",
      fromSide: "b",
      toSide: "t",
      kind: "control",
      label: "no model",
    },
  ],
  order: ["question", "owner", "retrieve", "answer", "extractive", "notfound"],
};

/** Chapter 7: the sentence the engine uses to describe itself, as a picture. */
export const ENGINE_VETO: FlowSpec = {
  cols: 3,
  rows: 4,
  nodes: [
    {
      id: "features",
      col: 2,
      row: 1,
      kind: "store",
      tone: "green",
      label: "Feature store",
      sub: "S0 · 351 × 311",
      meta: ["Five datasets fused"],
    },
    {
      id: "ranker",
      col: 1,
      row: 2,
      tone: "blue",
      label: "LambdaMART ranker",
      sub: "S1 · learned",
      meta: ["Orders ~28 crops"],
    },
    {
      id: "gate",
      col: 3,
      row: 2,
      // Clay, and the veto edge leaving it is clay: the red arrow comes out of
      // the red box, which is the whole sentence this diagram exists to say.
      tone: "clay",
      label: "Agronomic gate",
      sub: "S2 · rules",
      meta: ["FAO EcoCrop envelopes"],
    },
    {
      id: "blend",
      col: 2,
      row: 3,
      tone: "gold",
      label: "Blend and conformal guard",
      sub: "S5 · hybrid",
      meta: ["How far to trust this taluka"],
    },
    {
      id: "served",
      col: 2,
      row: 4,
      tone: "green",
      label: "The list the farmer sees",
      meta: ["Yield band and dose plan"],
    },
  ],
  edges: [
    { from: "features", to: "ranker", fromSide: "b", toSide: "t" },
    { from: "features", to: "gate", fromSide: "b", toSide: "t" },
    {
      from: "gate",
      to: "ranker",
      fromSide: "l",
      toSide: "r",
      kind: "veto",
      label: "removes a crop",
    },
    { from: "ranker", to: "blend", fromSide: "b", toSide: "t" },
    { from: "gate", to: "blend", fromSide: "b", toSide: "t" },
    { from: "blend", to: "served", fromSide: "b", toSide: "t" },
  ],
  order: ["features", "ranker", "gate", "blend", "served"],
};

/** Chapter 8: what starts a research run. Nothing is researched speculatively. */
export const AGENT_TRIGGERS: FlowSpec = {
  cols: 4,
  rows: 3,
  nodes: [
    {
      id: "prediction",
      col: 1,
      row: 1,
      kind: "external",
      tone: "slate",
      label: "A successful prediction",
      meta: ["Names a soil and crops"],
    },
    {
      id: "clock",
      col: 1,
      row: 3,
      kind: "external",
      tone: "slate",
      label: "APScheduler",
      sub: "every 30 min",
      meta: ["Coalesced, one instance"],
    },
    {
      id: "ledger",
      col: 2,
      row: 1,
      kind: "store",
      tone: "green",
      label: "Demand ledger",
      sub: "agents/demand.py",
      meta: ["Starts empty"],
    },
    {
      id: "queue",
      col: 3,
      row: 1,
      tone: "gold",
      label: "On-demand queue",
      sub: "max 3 at once",
      meta: ["Soil, then crops by rank"],
    },
    {
      id: "sweep",
      col: 3,
      row: 3,
      tone: "gold",
      label: "Sweep",
      sub: "6 topics a run",
      meta: ["Never-researched first"],
    },
    {
      id: "pipeline",
      col: 4,
      row: 2,
      tone: "green",
      label: "The four-agent chain",
      meta: ["Fresh inside 8 h? skipped"],
    },
  ],
  edges: [
    { from: "prediction", to: "ledger", fromSide: "r", toSide: "l" },
    { from: "ledger", to: "queue", fromSide: "r", toSide: "l" },
    { from: "queue", to: "pipeline", fromSide: "r", toSide: "l" },
    { from: "clock", to: "sweep", fromSide: "r", toSide: "l" },
    { from: "sweep", to: "pipeline", fromSide: "r", toSide: "l" },
    {
      from: "ledger",
      to: "sweep",
      fromSide: "b",
      toSide: "t",
      kind: "control",
      label: "ranks topics",
    },
  ],
  order: ["prediction", "ledger", "queue", "clock", "sweep", "pipeline"],
};

/** Chapter 9: one tool call, from the agent's turn to the text it gets back. */
export const MCP_ROUNDTRIP: FlowSpec = {
  cols: 5,
  rows: 2,
  nodes: [
    {
      id: "agent",
      col: 1,
      row: 1,
      tone: "gold",
      label: "Research agent",
      sub: "decides to call a tool",
    },
    {
      id: "client",
      col: 2,
      row: 1,
      tone: "blue",
      label: "MCP client",
      sub: "stdio",
      meta: ["90-second session timeout"],
    },
    {
      id: "server",
      col: 3,
      row: 1,
      tone: "blue",
      label: "Tool subprocess",
      sub: "python -m …",
      meta: ["5 env vars, no keys"],
    },
    {
      id: "upstream",
      col: 4,
      row: 1,
      kind: "external",
      tone: "slate",
      label: "The internet",
      sub: "ddgs · data.gov.in",
    },
    {
      id: "back",
      col: 5,
      row: 1,
      tone: "green",
      label: "Text back into the turn",
      meta: ["Truncated at 6,000 chars"],
    },
    {
      id: "config",
      col: 3,
      row: 2,
      kind: "store",
      tone: "clay",
      label: "backend/config.py",
      meta: ["Keys live here: os.environ is empty"],
    },
  ],
  edges: [
    { from: "agent", to: "client", fromSide: "r", toSide: "l" },
    { from: "client", to: "server", fromSide: "r", toSide: "l" },
    { from: "server", to: "upstream", fromSide: "r", toSide: "l" },
    { from: "upstream", to: "back", fromSide: "r", toSide: "l" },
    {
      from: "config",
      to: "server",
      fromSide: "t",
      toSide: "b",
      kind: "control",
    },
  ],
  order: ["agent", "client", "server", "config", "upstream", "back"],
};

/** Chapter 10, first topology: everything in one container on one machine. */
export const FLY_TOPOLOGY: FlowSpec = {
  cols: 3,
  rows: 2,
  nodes: [
    {
      id: "user",
      col: 1,
      row: 1,
      kind: "external",
      tone: "slate",
      label: "Browser",
      meta: ["One origin, one hop"],
    },
    {
      id: "machine",
      col: 2,
      row: 1,
      tone: "gold",
      label: "One Fly machine",
      sub: "bom · 2 GB",
      meta: ["uvicorn + torch + tesseract", "Scheduler is a thread in it"],
    },
    {
      id: "volume",
      col: 3,
      row: 1,
      kind: "store",
      tone: "green",
      label: "Mounted volume",
      sub: "/data · 3 GB",
      meta: ["Uploads, index, reports"],
    },
    {
      id: "why",
      col: 1,
      row: 2,
      colSpan: 3,
      kind: "note",
      tone: "clay",
      label: "One machine, deliberately",
      meta: [
        "A second runs a second scheduler on the same volume: every topic researched twice, the OpenAI key billed twice",
      ],
    },
  ],
  edges: [
    { from: "user", to: "machine", fromSide: "r", toSide: "l" },
    { from: "machine", to: "volume", fromSide: "r", toSide: "l" },
  ],
  order: ["user", "machine", "volume", "why"],
};

/** Chapter 10, second topology: the split that follows from one constraint. */
export const VERCEL_FLY_TOPOLOGY: FlowSpec = {
  cols: 3,
  rows: 2,
  nodes: [
    {
      id: "user",
      col: 1,
      row: 1,
      rowSpan: 2,
      kind: "external",
      tone: "slate",
      label: "Browser",
    },
    {
      id: "vercel",
      col: 2,
      row: 1,
      tone: "blue",
      label: "Site on Vercel",
      sub: "edge CDN",
      meta: ["Route handlers hold the key"],
    },
    {
      id: "fly",
      col: 2,
      row: 2,
      tone: "gold",
      label: "Reading service on Fly",
      sub: "same container as above",
      meta: ["torch unpacks to ~800 MB"],
    },
    {
      id: "limit",
      col: 3,
      row: 1,
      rowSpan: 2,
      kind: "note",
      tone: "clay",
      label: "Why the split exists",
      meta: [
        "A Vercel function image caps at 250 MB",
        "torch alone is three times that",
        "OCR needs a binary, not a package",
        "The sweep is an 11-minute job",
      ],
    },
  ],
  edges: [
    { from: "user", to: "vercel", fromSide: "r", toSide: "l" },
    {
      from: "vercel",
      to: "fly",
      fromSide: "b",
      toSide: "t",
      label: "key + bearer",
    },
  ],
  order: ["user", "vercel", "fly", "limit"],
};
