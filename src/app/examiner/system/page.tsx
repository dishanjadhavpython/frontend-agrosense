import type { Metadata } from "next";
import {
  Network,
  Server,
  Cpu,
  Download,
  ShieldCheck,
  Route,
  KeyRound,
  Lock,
} from "lucide-react";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Honest, Points } from "@/components/examiner/viz/Figure";
import { Card, Grid, StatCard } from "@/components/examiner/viz/Card";
import { Flow, Pipeline } from "@/components/examiner/viz/Flow";
import { Table } from "@/components/examiner/viz/Matrix";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { decision } from "@/data/examiner/decisions";
import { SYSTEM_TOPOLOGY, REQUEST_TRACE } from "@/data/examiner/diagrams";

export const metadata: Metadata = { title: "Four processes, one request" };

export default function Page() {
  return (
    <Chapter href="/examiner/system">
      <Grid>
        <StatCard
          span={3}
          icon={Server}
          tone="blue"
          value={4}
          label="processes"
          sub="three serve requests, one runs offline"
        />
        <StatCard
          span={3}
          icon={Route}
          tone="gold"
          value={6}
          label="public endpoints"
          sub="every one a server-only proxy"
        />
        <StatCard
          span={3}
          icon={ShieldCheck}
          tone="green"
          value={0}
          label="Python endpoints reachable from a browser"
          sub="which is why there is no CORS config"
        />
        <StatCard
          span={3}
          icon={Cpu}
          tone="slate"
          value={2}
          label="container images"
          sub="separate on purpose — see the decision below"
        />
      </Grid>

      <Block
        title="What is actually running"
        lede="Four processes, not one application. Three serve requests; the fourth runs offline and never sees a user."
      >
        <Grid>
          <Card
            span={5}
            n="Fig. 1.1"
            title="The topology"
            icon={Network}
            tone="blue"
            lede="The browser never reaches Python. Every call goes through a Next.js route handler."
            source="README.md · backend/app.py · ml engine for Recommendation/src/serve/api.py"
          >
            <Flow {...SYSTEM_TOPOLOGY} rowHeight={134} maxWidth={640} />
          </Card>

          <div className="flex flex-col gap-4 md:col-span-6 lg:col-span-7">
            <Card
              span={12}
              n="Fig. 1.2"
              title="Who owns what"
              lede="Each process owns one thing, and nothing owns two."
              source="README.md"
              wide
            >
              <Table
                head={["Process", "Port", "Owns"]}
                numeric={[1]}
                rows={[
                  {
                    cells: [
                      "Site and API proxy",
                      "3000",
                      "Everything the farmer sees",
                    ],
                    note: "Next 16.3, React 19, Clerk",
                  },
                  {
                    cells: [
                      "Reading service",
                      "8000",
                      "The card, the soil photo, the agents",
                    ],
                    note: "FastAPI, PyTorch, Tesseract",
                  },
                  {
                    cells: [
                      "Regur engine",
                      "8001",
                      "Ranks crops, doses fertiliser",
                    ],
                    note: "FastAPI, LightGBM, CatBoost",
                  },
                  {
                    cells: [
                      "Scrapers",
                      "—",
                      "Produce the CSVs the engine is built from",
                    ],
                    note: "Python, run by hand",
                  },
                ]}
              />
            </Card>

            <Card
              span={12}
              n="Fig. 1.3"
              title="What opens without an account"
              icon={Lock}
              tone="clay"
              lede="Public by exception: gated unless listed. A route earns a place by carrying nobody's document and costing nothing."
              source="src/middleware.ts"
              wide
              footnote={
                <Points
                  items={[
                    "POST /api/recommend is deliberately not on it — its body can carry the farmer's own card readings",
                    "Only the metadata route beside it, /api/recommend/meta, is public",
                  ]}
                />
              }
            >
              <Table
                head={["Route", "Public because"]}
                numeric={[]}
                minWidth="30rem"
                rows={[
                  {
                    cells: ["/", "The landing page"],
                  },
                  {
                    cells: [
                      "/prediction(.*)",
                      "37 reference pages — committed editorial content, identical for everybody",
                    ],
                  },
                  {
                    cells: [
                      "/examiner(.*)",
                      "This walkthrough. Generated offline; no card, no paid call",
                    ],
                    chosen: true,
                  },
                  {
                    cells: [
                      "/sign-in, /sign-up",
                      "Otherwise nobody could sign in",
                    ],
                  },
                  {
                    cells: [
                      "/api/insights(.*)",
                      "Read-only, fetched client-side while signed out",
                    ],
                  },
                  {
                    cells: [
                      "/api/recommend/meta",
                      "The taluka list and season vocabulary, fetched on mount",
                    ],
                  },
                ]}
              />
            </Card>
          </div>

          <Card
            span={12}
            n="Fig. 1.4"
            title="The trust boundary, and the two headers that cross it"
            icon={KeyRound}
            tone="gold"
            lede="Two headers, two questions. The key proves the caller is our server; the bearer proves which farmer is asking."
            source="src/lib/cardApi.ts · src/middleware.ts"
            footnote="Before the bearer token, /api/documents returned every card the service held. A key says trusted software, not whose document."
          >
            <Flow {...REQUEST_TRACE} rowHeight={108} maxWidth={940} />
          </Card>

          <Card span={12} quiet>
            <DecisionCard decision={decision("two-python-services")} />
          </Card>
        </Grid>
      </Block>

      <Block
        title="One request, end to end"
        lede="What happens when a farmer photographs a Soil Health Card and asks what to sow."
      >
        <Grid>
          <Card
            span={12}
            n="Fig. 1.5"
            title="The path of a prediction"
            icon={Download}
            tone="gold"
            lede="Nine inputs required, no defaults. A missing one is a 422 naming the field, not a silent zero."
            source="src/app/api/*/route.ts · backend/app.py"
          >
            <Pipeline
              feedback="A successful prediction also records demand and queues background research on the crops it named — chapter 8. That call is wrapped in a bare except: a failure to queue research must never turn a good prediction into a 500."
              steps={[
                {
                  label: "Upload",
                  sub: "POST /api/card",
                  tone: "blue",
                  detail: "Magic bytes checked before any parser runs",
                },
                {
                  label: "Read",
                  sub: "→ :8000 /api/ingest",
                  tone: "blue",
                  detail: "PyMuPDF, or an eight-pass OCR search",
                },
                {
                  label: "Twelve readings",
                  tone: "blue",
                  detail: "Ranges taken from the card, never a table",
                },
                {
                  label: "Classify soil",
                  sub: "POST /api/soil",
                  tone: "gold",
                  badge: "learned",
                  detail: "EfficientNet-B0, calibrated probabilities",
                },
                {
                  label: "Rank crops",
                  sub: "→ :8001 /recommend",
                  tone: "gold",
                  badge: "learned + rules",
                  detail: "Ranker, then the agronomic gate",
                },
                {
                  label: "Dose fertiliser",
                  tone: "green",
                  badge: "lookup",
                  detail: "Exact government table, not a model",
                },
              ]}
            />
          </Card>

          <Card span={12} quiet>
            <Honest title="Three deployment topologies, and no single answer">
              This repository contains a Fly.io single-container definition, a
              Vercel-plus-Fly split, and a complete AWS stack in Terraform. All
              three are real and none is marked as the live one. Chapter 10
              shows all three rather than picking whichever is most flattering.
            </Honest>
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
