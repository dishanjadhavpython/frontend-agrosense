import type { Metadata } from "next";
import {
  Cloud,
  Package,
  ShieldCheck,
  TriangleAlert,
  Rocket,
} from "lucide-react";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Honest, Points } from "@/components/examiner/viz/Figure";
import { Card, Grid, StatCard } from "@/components/examiner/viz/Card";
import { Flow, Pipeline } from "@/components/examiner/viz/Flow";
import { Table } from "@/components/examiner/viz/Matrix";
import { Ladder } from "@/components/examiner/viz/Stats";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { decision } from "@/data/examiner/decisions";
import {
  AWS_TOPOLOGY,
  FLY_TOPOLOGY,
  VERCEL_FLY_TOPOLOGY,
} from "@/data/examiner/diagrams";

export const metadata: Metadata = { title: "Deployment" };

export default function Page() {
  return (
    <Chapter href="/examiner/deployment">
      <Grid>
        <StatCard
          span={3}
          icon={Cloud}
          tone="blue"
          value={3}
          label="deployment topologies in this repository"
          sub="all real, none marked as live"
        />
        <StatCard
          span={3}
          icon={Package}
          tone="gold"
          value="244 MB"
          label="removed from the container image"
          sub="a CUDA runtime nothing was using"
          delta={{
            value: "−244 MB",
            direction: "down",
            good: true,
            title: "nvidia-nccl-cu13, uninstalled in the same layer",
          }}
        />
        <StatCard
          span={3}
          icon={ShieldCheck}
          tone="green"
          value={4}
          label="gates that must pass before a build"
          sub="CSP hash, ontology, data freshness, types"
        />
        <StatCard
          span={3}
          icon={TriangleAlert}
          tone="clay"
          value={3}
          label="known gaps between provisioned and wired"
          sub="stated below, not hidden"
        />
      </Grid>

      <Block
        title="Three topologies, and that is the honest answer"
        lede="Three complete deployment definitions, and nothing says which is live. All three are shown rather than the most flattering."
      >
        <Grid>
          <Card
            span={12}
            n="Fig. 10.1"
            title="What exists"
            icon={Cloud}
            tone="blue"
            source="fly.toml · research and plan/DEPLOY.md · terraform/"
            wide
          >
            <Table
              head={["Topology", "Defined in", "Shape", "Why it exists"]}
              numeric={[]}
              minWidth="50rem"
              rows={[
                {
                  cells: [
                    "Fly.io, single container",
                    "fly.toml",
                    "One machine in Mumbai (bom), 2 GB, a mounted volume",
                    "Fly builds from the working directory — the 64 MB of models are gitignored, so a push-based build cannot see them",
                  ],
                },
                {
                  cells: [
                    "Vercel + Fly",
                    "research and plan/DEPLOY.md",
                    "Site on Vercel, reading service on Fly",
                    "Splits the half that benefits from an edge CDN from the half that needs torch and Tesseract",
                  ],
                },
                {
                  cells: [
                    "AWS, full stack",
                    "terraform/",
                    "CloudFront → ALB → Fargate ARM64, agents on Lambda",
                    "The production-shaped answer: WAF, alarms, a budget, and durable storage",
                  ],
                },
              ]}
            />
            <p className="ex-caption mt-4 border-l-2 border-gold pl-3">
              Deliberately explicitly one machine on Fly. A second would run a
              second scheduler against the same volume, researching the same
              topics twice and billing the OpenAI key twice.
            </p>
          </Card>

          <Card
            span={6}
            n="Fig. 10.2"
            title="One — Fly.io, a single container"
            icon={Cloud}
            tone="gold"
            lede="Everything in one machine in Mumbai: the API, the models, the OCR binary and the research scheduler."
            source="fly.toml · backend/Dockerfile"
          >
            <Flow {...FLY_TOPOLOGY} rowHeight={144} maxWidth={720} />
          </Card>

          <Card
            span={6}
            n="Fig. 10.3"
            title="Two — Vercel for the site, Fly for the Python"
            icon={Cloud}
            tone="blue"
            lede="The same container, with the site lifted onto an edge CDN. The split is forced by one number, not chosen."
            source="research and plan/DEPLOY.md"
          >
            <Flow {...VERCEL_FLY_TOPOLOGY} rowHeight={134} maxWidth={720} />
          </Card>

          <Card
            span={7}
            n="Fig. 10.4"
            title="Three — the AWS stack"
            icon={Cloud}
            tone="blue"
            lede="Three origins, three behaviours. Only static assets are cached: a page carries a session and a per-request nonce."
            source="terraform/modules/"
            footnote={
              <Points
                items={[
                  "Two public subnets and no NAT gateway — about $32/month avoided",
                  "The ALB accepts only CloudFront's managed prefix list; the service group accepts only the ALB",
                ]}
              />
            }
          >
            <Flow {...AWS_TOPOLOGY} rowHeight={112} maxWidth={660} />
          </Card>

          <Card
            span={5}
            n="Fig. 10.5"
            title="Two images, on purpose"
            icon={Package}
            tone="gold"
            lede="The reading service needs torch and Tesseract; the agents need neither. One image for both would be a 900 MB Lambda."
            source="backend/Dockerfile · backend/Dockerfile.agents"
            wide
          >
            <Table
              head={["", "Reading service", "Agents"]}
              numeric={[]}
              minWidth="26rem"
              rows={[
                {
                  cells: [
                    "Base",
                    "python:3.14-slim",
                    "lambda/python:3.13-arm64",
                  ],
                },
                { cells: ["torch", "CPU wheels", "no"] },
                { cells: ["tesseract", "eng + mar", "no"] },
                { cells: ["Models copied in", "ML/models/", "no"] },
                {
                  cells: [
                    "Runs",
                    "uvicorn, 1 worker",
                    "EventBridge, every 30 min",
                  ],
                },
              ]}
            />
          </Card>

          <Card
            span={6}
            n="Fig. 10.6"
            title="Two packaging details that mattered"
            icon={Package}
            tone="gold"
            lede="Both are one-line changes that a review would skip over, and both were worth finding."
            source="backend/Dockerfile"
          >
            <Ladder
              format={(v) => `${v} MB`}
              steps={[
                {
                  label: "Image with the default torch install",
                  value: 244,
                  note: "a CUDA collective-communications runtime, on a CPU-only service",
                },
                {
                  label: "After uninstalling nvidia-nccl-cu13",
                  value: 0,
                  delta: -244,
                  note: "in the same layer — a later layer would not have shrunk the image",
                },
              ]}
              max={244}
            />
            <p className="ex-caption mt-4">
              And the wheels come from{" "}
              <code className="font-mono text-[13px]">--index-url</code> rather
              than{" "}
              <code className="font-mono text-[13px]">--extra-index-url</code>.
              With <code className="font-mono text-[13px]">--extra-</code>, pip
              resolves across both indexes and which torch you get is a coin
              toss; with{" "}
              <code className="font-mono text-[13px]">--index-url</code> it is
              the CPU build every time.
            </p>
          </Card>

          <Card
            span={6}
            n="Fig. 10.7"
            title="What has to pass before anything builds"
            icon={ShieldCheck}
            tone="green"
            lede="Four gates, each added after something failed quietly once."
            source="package.json · scripts/"
          >
            <Pipeline
              feedback="Each of these turns a silent production failure into a loud build failure. That is the only reason any of them exists."
              steps={[
                {
                  label: "check:csp-hash",
                  detail:
                    "The inline theme script's hash still matches the CSP",
                },
                {
                  label: "check:ontology",
                  detail:
                    "Every crop the engine can rank has a page to land on",
                },
                {
                  label: "check:examiner",
                  detail:
                    "No training artifact has changed without regenerating",
                },
                {
                  label: "tsc + next build",
                  detail: "Types, then a full static render of 68 routes",
                },
              ]}
            />
          </Card>

          <Card span={12} quiet>
            <Honest title="Three gaps between what is provisioned and what is wired">
              <ol className="flex list-decimal flex-col gap-2 pl-5">
                <li>
                  Terraform creates S3 buckets and DynamoDB tables for uploads,
                  documents and reports, and passes their names into the task
                  definition. No Python file reads those variables — the only
                  AWS-aware code in the backend is the rate limiter. The storage
                  module&rsquo;s own comment admits it: the service still writes
                  to local disk.
                </li>
                <li>
                  <code className="font-mono text-[13px]">boto3</code> is not in{" "}
                  <code className="font-mono text-[13px]">
                    backend/requirements.txt
                  </code>
                  . The DynamoDB rate-limit path would raise ImportError, which
                  is caught, which means it fails open. It is installed in the
                  agents image but not in the service image.
                </li>
                <li>
                  The Terraform README names{" "}
                  <code className="font-mono text-[13px]">
                    backend.agents.pipeline
                  </code>{" "}
                  as the Lambda entrypoint; the image actually runs{" "}
                  <code className="font-mono text-[13px]">
                    backend.agents.lambda_handler.handler
                  </code>
                  .
                </li>
              </ol>
            </Honest>
          </Card>

          <Card
            span={12}
            n="Fig. 10.8"
            title="Bringing it up"
            icon={Rocket}
            tone="slate"
            lede="The order matters in one place, and it is the place that fails silently."
            source="research and plan/DEPLOY.md"
            footnote={
              <Points
                tone="clay"
                items={[
                  "If AGROSENSE_API_KEY differs between the site and the reading service, every call returns 401",
                  "The site then shows 'your session expired' — the message is about Clerk, the cause is the shared key",
                  "They are set in two different places",
                ]}
              />
            }
          >
            <Pipeline
              steps={[
                {
                  label: "Deploy the reading service",
                  sub: "fly deploy",
                  detail: "It carries the models; it must be up first",
                },
                {
                  label: "Set its secrets",
                  detail: "API key, Clerk, OpenAI — on the service",
                },
                {
                  label: "Deploy the site",
                  sub: "vercel",
                  detail: "Pointing AGROSENSE_API_BASE at it",
                },
                {
                  label: "Set the same shared key",
                  detail: "No NEXT_PUBLIC_ prefix — the browser never uses it",
                },
                {
                  label: "Check /api/health",
                  detail:
                    "Without the key for the public half, with it for the rest",
                },
              ]}
            />
          </Card>

          <Card span={12} quiet>
            <DecisionCard decision={decision("fly-over-push-builds")} />
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
