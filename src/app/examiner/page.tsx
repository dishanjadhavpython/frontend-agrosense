import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Target,
  Images,
  Map,
  FileCheck2,
  ClipboardCheck,
} from "lucide-react";
import { CHAPTERS, CONTENTS } from "@/data/examiner/chapters";
import { Card, Grid, StatCard } from "@/components/examiner/viz/Card";
import { LogoLockup } from "@/components/site/Logo";
import { BuiltMark } from "@/components/examiner/BuiltMark";
import { Table } from "@/components/examiner/viz/Matrix";
import { Points } from "@/components/examiner/viz/Figure";
import { StackedBar } from "@/components/examiner/viz/Distribution";
import { SOURCE_FILES, GENERATED_AT } from "@/data/examiner/generated/manifest";
import { SOIL_MODEL } from "@/data/examiner/generated/soilModel";
import { SCORECARD } from "@/data/examiner/generated/engine";
import { SCRAPED_FILES } from "@/data/examiner/generated/scrapers";

export const metadata: Metadata = {
  title: { absolute: "How AgroSense is built" },
};

/**
 * The cover.
 *
 * Not a `<Chapter>`: this page has no number, no prev, and its job is different
 * from the ten that follow — it is the running order an examiner is handed at
 * the start, and the thing to return to when they ask about something out of
 * sequence.
 *
 * It also carries the provenance table, which is the page's real argument. Every
 * figure in the walkthrough prints the file it came from; this is the index of
 * those files with a hash beside each, so "check it against the repository" is
 * an instruction an examiner can actually follow.
 */

const present = SOURCE_FILES.filter((f) => f.exists);
const bytes = present.reduce((a, f) => a + (f.bytes ?? 0), 0);
const talukas =
  SCRAPED_FILES.filter((g) => g.group === "Soil Health Card").at(-1)?.rows ??
  351;
const ROOTS = [
  { key: "ML/", label: "Trained image models", tone: "gold" as const },
  {
    key: "ml engine for Recommendation/",
    label: "Engine artifacts and reports",
    tone: "blue" as const,
  },
  {
    key: "scrape data imp/",
    label: "Scraped government data",
    tone: "green" as const,
  },
];

export default function ExaminerIndex() {
  const chapters = CHAPTERS.filter((c) => c.href !== CONTENTS.href);

  return (
    <div className="py-10 md:py-14">
      {/* The cover is the one page that introduces the product rather than
          labelling it, so the full lockup appears here and nowhere else. */}
      <header className="flex max-w-4xl flex-col gap-7 md:flex-row md:items-center md:gap-9">
        <LogoLockup className="shrink-0 self-start shadow-card" />
        <div className="min-w-0">
          <BuiltMark size="lg" />
          <h1 className="ex-title mt-4">{CONTENTS.title}</h1>
          <p className="ex-lede mt-5 max-w-2xl">
            A soil-testing product for Maharashtra farmers: photograph a Soil
            Health Card, get back the crops worth sowing and the fertiliser to
            buy. Ten chapters on how that works.
          </p>
        </div>
      </header>

      <div className="mt-10 md:mt-12">
        <Grid>
          <StatCard
            span={3}
            icon={ClipboardCheck}
            tone="gold"
            value={SCORECARD.composite.toFixed(2)}
            unit="/ 10"
            label="engine scorecard"
            sub={`${SCORECARD.gates.filter((g) => g.pass).length}/${SCORECARD.gates.length} hard gates pass`}
            delta={{
              value: `+${(SCORECARD.composite - SCORECARD.history[0].composite).toFixed(2)}`,
              direction: "up",
              good: true,
              title: `from ${SCORECARD.history[0].composite.toFixed(2)}`,
            }}
          />
          <StatCard
            span={3}
            icon={Target}
            tone="green"
            value={SOIL_MODEL.arms
              .find((a) => a.chosen)!
              .macroF1.toFixed(4)}
            label="soil classifier, macro-F1"
            sub={`${SOIL_MODEL.dataset.classes.length} classes · CV grouped by scene`}
          />
          <StatCard
            span={3}
            icon={Images}
            tone="blue"
            value={SOIL_MODEL.dataset.distinctScenes}
            label="distinct scenes after de-duplication"
            sub={`from ${SOIL_MODEL.dataset.filesScanned.toLocaleString("en-IN")} delivered files`}
          />
          <StatCard
            span={3}
            icon={Map}
            tone="slate"
            value={talukas}
            label="talukas with Soil Health Card coverage"
            sub="across 34 districts"
          />
        </Grid>
      </div>

      <nav aria-label="Chapters" className="mt-14 md:mt-16">
        <p className="ex-source tracking-wider uppercase">Running order</p>
        <ol className="mt-4 border-t border-line">
          {chapters.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="group flex items-baseline gap-4 border-b border-line py-5 transition-colors hover:bg-sunk md:gap-6 md:py-6"
              >
                <span className="w-6 shrink-0 text-right font-mono text-[13px] tabular-nums text-gold md:w-8">
                  {c.n ?? "—"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="ex-head block">{c.title}</span>
                  <span className="ex-caption mt-1.5 block max-w-xl">
                    {c.lede}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="mt-1 size-4 shrink-0 text-ink-mute transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <section className="mt-16 md:mt-20">
        <header className="max-w-2xl">
          <h2 className="ex-head">
            Where every number on these pages came from
          </h2>
          <p className="ex-lede mt-3 text-[1.0625rem]">
            Each figure prints the file it was read from. This is the index of
            those files, with the size and hash recorded when the walkthrough
            was generated.
          </p>
        </header>

        <div className="mt-6">
          <Grid>
            <Card
              span={5}
              n="Provenance"
              title="What was read"
              icon={FileCheck2}
              tone="gold"
              lede={`${present.length} artifact files, ${(bytes / 1e6).toFixed(1)} MB, read once and aggregated into committed TypeScript. The build fails if any of them changes without the modules being regenerated.`}
              source="scripts/build-examiner-data.mjs"
              at={`generated ${GENERATED_AT}`}
              footnote={
                <Points
                  items={[
                    "None of these is read at build time — they are gitignored or untracked",
                    "The generator runs on demand and commits its output, so a clean clone builds",
                    "npm run check:examiner compares the hashes when the files are present",
                  ]}
                />
              }
            >
              <StackedBar
                unit=" files"
                segments={ROOTS.map((r) => ({
                  label: r.label,
                  value: present.filter((f) => f.path.startsWith(r.key)).length,
                  tone: r.tone,
                }))}
              />
            </Card>

            <Card
              span={7}
              n="Provenance"
              title="Every source file, with its hash"
              source="src/data/examiner/generated/manifest.ts"
              wide
            >
              <div className="hide-scrollbar max-h-[28rem] overflow-y-auto">
                <Table
                  head={["File", "Bytes", "sha256", "Modified"]}
                  numeric={[1]}
                  minWidth="40rem"
                  rows={SOURCE_FILES.map((f) => ({
                    cells: [
                      f.path,
                      f.bytes === null ? "—" : f.bytes.toLocaleString("en-IN"),
                      f.sha256 ?? "not in this checkout",
                      f.modified ?? "—",
                    ],
                    rejected: !f.exists,
                  }))}
                />
              </div>
            </Card>
          </Grid>
        </div>
      </section>
    </div>
  );
}
