# AgroSense

A crop and fertiliser advisory for Maharashtra farmers, in Marathi and English.

A farmer photographs their Soil Health Card and their soil, picks their taluka on
a map, says which season and whether the land is irrigated — and gets back a
ranked shortlist of crops they can actually grow, a yield outlook with an
interval rather than a single number, and an exact fertiliser dose per crop.

## The three parts

| | |
|:--|:--|
| `src/`, `public/` | The Next.js app — the farmer-facing site, in both languages. |
| `backend/` | FastAPI: reads the card (OCR), classifies the soil photograph, serves the document and agent endpoints. |
| `ml engine for Recommendation/` | **Regur**, the recommendation engine. Five stages, each using the technique that fits it rather than one end-to-end model. |
| `scrape data imp/` | The scrapers for the government data everything else runs on. |

## Documentation

**All design documents, research notes and plans live in
[`research and plan/`](research%20and%20plan/INDEX.md).** Start with its
`INDEX.md`, which says what each document is *and where each one is out of date*.

The three worth reading first:

- `research and plan/ML_PLAN.md` — the live plan for the engine
- `research and plan/ENGINE_DESCRIPTION.md` — the engine in five paragraphs
- `research and plan/RECOMMEND_INTEGRATION_PLAN.md` — how the engine reaches the app

For what the engine currently *scores*, read the generated reports instead of any
document: `ml engine for Recommendation/reports/scorecard.md`.

## Running it

```bash
npm install && npm run dev                                   # the app, on :3000

# from the repo root — the backend is a package (`backend.app`), not a script
./.venv/bin/uvicorn backend.app:app --port 8000              # reading service

cd "ml engine for Recommendation"
uv sync                                                      # rebuild its virtualenv
./.venv/bin/python -m pytest tests -q
./.venv/bin/uvicorn src.serve.api:app --port 8001            # recommendation engine
```

**Language models run on Amazon Bedrock** (Amazon Nova Pro) — the research
agents, the farmer assistant (`/api/chat`) and document Q&A. Locally that needs
AWS credentials with Bedrock access to Nova Pro (`aws configure`, a profile, or
`AWS_BEARER_TOKEN_BEDROCK`). The model follows `AWS_REGION`: `apac.` profile in
ap-south-1, `us.` in us-east-1. Without credentials the card reader and the three
models still work; the agents and the assistant switch themselves off.
`AGROSENSE_LLM_PROVIDER=openai` (agents) or `=ollama` (document answers) are the
non-AWS alternatives.

`npm run build` also runs `check:ontology` and `check:csp-hash`; both must pass.

**Deploying:** everything for AWS is in [`terraform/`](terraform/README.md) —
CloudFront + WAF, three Fargate services, the research Lambda, Bedrock with a
Guardrail, and the security services.

**Also in this repo:** [`researchpaper.md`](researchpaper.md) (the IEEE-format
paper) and [`bad.md`](bad.md) (what is not part of the project, and why).

## A note on the data

Nothing in this project is trained on invented, synthetic or unverified data.
Every dataset comes from a government portal or from files the owner supplied,
and its provenance is recorded. Where a number cannot be measured, the code says
so rather than estimating — see the "Known limits" sections of the plans.
