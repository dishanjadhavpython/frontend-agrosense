import type { Metadata } from "next";
import { Plug, ShoppingCart, Globe, KeyRound, ShieldAlert } from "lucide-react";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Honest, Points } from "@/components/examiner/viz/Figure";
import { Card, Grid, StatCard } from "@/components/examiner/viz/Card";
import { Flow, Pipeline } from "@/components/examiner/viz/Flow";
import { Table } from "@/components/examiner/viz/Matrix";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { decision } from "@/data/examiner/decisions";
import { MCP_FANOUT, MCP_ROUNDTRIP } from "@/data/examiner/diagrams";

export const metadata: Metadata = {
  title: "MCP: how the agents reach the internet",
};

const SERVERS = [
  [
    "web_search",
    "agrosense-web-search",
    "DuckDuckGo via ddgs",
    "none",
    "Up to 10 results: title, url, snippet",
  ],
  [
    "fetch_url",
    "agrosense-fetch",
    "httpx + lxml",
    "none",
    "Readable text, script/nav stripped, truncated at 6,000 chars",
  ],
  [
    "search_youtube",
    "agrosense-youtube",
    "YouTube Data API v3",
    "YOUTUBE_API_KEY",
    "Up to 5 results, safeSearch strict",
  ],
  [
    "mandi_prices",
    "agrosense-mandi-prices",
    "data.gov.in Agmarknet",
    "DATA_GOV_IN_API_KEY",
    "Rs/quintal min, max, modal, market, arrival date",
  ],
  [
    "buy_links",
    "agrosense-sellers",
    "ddgs, site-restricted",
    "none",
    "At most 4 verified links, one per seller",
  ],
];

export default function Page() {
  return (
    <Chapter href="/examiner/mcp">
      <Grid>
        <StatCard
          span={3}
          icon={Plug}
          tone="gold"
          value={5}
          label="MCP servers"
          sub="stdio subprocesses, spawned per run"
        />
        <StatCard
          span={3}
          icon={Globe}
          tone="blue"
          value={1}
          label="of four agents has tools"
          sub="Planner, Creator and Reviewer have none"
        />
        <StatCard
          span={3}
          icon={ShoppingCart}
          tone="clay"
          value={7}
          label="domains a shop link may come from"
          sub="and each candidate is then fetched to verify"
        />
        <StatCard
          span={3}
          icon={KeyRound}
          tone="slate"
          value={5}
          label="environment variables a subprocess inherits"
          sub="HOME, LOGNAME, PATH, SHELL, USER"
        />
      </Grid>

      <Block
        title="What MCP is, in two sentences"
        lede="MCP is a standard way to hand a model tools. Each tool set here is a separate Python process, spoken to over stdio."
      >
        <Grid>
          <Card
            span={7}
            n="Fig. 9.1"
            title="The fan-out"
            icon={Plug}
            tone="gold"
            lede="All five open together or not at all, and only the Research agent gets them."
            source="backend/agents/research.py · backend/agents/mcp_servers/"
            footnote={
              <Points
                items={[
                  "Launched as python -m backend.agents.mcp_servers.<name>, 90-second session timeout",
                  "Processes, not libraries — a hung fetch is killed without taking the service with it",
                  "The other three agents get no tools: a writer with a search box researches instead of writing",
                ]}
              />
            }
          >
            <Flow {...MCP_FANOUT} rowHeight={116} maxWidth={660} />
          </Card>

          <Card
            span={5}
            n="Fig. 9.2"
            title="The five servers"
            lede="Four hand the agent something to read. The fifth hands it places to spend money, and is built differently."
            source="backend/agents/mcp_servers/"
            wide
          >
            <Table
              head={["Tool", "Upstream", "Key"]}
              numeric={[]}
              minWidth="28rem"
              rows={SERVERS.map(([tool, , upstream, key, gives]) => ({
                cells: [tool, upstream, key === "none" ? "—" : key],
                note: gives,
              }))}
            />
          </Card>

          <Card
            span={12}
            n="Fig. 9.3"
            title="How a shop link is allowed to exist"
            icon={ShoppingCart}
            tone="clay"
            lede="Four gates, only the first a search. The agent never sees what was rejected, so it cannot argue past it."
            source="backend/agents/mcp_servers/seller_server.py · backend/agents/reviewer.py"
            footnote={
              <Points
                items={[
                  "Matched by suffix on urlparse().hostname — notbighaat.com and bighaat.com.evil.ru both fail",
                  "The reviewer applies the same function again, to the finished report",
                ]}
              />
            }
          >
            <Pipeline
              feedback="A link that passes all four still carries no price and no endorsement. The engine's own prices come from eight hard-coded indicative rates — see chapter 2."
              steps={[
                {
                  label: "Search, restricted",
                  sub: "site: filter",
                  detail: "Seven allowlisted sellers only",
                },
                {
                  label: "Fetch each candidate",
                  detail: "It has to return 200 and have a title",
                },
                {
                  label: "Re-check the final URL",
                  detail: "After redirects, still on the allowlist",
                },
                {
                  label: "At most four, one per seller",
                  detail: "No seller can fill the list",
                },
                {
                  label: "Checked again by the reviewer",
                  detail: "Same function, on the finished report",
                },
              ]}
            />
          </Card>

          <Card
            span={12}
            n="Fig. 9.4"
            title="One tool call, end to end"
            icon={KeyRound}
            tone="slate"
            lede="A child process receives HOME, LOGNAME, PATH, SHELL and USER — nothing else. Both keyed servers therefore read from the config module."
            source="backend/agents/research.py · backend/agents/mcp_servers/mandi_price_server.py"
            footnote={
              <Points
                tone="clay"
                items={[
                  "Fails silently: the tool returns 'no data', the agent writes around the gap, the report looks fine",
                  "mandi_prices reports unavailable in this checkout — the data.gov.in key is not set",
                ]}
              />
            }
          >
            <Flow {...MCP_ROUNDTRIP} rowHeight={116} maxWidth={1000} />
          </Card>

          <Card
            span={12}
            n="Fig. 9.5"
            title="What these tools cannot do"
            icon={ShieldAlert}
            tone="clay"
            lede="Stated because an examiner will find them faster than the strengths."
            source="backend/agents/mcp_servers/fetch_server.py"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [
                  "No headless browser",
                  "fetch_url is httpx plus lxml. A single-page application returns nothing useful, and several state agriculture portals are exactly that.",
                ],
                [
                  "6,000 characters per page",
                  "A long extension bulletin is truncated, and the agent cannot tell what it lost.",
                ],
                [
                  "Search is DuckDuckGo",
                  "No ranking control and no guarantee a tier-1 source appears at all for a given crop.",
                ],
                [
                  "No price data without a key",
                  "The mandi server reports unavailable rather than estimating.",
                ],
              ].map(([t, why]) => (
                <div key={t}>
                  <p className="text-[14px] font-semibold text-ink">{t}</p>
                  <p className="ex-caption mt-0.5">{why}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card span={12} quiet>
            <DecisionCard decision={decision("seller-allowlist")} />
          </Card>

          <Card span={12} quiet>
            <Honest title="These servers only run when a key is present">
              The whole agent subsystem, and with it all five MCP servers, is
              disabled without an OpenAI key. On a machine without one the
              reference pages serve their committed editorial content and
              nothing here executes. What is shown in this chapter is the code
              path, not a live run.
            </Honest>
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
