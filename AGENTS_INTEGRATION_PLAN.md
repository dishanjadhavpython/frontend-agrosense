# AgroSense Agent & MCP Integration Plan
## Context Engineering for Indian Agriculture Intelligence

---

## Executive Summary

The system **already has a complete, production-ready agent pipeline** with 4 MCP servers. This plan documents the existing architecture and identifies the specific context engineering configurations needed to ensure **India-only, farmer-relevant intelligence** for predicted crops, soils, and fertilizers — refreshed every 8 hours and cached until the next cycle.

---

## 1. Current Architecture Overview

### 1.1 Agent Pipeline (Already Implemented)
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Planner   │────▶│  Research   │────▶│  Creator    │────▶│  Reviewer   │
│  (planner)  │     │ (research)  │     │ (creator)   │     │ (reviewer)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
  Topic selection    Web search +      Polish to          Quality gate:
  & focus areas      fetch + YouTube    farmer-facing      - Source audit
  per topic          + mandi prices     report             - India-only
                                                          - Price verification
                                                          - Scheme validation
```

### 1.2 MCP Servers (Already Implemented)
| Server | Purpose | India-Specific Configuration |
|--------|---------|------------------------------|
| `web_search_server` | DuckDuckGo search | Queries must include "India", "Maharashtra", "ICAR", "KVK" |
| `fetch_server` | HTTP fetch + HTML extraction | Prioritizes *.gov.in, *.nic.in, ICAR, SAU domains |
| `youtube_server` | YouTube Data API v3 | Search queries in Hindi/Marathi + English; filter for Indian channels |
| `mandi_price_server` | Agmarknet (data.gov.in) | **Maharashtra default**, commodity aliases for Indian crop names |

### 1.3 Demand-Driven Research (Already Implemented)
- **Only researches what's predicted** — `/api/predict` records demand in `_demand.json`
- **8-hour refresh interval** — `AGENTS_INTERVAL_HOURS = 8` (configurable)
- **30-minute sweep** — Checks for stale/due topics every 30 min
- **File-based caching** — Reports stored in `backend/data/agent_reports/`

### 1.4 Frontend Integration (Already Implemented)
- `/api/insights/[category]/[slug]` — Proxies to backend `/api/insights/{category}/{slug}`
- `Insights.tsx` component — Renders prices, schemes, videos, sources with Marathi/English
- Client-side fetch — Doesn't block static page generation

---

## 2. Context Engineering Requirements

### 2.1 Shared India Context (Already in `agents/context.py`)
```python
INDIA_CONTEXT = """
AUDIENCE   Smallholder farmers in India, typically 1-5 acres, often reading
           through a translator or an extension worker. Maharashtra first:
           this product is Marathi-first and its reference Soil Health Card
           comes from Palghar district.

GEOGRAPHY  India only. A technique that needs machinery, credit, subsidies or
           a climate an Indian smallholder does not have is not relevant here,
           however well it works elsewhere. If the only material you can find
           is non-Indian, leave the field empty and say so — an empty section
           is honest, a foreign one is misleading.

SEASONS    Anchor all timing to India's cropping calendar:
             Kharif  ~June-October   (monsoon sown)
             Rabi    ~October-March  (winter sown)
             Zaid    ~March-June     (summer, irrigated)
           Never to Northern-hemisphere temperate seasons.

UNITS      Hectare and acre. Quintal (100 kg) and tonne. kg/ha for nutrients.
           Rupees, written as Rs. or INR. Never lb/acre, never bushels, never
           dollars.

BODIES     ICAR and its institutes, Krishi Vigyan Kendras (KVK), state
           agricultural universities, ATMA, state agriculture departments,
           Agmarknet, e-NAM, the Department of Fertilizers.

LANGUAGE   Plain English a translator can carry into Marathi. Short sentences.
           No academic hedging, no marketing copy. Name the thing and say what
           to do about it.

EXCLUDE    US/EU agronomy, non-Indian subsidy programmes, imperial units,
           any scheme an Indian farmer cannot actually apply for, and any
           product recommendation that reads as advertising.
"""
```

**This context is prepended to ALL four agents' instructions** — ensuring Planner, Research, Creator, and Reviewer share the same constraints.

### 2.2 Category-Specific Research Briefs (Already in `agents/briefs.py`)

#### CROP_BRIEF — For Indian Crops
```
1. SEASON AND SOWING — Kharif/Rabi/Zaid, sowing window in Maharashtra/western India
2. VARIETIES — ICAR/SAU released varieties, naming the releasing institute
3. GOVERNMENT SUPPORT — MSP (if notified), central/Maharashtra schemes (insurance, subsidy, procurement)
   *.gov.in source OR leave it out
4. WATER AND INPUTS — Irrigation need, critical stages, rainfed suitability
5. WHAT GOES WRONG — Top 2-3 pests/diseases costing yield HERE, recognised management
6. MARKET — Qualitative mandi price trends; numbers from price tool only
```

#### SOIL_BRIEF — For Indian Soil Types
```
1. WHERE IT IS — Indian regions, Maharashtra districts
2. HOW IT BEHAVES — Drainage, water holding, pH tendency, characteristic nutrient deficiencies
3. THE FAILURE MODE — Specific failure (laterite leaches, black soil cracks, peat waterlogs)
4. MANAGEMENT — Amendments/practices working in Indian conditions (liming, gypsum, OM, drainage, bunding, green manure)
5. WHAT GROWS ON IT — Crops that suit it vs. struggle
6. SCHEMES — Soil health, reclamation, watershed schemes (*.gov.in source or leave out)
```

#### FERTILIZER_BRIEF — For Indian Fertilizers
```
1. WHAT IT IS — N-P-K grade, nutrient function
2. PRICE AND SUBSIDY — Subsidised MRP under NBS, fert.nic.in source with notification date
3. DOSE — kg/ha for main crops, basal vs top-dressing, splits
4. TIMING — Crop stage for application
5. OVER-APPLICATION — Soil damage, wasted money, environmental cost (CRITICAL)
6. ALTERNATIVES — Organic/lower-cost substitutes supplying same nutrient
```

---

## 3. Source Classification & Enforcement (Already in `agents/sources.py`)

### 3.1 Tier System
| Tier | Domains | Can Support |
|------|---------|-------------|
| **Authoritative** | `*.gov.in`, `*.nic.in`, named national bodies | Government schemes, subsidies, MSP, prices |
| **Institutional** | Agricultural universities, ICAR institutes, KVKs | Agronomy, techniques, varieties, management |
| **Media** | Indian agricultural media | News of new varieties only |
| **Rejected** | Everything else (including non-Indian domains) | Nothing — stripped before publish |

### 3.2 Reviewer Enforcement (Already in `agents/reviewer.py`)
The Reviewer **rejects** reports if:
- Government scheme listed with NO authoritative source
- Specific price/MSP/subsidy figure with NO authoritative source OR no date
- Named variety/breed/formulation with NO source
- Market notes state specific number not in prices
- Advice not applicable in India (wrong hemisphere, imperial units, foreign subsidy, equipment smallholder lacks)
- Report is generic filler

### 3.3 Automated Stripping (Already in `strip_unsourced_claims`)
Before Reviewer sees report, code **automatically removes**:
- Schemes without `*.gov.in` / `*.nic.in` source
- Sources outside India (non-usable domains)

---

## 4. 8-Hour Caching Strategy (Already Implemented)

### 4.1 Configuration
```python
# backend/config.py
AGENTS_INTERVAL_HOURS = 8          # Refresh interval
AGENTS_SWEEP_MINUTES = 30          # Check frequency
AGENTS_BATCH_SIZE = 6              # Topics per cycle (cost control)
```

### 4.2 How It Works
1. **Prediction happens** → `/api/predict` calls `demand.record()` → writes to `_demand.json`
2. **Scheduler sweeps every 30 min** → `demand.due_topics()` checks:
   - Topic never researched → `age = inf` → **due immediately**
   - Topic researched < 8 hours ago → **skip** (serve cache)
   - Topic researched ≥ 8 hours ago → **due for refresh**
3. **Pipeline runs** → Researches due topics → Stores in `agent_reports/{category}/{slug}.json`
4. **Frontend reads cache** → `/api/insights/{category}/{slug}` returns stored report with `age_hours` and `stale` flag
5. **Insights.tsx displays** → "Updated Xh ago" + "refreshing shortly" if stale

### 4.3 Cache Invalidation
- **Automatic**: Age-based (8 hours)
- **Manual**: Delete `backend/data/agent_reports/{category}/{slug}.json`
- **On-demand**: Not supported by design (cost control) — but first-time topics get picked up at next sweep (≤30 min)

---

## 5. Integration with Individual Pages (Already Working)

### 5.1 Page Structure
```
/prediction/crop/[key]/page.tsx     → CropDetail → Insights
/prediction/soil/[key]/page.tsx     → SoilDetail → Insights
/prediction/fertilizer/[key]/page.tsx → FertDetail → Insights
```

### 5.2 Insights Component (`Insights.tsx`)
Renders these sections **only when data exists**:
| Section | Data Source | Display |
|---------|-------------|---------|
| **Key Points** | `report.key_facts` | Bullet list |
| **What's New** | `report.new_developments` | Bullet list (new varieties/formulations) |
| **Government Prices** | `report.prices` (from mandi_price_server) | Table: Market, Date, Modal Price (Rs/quintal) |
| **Government Schemes** | `report.government_schemes` | Cards with name, description, official link |
| **Worth Watching** | `report.youtube_resources` | Video cards with title, channel, link |
| **Sources** | `report.sources` | Link list with titles |

### 5.3 Freshness Indicator
```tsx
<Freshness ageHours={state.age_hours} stale={state.stale} mr={mr} />
```
Shows: "Updated 3h ago" or "Updated just now" + "· refreshing shortly" if stale

### 5.4 Caveat Banner (Always shown)
> "Collected automatically from the web and refreshed every 8 hours. The links below are the original sources — check them yourself before spending money on any of this."

---

## 6. Required Environment Variables

### 6.1 Mandatory (for agents to work)
```bash
OPENAI_API_KEY=sk-...                    # Required for all 4 agents
```

### 6.2 Recommended (for full functionality)
```bash
DATA_GOV_IN_API_KEY=...                  # Government mandi prices (free from data.gov.in)
YOUTUBE_API_KEY=...                      # YouTube Data API v3 (free tier, specific videos vs search link)
AGROSENSE_AGENTS_MODEL=gpt-4o-mini       # Or gpt-4o for higher quality
AGROSENSE_AGENTS_INTERVAL_HOURS=8        # Refresh interval (default 8)
AGROSENSE_AGENTS_BATCH_SIZE=6            # Topics per cycle (default 6)
AGROSENSE_AGENTS_SWEEP_MINUTES=30        # Sweep frequency (default 30)
AGROSENSE_PRICE_STATE=Maharashtra        # Default state for mandi prices
```

### 6.3 Optional
```bash
AGROSENSE_AGENTS_ENABLED=1               # Force enable/disable (default: auto from OPENAI_API_KEY)
AGROSENSE_AGENTS_RUN_ON_STARTUP=1        # Run immediately if stale (default: true)
AGROSENSE_AGENT_REPORTS_DIR=...          # Custom report storage path
```

---

## 7. Verification Checklist

### 7.1 Backend Verification
- [ ] `OPENAI_API_KEY` set → `AGENTS_ENABLED = true`
- [ ] `DATA_GOV_IN_API_KEY` set → mandi prices return `available: true`
- [ ] `YOUTUBE_API_KEY` set → specific video results (not just search link)
- [ ] Scheduler starts on app lifespan (`app.py` lines 41-53)
- [ ] Reports written to `backend/data/agent_reports/{category}/{slug}.json`
- [ ] `/api/insights/{category}/{slug}` returns cached report with `age_hours`

### 7.2 Frontend Verification
- [ ] `/api/insights/[category]/[slug]/route.ts` proxies to backend
- [ ] `Insights.tsx` fetches client-side on mount
- [ ] All 6 sections render conditionally (prices, schemes, videos, facts, new, sources)
- [ ] Freshness badge shows correct age
- [ ] Marathi/English toggle works for all text
- [ ] Caveat banner displays
- [ ] "Parts did not fully pass review" warning shows when `needs_review: true`

### 7.3 Content Quality Verification
- [ ] Crop pages show: MSP (if applicable), Maharashtra sowing window, ICAR varieties
- [ ] Soil pages show: Maharashtra districts, failure mode, Indian amendments
- [ ] Fertilizer pages show: NBS subsidised MRP with notification date, over-application warnings
- [ ] All prices from `mandi_prices` tool (not hallucinated)
- [ ] All schemes have `*.gov.in` / `*.nic.in` URL
- [ ] All videos from Indian agricultural channels (KVK, ICAR, DD Kisan, etc.)
- [ ] No imperial units, no foreign schemes, no brand names

---

## 8. Monitoring & Debugging

### 8.1 Health Endpoint
```bash
GET /api/health
```
Returns:
```json
{
  "insights": {
    "enabled": true,
    "tracked": 12,
    "fresh": 8,
    "due": 4,
    "interval_hours": 8
  }
}
```

### 8.2 Freshness Check (Per Topic)
```bash
GET /api/insights/crop/rice
```
Returns:
```json
{
  "available": true,
  "age_hours": 3.5,
  "stale": false,
  "next_refresh_in_hours": 4.5,
  "report": { ... }
}
```

### 8.3 Scheduler Logs
```
INFO  Agent sweep every 30 min; topics refresh at most every 8 h.
INFO  Running scheduled AI agent research/report pipeline...
INFO  Agent pipeline run finished: completed
```

### 8.4 Manual Trigger (for testing)
```bash
POST /api/agents/run   # If you add this endpoint
# Or directly:
python -m backend.agents.pipeline
```

---

## 9. Cost Control (Built-In)

| Mechanism | Purpose |
|-----------|---------|
| `AGENTS_BATCH_SIZE=6` | Max 6 topics × 4 LLM calls = 24 calls/cycle |
| Demand-driven | Only researches predicted topics (not all 37) |
| 8-hour cache | Same topic researched max 3×/day |
| `max_turns=20` (Research) | Bounds tool usage per topic |
| `max_turns=6` (Creator/Reviewer) | Bounds revision cycles |
| Sweep ≠ Refresh | Sweep checks; refresh only when due |

**Estimated cost**: ~$0.02-0.05 per topic (gpt-4o-mini) → ~$0.12-0.30 per cycle → ~$1-2/day at full capacity

---

## 10. What's Already Done vs. What Needs Config

| Component | Status | Action Needed |
|-----------|--------|---------------|
| Agent pipeline (4 agents) | ✅ Complete | Set `OPENAI_API_KEY` |
| MCP servers (4) | ✅ Complete | Set `DATA_GOV_IN_API_KEY`, `YOUTUBE_API_KEY` |
| India context block | ✅ Complete | Verify `INDIA_CONTEXT` matches needs |
| Category briefs | ✅ Complete | Verify briefs cover your priority topics |
| Source classification | ✅ Complete | No action |
| Reviewer enforcement | ✅ Complete | No action |
| 8-hour cache | ✅ Complete | Tune `AGENTS_INTERVAL_HOURS` if needed |
| Demand-driven research | ✅ Complete | No action |
| Frontend insights API | ✅ Complete | No action |
| Insights UI component | ✅ Complete | No action |
| Scheduler (30-min sweep) | ✅ Complete | No action |
| Report storage | ✅ Complete | No action |

---

## 11. Next Steps (If Any)

1. **Add API keys to environment** (`.env` or deployment config):
   ```bash
   OPENAI_API_KEY=sk-...
   DATA_GOV_IN_API_KEY=...        # From https://data.gov.in
   YOUTUBE_API_KEY=...            # From Google Cloud Console
   ```

2. **Verify topic coverage** — Check `backend/agents/topics.py` `CROPS`, `SOILS`, `FERTILIZERS` lists match what your models predict

3. **Test end-to-end**:
   - Upload a soil card → get prediction
   - Visit `/prediction/crop/[predicted-crop]`
   - Verify Insights section loads with real data

4. **Monitor first few cycles** — Check logs for:
   - Successful research runs
   - Reviewer approvals (vs rejections)
   - Price data availability
   - YouTube video quality

---

## 12. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FARMER FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Farmer uploads Soil Health Card                                        │
│     └─▶ /api/ingest → OCR → 12 readings                                    │
│                                                                             │
│  2. Farmer enters weather + gets prediction                                │
│     └─▶ /api/predict → soil + 3 crops + 2 fertilizers                      │
│     └─▶ demand.record() → writes to _demand.json                           │
│                                                                             │
│  3. Farmer clicks crop → /prediction/crop/rice                             │
│     └─▶ Static page renders (CropDetail)                                   │
│     └─▶ Insights.tsx fetches /api/insights/crop/rice                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND RESEARCH CYCLE (Every 30 min)               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Scheduler (APScheduler)                                                   │
│     │                                                                       │
│     ▼                                                                       │
│  demand.due_topics(6)  ──▶ [rice, wheat, black-soil, urea, ...]           │
│     │                                                                       │
│     ▼                                                                       │
│  planner.plan_batch()  ──▶ Focus areas per topic                          │
│     │                                                                       │
│     ▼                                                                       │
│  For each topic:                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ research_topic()                                                    │   │
│  │   ├─▶ web_search("rice varieties ICAR 2024 Maharashtra")           │   │
│  │   ├─▶ fetch_url("https://icar.org.in/...")                         │   │
│  │   ├─▶ search_youtube("rice cultivation Marathi")                   │   │
│  │   └─▶ mandi_prices("rice", "Maharashtra")                          │   │
│  │   └─▶ ResearchFindings (structured)                                │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ create_report() ──▶ TopicReport (polished, farmer-facing)          │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ strip_unsourced_claims() ──▶ Removes non-*.gov.in schemes/sources  │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ review_report() ──▶ Approve/Reject with concerns                   │   │
│  │   └─▶ If rejected: _revise_report() → re-review (1 attempt)        │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ storage.save_report() ──▶ backend/data/agent_reports/crop/rice.json│   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CACHE SERVING                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  GET /api/insights/crop/rice                                               │
│     │                                                                       │
│     ▼                                                                       │
│  storage.load_report("crop", "rice")                                       │
│     │                                                                       │
│     ├─▶ Found + age < 8h ──▶ Return {available: true, report, age_hours}  │
│     │                                                                       │
│     ├─▶ Found + age ≥ 8h ──▶ Return {available: true, report, stale: true}│
│     │                                                                       │
│     └─▶ Not found ──▶ Return {available: false, reason: "queued..."}      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Summary

**The system is already fully architected and implemented** for:
- ✅ India-only context (shared across all agents)
- ✅ Demand-driven research (only predicted topics)
- ✅ 4 MCP servers (web, fetch, YouTube, mandi prices)
- ✅ Source tier enforcement (authoritative → rejected)
- ✅ Reviewer quality gate (auto-rejects non-Indian/unsourced claims)
- ✅ 8-hour cache with 30-min sweep
- ✅ Frontend integration with bilingual Insights component
- ✅ Cost-bounded batch processing

**Only configuration needed**: Set the 3 API keys (`OPENAI_API_KEY`, `DATA_GOV_IN_API_KEY`, `YOUTUBE_API_KEY`) and deploy.

The context engineering is **baked into the agent instructions, briefs, source classification, and reviewer logic** — not a separate step. Every agent sees the same India constraints, every claim is traced to a source, and every government scheme/price requires a `*.gov.in` citation or it's stripped before the farmer sees it.