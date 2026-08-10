# Live information for what was actually predicted

A plan to bring the agent pipeline in `backend/_unwired/agents/` back into the running app, so
that a farmer who lands on a crop, soil or fertilizer detail page sees current Indian
information — schemes, techniques, government prices, video — for the thing *their* card
predicted, refreshed no more than once every 8 hours.

---

## 1. What you already have

The pipeline is well built and most of this plan is wiring, not writing.

```
Planner ──> Research ──> Creator ──> Reviewer ──> storage (JSON per topic)
             │
             ├── MCP: web_search   (DuckDuckGo via ddgs, no API key)
             ├── MCP: fetch_url    (read a page in full)
             └── MCP: search_youtube
```

Already right, and worth saying so because it constrains the rest of the design:

- **`ResearchFindings` already has the fields you want** — `government_schemes`, `youtube_links`,
  `new_developments`, `market_notes`, `sources`.
- **The Research agent already refuses to invent prices**: *"Never state a specific numeric
  price/cost unless you saw that exact number in a fetched source."* That instruction is correct
  and §4 builds on it rather than relaxing it.
- **A Reviewer already gates publication** and the pipeline stores `needs_review` +
  `reviewer_concerns` alongside the report.
- **Per-topic failures are isolated** — one bad topic cannot take down a batch.
- **Storage is one JSON file per `{category}/{slug}`**, which is exactly the shape a detail page
  needs.

### What has to change

| # | Issue | Why it matters |
| --- | --- | --- |
| 1 | `least_recently_updated_topics()` cycles all 33 topics round-robin | You asked for *predicted things only*. Today it would research watermelon because it is stale, even if nobody has ever been shown watermelon. |
| 2 | `AGENTS_INTERVAL_HOURS = 12` | You asked for 8. |
| 3 | `topics.py` imports `SOIL_CLASSES` from the old config — **4 soils** | The classifier now returns 8. Four soil types would have no page content at all. |
| 4 | Prices come from an LLM reading web pages | §4. This is the part I would change most. |
| 5 | "Prefer Indian sources" is one line of prompt | §3. It is a preference, not a constraint, and preferences drift. |
| 6 | Everything is in `_unwired/` and its dependencies are not installed | `agents`, `mcp`, `ddgs`, `apscheduler` are all missing from the venv. |

---

## 2. Demand-driven refresh — "only the predicted things"

The core change. A **demand ledger** replaces the round-robin.

```
POST /api/predict  ──> returns soil / crops / fertilizers
                  └──> records those topic keys in demand.json  (cheap, synchronous)

scheduler, every 30 min:
    for each demanded topic, oldest first:
        if report age >= 8h and batch budget remains:
            refresh it
```

`demand.json` holds one row per topic: `{category, name, first_seen, last_seen, hits}`.

Three consequences worth stating:

- **Nothing is researched until it is predicted at least once.** A fresh install does no LLM work
  and costs nothing.
- **`hits` orders the queue.** A soil that 40 farmers were shown refreshes before one that one
  farmer saw. Ties break on age.
- **The ledger is the whole cost control.** Without it, 8-hour refresh × 37 topics × 4 agents is
  a standing bill for pages nobody opens.

**Never in the request path.** Research takes 30–60 s per topic. `/api/predict` writes one line to
the ledger and returns; the detail page reads whatever is cached. A farmer never waits for an
agent.

**Serving contract** — `GET /api/insights/{category}/{slug}`:

```jsonc
{
  "available": true,
  "age_hours": 3.4,
  "stale": false,          // true past 8h; content still served
  "report": { ...TopicReport... },
  "needs_review": false    // reviewer did not approve; UI flags it
}
```

`available: false` is a real state — the first farmer to be predicted a soil sees the page without
insights, and it says "being prepared" rather than pretending. It fills within the next cycle.

---

## 3. Context engineering — making "India only" a constraint, not a preference

This is the part you emphasised, so it gets the most structure. One line of prompt saying "prefer
Indian sources" is a suggestion; a model under pressure to fill a field will satisfy it from a
Texas extension page. Four layers, strongest first.

### 3a. A shared India context block, injected into every agent

One constant in `agents/context.py`, prepended to all four agents' instructions, so Planner,
Research, Creator and Reviewer cannot hold different ideas of the audience.

```
AUDIENCE   Smallholder farmers in India. Maharashtra first — this product is
           Marathi-first and its reference card is from Palghar district.
GEOGRAPHY  India only. A practice that needs equipment, subsidies or climate
           unavailable to an Indian smallholder is not relevant, however good.
SEASONS    Kharif (Jun–Oct), Rabi (Oct–Mar), Zaid (Mar–Jun). Anchor timing to
           these, never to Northern-hemisphere temperate seasons.
UNITS      Hectare and acre, quintal, kg/ha, ₹. Never lb/acre, never $.
BODIES     ICAR, KVK, state agricultural universities, ATMA, state agriculture
           departments, Agmarknet, e-NAM.
EXCLUDE    US/EU agronomy, non-Indian subsidy programmes, imperial units, any
           scheme not available to an Indian farmer.
```

### 3b. A source allowlist with tiers, enforced in code not prose

`agents/sources.py` classifies every URL before the Creator may cite it:

| tier | domains | may support |
| --- | --- | --- |
| **1 — authoritative** | `*.gov.in`, `agmarknet.gov.in`, `enam.gov.in`, `fert.nic.in`, `pmkisan.gov.in`, `agricoop.gov.in`, `icar.org.in`, `krishijagran`-class state portals | schemes, prices, MSP, anything official |
| **2 — institutional** | `*.ac.in` (agri universities), ICAR institute sites, KVK portals | agronomy, techniques, varieties |
| **3 — media** | Indian agricultural media | news and new developments only |
| **rejected** | everything else, and any non-Indian domain | nothing |

Enforcement, and this is the point: **a government scheme with no tier-1 source is dropped, not
published**. The Reviewer gets the tier map and fails the report if a scheme or a price rests on
tier 3 or a rejected domain. A rule in a prompt is advice; a rule in `reviewer.py` is a gate.

### 3c. Per-category research briefs

A crop, a soil and a fertilizer are not the same question, and one generic prompt gets generic
answers. Three briefs in `agents/briefs.py`:

- **Crop** — sowing window for the current season in Maharashtra; ICAR/SAU-released varieties;
  MSP if notified for this crop; irrigation and spacing; the two or three pests that actually
  matter; what the mandi price has done this season.
- **Soil** — management and amendment practice for this soil; where in India it occurs; which
  crops suit and which fight it; the specific failure mode (laterite's acidity and leaching,
  black soil's drainage, peat's waterlogging).
- **Fertilizer** — subsidised MRP and NBS status; dose per hectare for the crops it suits;
  application timing and split doses; **the risk of over-application**, which matters here because
  this product tells farmers to *hold* bags as often as to buy them.

### 3d. The Planner already does seasonality — keep it

`planner.py` already reasons about Kharif/Rabi/Zaid against today's date and writes a
`research_focus` per topic. That is good context engineering and stays as-is; it only needs the
shared block from 3a so its calendar and the Research agent's agree.

---

## 4. Prices: an API, not a language model

You asked for "prices of crops as per government" and "fertilizer prices". I would **not** get
these by asking an agent to read them off a web page, and the existing instructions already say
why — they forbid quoting a number the model did not see in a fetched source, which is the right
instinct. A price is the single most consequential number on the page: it is what a farmer decides
against, and it goes stale in days.

**A fourth MCP server, `mandi_price_server.py`, calling the official
[data.gov.in](https://data.gov.in) Agmarknet resource:**

```python
@mcp.tool()
def mandi_prices(commodity: str, state: str = "Maharashtra", days: int = 30) -> dict:
    """Government-recorded mandi prices. Returns records with market, date,
    min/max/modal price in ₹/quintal, and the resource id they came from."""
```

Structured, dated, attributable, and free (data.gov.in issues an API key on registration). The
agent's job becomes *interpreting* real numbers rather than *finding* them:

```python
class PriceObservation(BaseModel):
    commodity: str
    market: str            # mandi name
    state: str
    date: date
    modal_price: float     # ₹ per quintal
    source_url: str
```

`TopicReport` gains `prices: list[PriceObservation]` and `price_as_of: date`. `market_notes` stays
qualitative, for the trend commentary the numbers cannot give.

**Fertilizer prices** are different in kind — subsidised MRP is set nationally under NBS and does
not move daily. Sourced from `fert.nic.in` (tier 1) with the notification date, refreshed on the
same 8-hour cycle but changing rarely.

**Degradation is explicit:** no API key, or the API is down → `prices` is empty and the page shows
"government price data unavailable" rather than an LLM's recollection of a price.

---

## 5. Frontend

The three detail pages already exist: `/prediction/{crop,soil,fertilizer}/[key]`.

Each gains an insights section below the existing editorial content, server-rendered from
`/api/insights/...` so it is in the HTML rather than fetched on the client:

- **Overview + key facts** — the report's own summary
- **Techniques** — practices usable in India
- **Government schemes** — name, one line, official link. Tier-1 sourced or absent.
- **Prices** — a small table (mandi, date, ₹/quintal) with an "as of" date, from §4
- **Video** — one embed with the channel name visible
- **Sources** — every URL, so a farmer or an officer can check
- **Freshness line** — "Updated 3 hours ago", and when `stale`, "refreshing shortly"

Two rules carried from the rest of this product:

- **Agent-written content is visually distinct from measured content.** The twelve card readings
  are measurement; this is a language model's summary of web pages. It gets its own block with a
  quiet "gathered from the web" label — the same principle as the OCR `unconfirmed` marking.
- **`needs_review: true` shows a caution line.** The pipeline already computes it; not surfacing
  it would waste a gate you already built.

---

## 6. Sequence

1. **Dependencies + unquarantine** — `openai-agents`, `mcp`, `ddgs`, `apscheduler`, `httpx` into
   `backend/requirements.txt`; move `_unwired/agents/` → `backend/agents/`; fix the config imports
   it lost. Needs `OPENAI_API_KEY`.
2. **Fix the topic universe** — `SOIL_CLASSES` 4 → the 8 the classifier now returns, read from
   `ML/models/soil_classes.json` so it cannot drift from the model again.
3. **Context engineering** — `context.py`, `sources.py`, `briefs.py` (§3), and the Reviewer gate.
4. **Demand ledger + 8-hour policy** (§2) — `demand.py`, scheduler interval to 8h, batch bounded.
5. **Prices** (§4) — `mandi_price_server.py`, schema additions, `DATA_GOV_IN_API_KEY`.
6. **API** — `GET /api/insights/{category}/{slug}` on FastAPI, proxied through a Next route
   handler like `/api/card` and `/api/predict`.
7. **Frontend** — the insights section on the three detail pages.
8. **Verify** — predict a card, confirm only those topics enter the ledger, confirm the second
   prediction within 8 hours triggers no new LLM work.

Steps 1–4 are the substance. Step 5 is the one with an external dependency.

---

## 7. What this costs, and the risks

- **Two API keys.** `OPENAI_API_KEY` (required — the pipeline is a no-op without it, and
  `AGENTS_ENABLED` already handles that cleanly) and a free `data.gov.in` key for prices.
- **Roughly 4 LLM calls per topic refresh** (plan share, research with ~15 tool turns, create,
  review), so cost scales with *distinct predicted topics*, not with predictions. A farmer base
  concentrated on 6 crops and 3 soils costs about 10 topic-refreshes per 8 hours regardless of
  traffic.
- **DuckDuckGo via `ddgs` is unofficial** and rate-limits without warning. It is fine at this
  volume; if it starts failing, the fallback is a keyed search API, and the tier system means
  swapping the provider does not change what is trusted.
- **A model can still be wrong inside a real source.** The tier gate stops fabricated schemes and
  invented prices; it does not stop a plausible misreading of a genuine page. Hence the visual
  separation in §5 and the `needs_review` line — this content advises, the card measures.
- **Staleness is visible, not hidden.** Past 8 hours the page still serves and says so. Serving
  yesterday's scheme list is fine; silently implying it is live is not.
