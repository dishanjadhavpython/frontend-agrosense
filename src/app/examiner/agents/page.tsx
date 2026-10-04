import type { Metadata } from "next";
import {
  Bot,
  Filter,
  Clock,
  Scissors,
  RotateCcw,
  ListOrdered,
} from "lucide-react";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Honest, Points } from "@/components/examiner/viz/Figure";
import {
  Card,
  Grid,
  StatCard,
  ProgressRow,
} from "@/components/examiner/viz/Card";
import { Flow } from "@/components/examiner/viz/Flow";
import { Table } from "@/components/examiner/viz/Matrix";
import { Ring } from "@/components/examiner/viz/Ring";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { decision } from "@/data/examiner/decisions";
import { AGENT_PIPELINE, AGENT_TRIGGERS } from "@/data/examiner/diagrams";

export const metadata: Metadata = {
  title: "Four agents and their orchestration",
};

const TIERS = [
  {
    tier: "1 · Authoritative",
    domains: "*.gov.in, *.nic.in, agmarknet, enam, ICAR, mahaagri",
    tone: "green" as const,
  },
  {
    tier: "2 · Institutional",
    domains: "*.ac.in, *.edu.in, *.res.in, MPKV, PDKV, VNMKV, KVK",
    tone: "blue" as const,
  },
  {
    tier: "3 · Media",
    domains: "krishijagran, agrifarming.in, downtoearth, ruralvoice",
    tone: "gold" as const,
  },
  {
    tier: "9 · Rejected",
    domains: "everything else — including every non-Indian domain",
    tone: "clay" as const,
  },
];

export default function Page() {
  return (
    <Chapter href="/examiner/agents">
      <Grid>
        <StatCard
          span={3}
          icon={Bot}
          tone="blue"
          value={4}
          label="agents, run in sequence"
          sub="Planner, Research, Creator, Reviewer"
        />
        <StatCard
          span={3}
          icon={Clock}
          tone="slate"
          value={30}
          label="minutes between sweeps"
          sub="plus an on-demand queue"
        />
        <StatCard
          span={3}
          icon={Filter}
          tone="green"
          value={4}
          label="source tiers"
          sub="tier 9 is everything else"
        />
        <StatCard
          span={3}
          icon={RotateCcw}
          tone="gold"
          value={1}
          label="revision, at most"
          sub="then it ships flagged, not blocked"
        />
      </Grid>

      <Block
        title="What the agents are for"
        lede="Thirty-seven reference pages, kept current by four agents — and only for the topics a real prediction has named."
      >
        <Grid>
          <Card
            span={6}
            n="Fig. 8.1"
            title="The chain"
            icon={Bot}
            tone="blue"
            lede="Sequential, not a graph. One Planner call per batch; each topic then runs the same chain, with one revision loop."
            source="backend/agents/pipeline.py"
            footnote={
              <Points
                items={[
                  "process_topic never raises: a failure is recorded against that topic, so one bad subject cannot take down the batch",
                  "A report the Reviewer would not approve is still saved, flagged needs_review, not thrown away",
                ]}
              />
            }
          >
            <Flow {...AGENT_PIPELINE} rowHeight={118} maxWidth={620} />
          </Card>

          <Card
            span={6}
            n="Fig. 8.2"
            title="The rules the queue runs on"
            icon={ListOrdered}
            tone="slate"
            lede="Soil, then crops by rank, then fertilisers — not alphabetical, so what the farmer is looking at is researched first."
            source="backend/agents/demand.py · backend/agents/queue.py"
          >
            <Table
              head={["Rule", "Value"]}
              numeric={[1]}
              minWidth="26rem"
              rows={[
                {
                  cells: ["Topics per sweep", 6],
                  note: "ranked: never-researched first, then most-demanded, then oldest",
                },
                {
                  cells: ["Report considered fresh for", "8 h"],
                  note: "a topic inside that window is skipped",
                },
                {
                  cells: ["Concurrent on-demand runs", 3],
                  note: "beyond that, 'queue full, left for the sweep'",
                },
                {
                  cells: ["Sweep interval", "30 min"],
                  note: "coalesced, max one instance",
                },
                {
                  cells: ["Topics researched before any prediction", 0],
                  note: "the ledger starts empty",
                },
              ]}
            />
            <p className="ex-caption mt-4">
              The whole queueing call is wrapped in a bare except. A failure to
              start background research must never turn a good prediction into a
              500.
            </p>
          </Card>

          <Card
            span={12}
            n="Fig. 8.3"
            title="What starts a research run"
            icon={Clock}
            tone="blue"
            lede="Nothing is researched speculatively. A prediction records demand, and both paths out of the ledger reach the same chain."
            source="backend/agents/demand.py · backend/agents/queue.py · backend/agents/scheduler.py"
            footnote="The ledger starts empty. On a fresh deployment every reference page serves its committed editorial content until the first prediction."
          >
            <Flow {...AGENT_TRIGGERS} rowHeight={108} maxWidth={980} />
          </Card>

          <Card
            span={7}
            n="Fig. 8.4"
            title="Which sources an agent is allowed to cite"
            icon={Filter}
            tone="green"
            lede="A four-tier domain classifier, applied in code. Tier 9 is not a low score — it is a deletion."
            source="backend/agents/sources.py"
            wide
            footnote="Every non-Indian domain is rejected outright. A sowing window from another hemisphere is wrong advice, and an agent will not notice mid-sentence."
          >
            <Table
              head={["Tier", "Domains"]}
              numeric={[]}
              minWidth="34rem"
              rows={TIERS.map((t) => ({
                cells: [t.tier, t.domains],
                chosen: t.tier.startsWith("1"),
                rejected: t.tier.startsWith("9"),
              }))}
            />
          </Card>

          <Card
            span={5}
            n="Fig. 8.5"
            title="Stripping is code, not a prompt"
            icon={Scissors}
            tone="clay"
            lede="Three classes of claim are deleted before the Reviewer ever sees the draft."
            source="backend/agents/reviewer.py"
          >
            <div className="flex flex-col gap-3">
              {[
                [
                  "Government schemes with no tier-1 URL",
                  "A scheme is a promise of money. An expired one reaching a farmer is a real cost.",
                ],
                [
                  "Any source outside India",
                  "Rejected by domain, not by judgement.",
                ],
                [
                  "Shop links off the allowlist",
                  "Re-checked here even though the tool already filtered them.",
                ],
              ].map(([t, why]) => (
                <div key={t}>
                  <p className="text-[14px] font-semibold text-ink">{t}</p>
                  <p className="ex-caption mt-0.5">{why}</p>
                </div>
              ))}
            </div>
            <p className="ex-caption mt-4 border-l-2 border-clay pl-3">
              A model asked to self-censor will sometimes decide a scheme is
              well known enough to keep — and &ldquo;well known&rdquo; is
              exactly how an expired subsidy reaches a farmer.
            </p>
          </Card>

          <Card
            span={5}
            n="Fig. 8.6"
            title="The turn budget"
            icon={RotateCcw}
            tone="gold"
            lede="Research has a soft budget of about twelve tool calls and a hard ceiling of thirty turns."
            source="backend/agents/research.py"
          >
            <Ring
              size={148}
              centre={{ value: 30, label: "hard ceiling" }}
              segments={[
                { label: "Typical run", value: 12, tone: "gold" },
                {
                  label: "Headroom before the salvage write-up",
                  value: 18,
                  tone: "slate",
                },
              ]}
            />
            <p className="ex-caption mt-4">
              Exceeding it does not lose the run. The overrun handler re-runs
              the agent with no tools over the transcript it already has and
              writes up what was found — the money is spent either way.
            </p>
          </Card>

          <Card
            span={7}
            n="Fig. 8.7"
            title="What actually reaches the page"
            icon={Bot}
            tone="blue"
            lede="Reports are served from disk. The insights endpoint never researches inside a request."
            source="backend/app.py · backend/agents/storage.py"
          >
            <ProgressRow
              rows={[
                { label: "Agents with tools", value: 1, of: 4, tone: "gold" },
                { label: "Revisions allowed", value: 1, of: 1, tone: "slate" },
                {
                  label: "Reports served from cache",
                  value: 1,
                  of: 1,
                  tone: "green",
                },
              ]}
            />
            <p className="ex-caption mt-4">
              A page whose report is stale or missing shows that it is being
              researched and polls every fifteen seconds. It never blocks on an
              agent run, and it never shows a half-written report.
            </p>
          </Card>

          <Card span={12} quiet>
            <DecisionCard decision={decision("strip-in-code")} />
          </Card>

          <Card span={12} quiet>
            <Honest title="The whole subsystem no-ops without an API key">
              AGENTS_ENABLED defaults to whether an OpenAI key is present. With
              no key the sweep writes status &ldquo;skipped&rdquo; and returns,
              every reference page falls back to its committed editorial
              content, and the product works. That is by design — but it does
              mean the agent output an examiner sees depends on whether the key
              is set on the machine it is running on.
            </Honest>
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
