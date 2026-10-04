import type { Decision } from "./types";
import { SOIL_MODEL as M } from "./generated/soilModel";
import {
  FERTILISER_RANDOM_BASELINE,
  FERTILISER_HOLDOUT,
} from "./generated/tournaments";

/**
 * Every engineering decision in the project, in one place.
 *
 * They live here rather than inline in the chapters for two reasons. The ledger
 * at /examiner/decisions has to render all of them, and a chapter that owns its
 * own decision object would mean maintaining the same text twice. And several
 * of them quote a measured number — the soil model's grouped CV, the fertiliser baseline — so
 * they have to be built from the generated modules rather than transcribed, or
 * the ledger will drift from the figure it is summarising the moment anything
 * is retrained.
 */

const ARM_LABEL: Record<string, string> = {
  efficientnet_b0: "EfficientNet-B0",
  resnet18: "ResNet-18",
  efficientnet_b0_warm: "EfficientNet-B0, warm-started",
};
const label = (a: string) => ARM_LABEL[a] ?? a;
const winner = M.arms.find((a) => a.chosen)!;

export const DECISIONS: readonly Decision[] = [
  {
    id: "promote-eight-class-soil-model",
    chapter: "/examiner/soil-model",
    question:
      "Replace the production soil classifier with one retrained on all eight classes under grouped folds?",
    options: [
      {
        name: `Ship the retrained model (${label(winner.name)}, ${M.dataset.classes.length} classes)`,
        measured: `${winner.macroF1.toFixed(4)} ± ${winner.macroF1Std.toFixed(3)} macro-F1, ${M.folds}-fold CV grouped by scene`,
        chosen: true,
      },
      {
        name: `Keep the previous model (${M.previous ? `${label(M.previous.architecture)}, ${M.previous.classes} classes` : "eight classes"})`,
        measured: M.previous
          ? `${M.previous.reportedMacroF1.toFixed(4)} self-reported, on folds that let near-duplicates straddle a boundary`
          : "self-reported, on folds that let near-duplicates straddle a boundary",
      },
    ],
    decision:
      "The retrained model serves. The previous checkpoint is kept in ML/models/legacy_8class/ so a rollback is a copy.",
    because: `The two cannot be compared on equal footing, so the decision rests on which number can be trusted. Both were trained on the same folder, and the owner's field set, 4 soils in use, is a byte-identical subset of it, so no photograph exists that either model is a stranger to. The previous model's score was measured on folds where copies of one photograph sat on both sides; the new one never validates on a scene it trained on. It is also calibrated, with ECE ${winner.ece.toFixed(4)} at temperature ${winner.temperature.toFixed(3)}, so the confidence shown to a farmer means what it says.`,
    cost: `A lower headline number, honestly measured: ${winner.macroF1.toFixed(4)} against a quoted ${M.previous ? M.previous.reportedMacroF1.toFixed(4) : "0.906"}. Laterite and Peat are the weak classes, and there is still no held-out field test of either model.`,
    source: "ML/models/soil_v2/soil_metadata.json",
  },
  {
    id: "two-python-services",
    chapter: "/examiner/system",
    question:
      "Why are the reading service and the engine two processes rather than one?",
    options: [
      {
        name: "One FastAPI process serving both",
        measured: "one container, one deploy, one health check",
      },
      {
        name: "Two services, two images",
        measured: "two containers, one extra network hop",
        chosen: true,
      },
    ],
    decision:
      "Separate processes with separate container images, and the engine's image installs neither torch nor Tesseract.",
    because:
      "They cannot safely share one process. Two OpenMP runtimes killed a uvicorn worker with SIGSEGV and no traceback the first time one request touched both models. backend/config.py still pins OMP_NUM_THREADS=1 because of it.",
    cost: "Two deployments, two health checks, and a second network hop on any request that needs both.",
    source: "backend/config.py · ml engine for Recommendation/Dockerfile",
  },
  {
    id: "fertiliser-model-does-not-choose",
    chapter: "/examiner/tournaments",
    question:
      "Should the fertiliser classifier pick the product the farmer is told to buy?",
    options: [
      {
        name: "Serve the model's top class",
        measured: `${FERTILISER_HOLDOUT.accuracy.toFixed(4)} hold-out accuracy over 7 products`,
      },
      {
        name: "Rank by nutrient need from the farmer's own card; the model only breaks ties",
        measured: "exact, and traceable to the printed card",
        chosen: true,
      },
    ],
    decision:
      "Need is computed from the twelve readings on the farmer's Soil Health Card. The model is consulted only when two products are equally indicated.",
    because: `${(FERTILISER_HOLDOUT.accuracy - FERTILISER_RANDOM_BASELINE).toFixed(4)} above a coin toss, on synthetic labels. Nothing that weak may stand between a farmer and a purchase, and the card already answers the question.`,
    cost: "No model confidence can be shown for fertiliser. The product shows the nutrient match instead, and says so.",
    source: "backend/models.py · ML/models/fertilizer_metadata.json",
  },
  {
    id: "freeze-scorecard-anchors",
    chapter: "/examiner/engine",
    question: "Should the scorecard's 0-at and 10-at anchors be adjustable?",
    options: [
      {
        name: "Tune anchors as understanding improves",
        measured: "a composite that always looks reasonable",
      },
      {
        name: "Freeze them and hash the file",
        measured: "reports/scorecard_anchors.sha256",
        chosen: true,
      },
    ],
    decision:
      "The anchors are frozen and their hash is committed. A run that does not match the recorded hash is not a valid score.",
    because:
      "A scorecard whose targets move after the result measures nothing. Freezing them is what makes 6.00 and 7.97 comparable, and the two unmeasured lines a visible gap.",
    cost: "A badly calibrated criterion stays that way until it is re-anchored in the open, with the history re-scored.",
    source: "ml engine for Recommendation/reports/scorecard_anchors.sha256",
  },
  {
    id: "nasa-power-over-imd",
    chapter: "/examiner/data",
    question: "Where should daily weather for 358 talukas come from?",
    options: [
      {
        name: "India Meteorological Department",
        measured: "the authoritative source for Indian weather",
      },
      {
        name: "NASA POWER daily point API",
        measured: "free, no key, 29 years, ~55 km grid",
        chosen: true,
      },
    ],
    decision:
      "NASA POWER, queried at each taluka's OpenStreetMap centroid and cached.",
    because:
      "IMD was evaluated first and could not supply it: forecast-only free APIs, a gridded archive missing humidity and wind, and the daily series sold as PDF bulletins. POWER gives all five variables daily back to 1997, with no key.",
    cost: "Reanalysis on a ~55 km grid, so adjacent talukas share a cell. The weather features are a climate descriptor, not a field measurement, and say so.",
    source: "scrape data imp/weather_scraper.py",
  },
  {
    id: "ranges-from-the-card",
    chapter: "/examiner/reading",
    question:
      "Where should the low / medium / high bands for a reading come from?",
    options: [
      {
        name: "A standard reference table in the code",
        measured: "consistent across every farmer, easy to maintain",
      },
      {
        name: "The range printed on the farmer's own card",
        measured: "matches the paper in their hand",
        chosen: true,
      },
    ],
    decision:
      "Bands are read off the card itself, per metric, and the code carries no band table at all.",
    because:
      "Software that contradicts the paper in someone's hand has lost the argument. If our table says 'medium' where the card says 'low', the farmer is right to stop trusting the app — the issuing laboratory is the authority, not us.",
    cost: "A card printed without its ranges cannot be banded at all. The reader says so rather than guess.",
    source: "backend/soil_report.py",
  },
  {
    id: "rag-404-not-403",
    chapter: "/examiner/rag",
    question:
      "What should happen when a farmer asks about a document that is not theirs?",
    options: [
      { name: "403 Forbidden", measured: "the honest status code" },
      {
        name: "404 Not Found",
        measured: "reveals nothing",
        chosen: true,
      },
    ],
    decision:
      "The document service raises the same not-found error for a document that does not exist and one owned by somebody else. The API returns 404 either way.",
    because:
      "A 403 confirms the document exists, which with sequential-ish ids turns the endpoint into an enumeration tool. A card carries a farmer's name, village and survey number: the record's existence is itself worth withholding.",
    cost: "A farmer who mistypes their own id gets 'not found' rather than 'not yours' — a worse message for the honest case.",
    source: "backend/document_service.py",
  },
  {
    id: "strip-in-code",
    chapter: "/examiner/agents",
    question:
      "Should unsourced claims be removed by the Reviewer agent, or by code before the Reviewer runs?",
    options: [
      {
        name: "Instruct the Reviewer to remove them",
        measured: "one fewer moving part",
      },
      {
        name: "Delete them in code, then review what remains",
        measured: "deterministic",
        chosen: true,
      },
    ],
    decision:
      "strip_unsourced_claims() runs first, in Python, against a domain allowlist. The Reviewer only ever sees a draft that is already clean.",
    because:
      "A model asked to enforce a rule follows it almost always, and fails unpredictably and invisibly. Schemes, foreign sources and shop links are the three places where being wrong costs a farmer money. A regex is not smarter, just reliable.",
    cost: "A legitimate tier-3 claim is deleted with the rest, and the agent is never told which, so it cannot argue.",
    source: "backend/agents/reviewer.py",
  },
  {
    id: "seller-allowlist",
    chapter: "/examiner/mcp",
    question:
      "How should the agent find somewhere for a farmer to buy fertiliser?",
    options: [
      {
        name: "Search, and let the agent judge the results",
        measured: "the whole web",
      },
      {
        name: "Search restricted to seven domains, then verify each hit",
        measured: "at most 4 links",
        chosen: true,
      },
    ],
    decision:
      "An allowlist, applied as a site: filter before the search runs, then a fetch to verify each candidate, then a second check by the reviewer.",
    because:
      "The other four servers hand the agent things to read; this one hands it places to spend money, and a judgement call is the wrong mechanism. Filtering the query rather than the results leaves nothing for the agent to reconsider.",
    cost: "A legitimate local supplier outside the seven domains cannot be recommended at all — a real omission in a state this size.",
    source: "backend/agents/mcp_servers/seller_server.py",
  },
  {
    id: "fly-over-push-builds",
    chapter: "/examiner/deployment",
    question:
      "Where should the reading service run, given it needs 64 MB of model files that are not in git?",
    options: [
      {
        name: "A push-based platform (Render, Railway, Heroku)",
        measured: "builds from a git push",
      },
      {
        name: "Fly.io",
        measured: "builds from the working directory",
        chosen: true,
      },
    ],
    decision:
      "Fly, with the models copied into the image at build time from the local working directory.",
    because:
      "ML/models/ is gitignored: 64 MB of binaries do not belong in a repository. A platform building from a git push cannot see them, so the container would fail on the first prediction rather than at build time.",
    cost: "Only reproducible on a machine holding the trained models. No CI path can rebuild this image from the repository alone — the biggest weakness in the deployment story.",
    source: "fly.toml · .gitignore",
  },
];

export function decision(id: string): Decision {
  const found = DECISIONS.find((d) => d.id === id);
  if (!found) throw new Error(`No decision registered with id "${id}"`);
  return found;
}
