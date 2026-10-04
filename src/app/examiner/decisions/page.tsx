import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Scale } from "lucide-react";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Points } from "@/components/examiner/viz/Figure";
import { Card, Grid, StatCard } from "@/components/examiner/viz/Card";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { DECISIONS } from "@/data/examiner/decisions";
import { CHAPTERS } from "@/data/examiner/chapters";

export const metadata: Metadata = { title: "The decision ledger" };

const chapterOf = (href: string) => CHAPTERS.find((c) => c.href === href);
const withCost = DECISIONS.filter((d) => d.cost).length;
const options = DECISIONS.reduce((a, d) => a + d.options.length, 0);

export default function Page() {
  return (
    <Chapter href="/examiner/decisions">
      <Grid>
        <StatCard
          span={4}
          icon={Scale}
          tone="gold"
          value={DECISIONS.length}
          label="decisions recorded"
          sub="one from each chapter, at least"
        />
        <StatCard
          span={4}
          icon={Scale}
          tone="blue"
          value={options}
          label="options weighed"
          sub="each with what it actually measured"
        />
        <StatCard
          span={4}
          icon={Scale}
          tone="clay"
          value={`${withCost}/${DECISIONS.length}`}
          label="decisions with a stated cost"
          sub="a ledger with no costs in it is a sales document"
        />
      </Grid>

      <Block
        title="Every decision, with what it cost"
        lede="The cards that close each chapter, collected. The shape is fixed so an empty cost field shows as a gap, not as a confident sentence."
      >
        <Grid>
          {DECISIONS.map((d) => {
            const ch = chapterOf(d.chapter);
            return (
              <div
                key={d.id}
                className="flex flex-col gap-2 md:col-span-6 lg:col-span-6"
              >
                {ch ? (
                  <Link
                    href={`${d.chapter}#${d.id}`}
                    className="ex-num inline-flex items-center gap-1.5 hover:underline"
                  >
                    {ch.n !== null ? `Chapter ${ch.n} · ` : ""}
                    {ch.short}
                    <ArrowUpRight className="size-3" aria-hidden />
                  </Link>
                ) : null}
                <DecisionCard decision={d} />
              </div>
            );
          })}
        </Grid>
      </Block>

      <Block
        title="Decisions this walkthrough made about itself"
        lede="The presentation is engineering too, and the same standard applies to it."
      >
        <Grid>
          <Card
            span={6}
            n="Meta 1"
            title="Why there is no radar chart"
            icon={Scale}
            tone="gold"
            lede="The engine scorecard has eleven weighted criteria, which is exactly the shape people reach for a spider chart to draw."
            source="src/components/examiner/viz/ScoreBars.tsx"
          >
            <Points
              items={[
                "A radar encodes magnitude as area: 0.5 draws at a quarter of 1.0, so every reading is wrong by a square",
                "Axis order is arbitrary, so the shape is an artefact of the order someone listed the criteria in",
                "Two of the eleven were never measured — a radar can only drop that axis or plot it at zero",
                "Weighted bars show an empty dashed track, which is the truth",
              ]}
            />
          </Card>

          <Card
            span={6}
            n="Meta 2"
            title="Why no charting library"
            icon={Scale}
            tone="blue"
            lede="recharts is installed in this project and has zero imports. That is deliberate, and it stayed that way."
            source="src/components/examiner/viz/geom.ts"
          >
            <p className="text-[15px] leading-relaxed text-ink-soft">
              Two reasons beyond house style. It is client-only, so all
              forty-odd figures here would ship a chart library into a bundle
              where the server currently ships nothing. And its geometry comes
              from d3-scale as unrounded floats — which is precisely the drift
              that made an existing component in this codebase fail hydration,
              because Node and Chrome disagree with each other on the last bits
              of <code className="font-mono text-[13px]">Math.sin</code>. Every
              figure in this section is hand-rolled and quantised to three
              decimals for that reason.
            </p>
          </Card>

          <Card
            span={12}
            n="Meta 3"
            title="Why every figure prints a file path"
            icon={Scale}
            tone="green"
            lede="The line under each chart is the artifact it was read from."
            source="scripts/build-examiner-data.mjs"
            footnote="check:examiner fails if an artifact changes without the data modules being regenerated, and passes on a clean clone where the artifacts are absent."
          >
            <Points
              items={[
                "No number here is invented — the first rule the project holds itself to",
                "Every figure prints the path of the file it came from, so anyone can ask for that file",
                "A generator reads the artifacts and emits typed modules; nothing was transcribed by hand",
                "The QA sweep counts any card without a source line as a failure",
              ]}
            />
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
