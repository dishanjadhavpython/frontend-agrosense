import type { Metadata } from "next";
import {
  Layers,
  ShieldBan,
  Sparkles,
  Target,
  Gauge,
  ClipboardCheck,
} from "lucide-react";
import type { ReportTable } from "@/data/examiner/types";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Honest, Points } from "@/components/examiner/viz/Figure";
import {
  Card,
  Grid,
  StatCard,
  ProgressRow,
} from "@/components/examiner/viz/Card";
import { Flow, Pipeline } from "@/components/examiner/viz/Flow";
import { BarRow } from "@/components/examiner/viz/Bars";
import { Trend } from "@/components/examiner/viz/Distribution";
import { Ladder } from "@/components/examiner/viz/Stats";
import {
  ScoreBars,
  ReportTableView,
} from "@/components/examiner/viz/ScoreBars";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { decision } from "@/data/examiner/decisions";
import { SCORECARD, ENGINE_TABLES } from "@/data/examiner/generated/engine";
import { ENGINE_VETO } from "@/data/examiner/diagrams";

export const metadata: Metadata = { title: "The recommendation engine" };

const table = (heading: string): ReportTable =>
  ENGINE_TABLES.find((t) => t.heading === heading)! as ReportTable;

const mirage = table("The headline number is a mirage");
const protocols = table("Why GroupKFold by district is not optional");
const ablation = table("§7.1 Feature block ablation");
const rejected = table("§7.1 Blocks the n=34 constraint rejects");
const served = table("Ranking as served — forward chaining");
const gate = table("Does the gate agree with practice?");
const conformal = table("§5.4 Conformal calibration");

const gatesPassed = SCORECARD.gates.filter((g) => g.pass).length;

/** Column `i` of a parsed report row, as a number. */
const cell = (r: readonly (string | number)[], i: number) => Number(r[i]);

// The composite is a weighted mean over the criteria that were measured, so the
// gap to a target is not the sum of the bars — it is that sum divided by the
// measured weight. Both numbers are stated on the figure, because quoting
// "1.53 points" beside a chart whose bars total 18.28 invites exactly the
// question this page exists to answer.
const TARGET = 9.5;
const measured = SCORECARD.subScores.filter((s) => s.score !== null);
const measuredWeight = measured.reduce((a, s) => a + s.weight, 0);
const pointsAvailable =
  Math.round(
    measured.reduce((a, s) => a + (10 - s.score!) * s.weight, 0) * 100,
  ) / 100;
const pointsNeeded =
  Math.round((TARGET - SCORECARD.composite) * measuredWeight * 100) / 100;

export default function Page() {
  return (
    <Chapter href="/examiner/engine">
      <Grid>
        <StatCard
          span={3}
          icon={Layers}
          tone="blue"
          value="351 × 311"
          label="the feature store"
          sub="talukas by columns, five datasets fused"
        />
        <StatCard
          span={3}
          icon={Target}
          tone="gold"
          value={SCORECARD.composite.toFixed(2)}
          label="engine scorecard, out of 10"
          sub={`${gatesPassed}/${SCORECARD.gates.length} hard gates pass`}
          delta={{
            value: `+${(SCORECARD.composite - SCORECARD.history[0].composite).toFixed(2)}`,
            direction: "up",
            good: true,
            title: `from ${SCORECARD.history[0].composite.toFixed(2)} at ${SCORECARD.history[0].label}`,
          }}
        />
        <StatCard
          span={3}
          icon={ShieldBan}
          tone="green"
          value="6.39×"
          label="more likely to be planted if the gate calls it suitable"
          sub="20,672 district-crop-season cells"
        />
        <StatCard
          span={3}
          icon={Gauge}
          tone="clay"
          value="0.191"
          label="the honest yield R²"
          sub="the flattering number was 0.822"
        />
      </Grid>

      <Block
        title="Six stages, and the one sentence that describes them"
        lede="Learned models propose; hand-written agronomy vetoes. Neither half is trusted to do the other's job."
      >
        <Grid>
          <Card
            span={7}
            n="Fig. 7.1"
            title="S0 to S4"
            icon={Layers}
            tone="blue"
            lede="A ranker orders crops, a rules gate removes what cannot grow there, and the fertiliser plan comes from a government table."
            source="ml engine for Recommendation/src/pipeline.py"
            footnote={
              <Points
                items={[
                  "S4 depends on S1's choice but not its confidence — fertiliser advice stays exact when crop advice is not",
                  "The one back-edge that matters is S2 vetoing S1: the gate removes a crop the ranker put first, and does",
                ]}
              />
            }
          >
            <Pipeline
              feedback="S2 can veto what S1 proposed. The engine's own summary of itself is 'S1 proposes, S2 vetoes' — the learned half is never allowed the last word on whether a crop can grow."
              steps={[
                {
                  label: "Feature store",
                  sub: "S0",
                  detail: "351 talukas × 311 columns",
                },
                {
                  label: "LambdaMART ranker",
                  sub: "S1 · learned",
                  tone: "blue",
                  badge: "learned",
                  detail: "Orders ~28 candidate crops",
                },
                {
                  label: "Agronomic gate",
                  sub: "S2 · rules",
                  tone: "green",
                  badge: "rules",
                  detail: "Suitability classes and hard vetoes",
                },
                {
                  label: "Blend, conformal, OOD",
                  sub: "S5 · hybrid",
                  tone: "gold",
                  badge: "hybrid",
                  detail: "How much to trust this taluka",
                },
                {
                  label: "Quantile yield",
                  sub: "S3 · learned",
                  tone: "blue",
                  badge: "learned",
                  detail: "p10 / p50 / p90 band",
                },
                {
                  label: "Fertiliser plan",
                  sub: "S4 · lookup",
                  tone: "green",
                  badge: "lookup",
                  detail: "Exact government dose table",
                },
              ]}
            />
          </Card>

          <Card
            span={5}
            n="Fig. 7.2"
            title="S1 proposes, S2 vetoes"
            icon={ShieldBan}
            tone="green"
            lede="The one back-edge that matters, drawn. The learned half never has the last word on whether a crop can physically grow in a taluka."
            source="ml engine for Recommendation/src/pipeline.py"
          >
            <Flow {...ENGINE_VETO} rowHeight={132} maxWidth={640} />
          </Card>
        </Grid>
      </Block>

      <Block
        title="The headline number was a mirage"
        lede="The first version of this engine reported an R² of 0.822 on yield. That number was real, reproducible, and meaningless."
      >
        <Grid>
          <Card
            span={6}
            n="Fig. 7.3"
            title="What the 0.822 was actually measuring"
            icon={Sparkles}
            tone="clay"
            lede="Crop and season identity alone — no soil, no weather — scores almost as well. It had learned sugarcane out-yields gram: true, and useless."
            source={mirage.source}
            at={mirage.heading}
            wide
          >
            <ReportTableView
              table={mirage}
              highlight={["Within-crop z-scored yield"]}
            />
            <p className="ex-caption mt-4">
              Reported since as within-crop z-scored R²: how well the engine
              predicts whether <em>this</em> district will do better or worse
              than average <em>for that crop</em>. That is the question a farmer
              is actually asking.
            </p>
          </Card>

          <Card
            span={6}
            n="Fig. 7.4"
            title="And the protocol was doing work too"
            icon={ShieldBan}
            tone="clay"
            lede="One model and one feature set, scored four ways. Districts are autocorrelated, so a random split leaks neighbours across the fold."
            source={protocols.source}
            at={protocols.heading}
            wide
            footnote={
              <Points
                items={[
                  "Spatial block CV at 0.053 is the harshest reading, and the honest one for a district far from any in training",
                  "GroupKFold by district is what the engine reports against, stated every time",
                ]}
              />
            }
          >
            <BarRow
              labelWidth="lg"
              format={(v) => v.toFixed(3)}
              rows={protocols.rows.map((r) => {
                const label = String(r[0]);
                const leaks = label.startsWith("Random");
                const reported = label.startsWith("GroupKFold");
                return {
                  label: label.replace(/\s*\(.*\)$/, ""),
                  sub: (label.match(/\((.*)\)$/)?.[1] ?? "").toLowerCase(),
                  value: cell(r, 1),
                  tone: leaks
                    ? ("clay" as const)
                    : reported
                      ? ("gold" as const)
                      : ("mute" as const),
                };
              })}
            />
            <p className="ex-caption mt-4">
              Same model, same features, four ways of deciding what counts as
              held out. The leftmost bar is the one that would have been
              reported by a project that did not ask this question.
            </p>
          </Card>

          <Card
            span={7}
            n="Fig. 7.5"
            title="Where the signal actually comes from"
            icon={Layers}
            tone="green"
            lede="Blocks added one at a time, same protocol throughout. The Soil Health Card does most of the work."
            source={ablation.source}
            at={ablation.heading}
            wide
          >
            <ReportTableView
              table={ablation}
              highlight={["+ Agronomic interactions"]}
            />
          </Card>

          <Card
            span={5}
            n="Fig. 7.6"
            title="And what was tried and dropped"
            lede="Two blocks that sounded right and measured worse. Both are kept on the record; neither is in the engine."
            source={rejected.source}
            at={rejected.heading}
            wide
            footnote="With 34 districts, a difference of 0.01 or less cannot be told from chance. Both fall inside that, and both were rejected rather than adopted."
          >
            <ReportTableView
              table={rejected}
              highlight={["Best set"]}
              rejected={["+ Spatial kNN smoothing", "+ Contextual z-scores"]}
            />
          </Card>
        </Grid>
      </Block>

      <Block
        title="Does the rules half earn its place?"
        lede="The gate is hand-written, not learned — defensible only if it agrees with what farmers actually do."
      >
        <Grid>
          <Card
            span={6}
            n="Fig. 7.7"
            title="Suitability class against what was actually planted"
            icon={ShieldBan}
            tone="green"
            lede="20,672 district-crop-season cells. A crop the gate calls highly suitable is planted 79% of the time; one it rejects, 11%."
            source={gate.source}
            at={gate.heading}
            wide
          >
            <BarRow
              max={1}
              labelWidth="lg"
              format={(v) => `${(v * 100).toFixed(1)}%`}
              rows={gate.rows.map((r) => {
                const klass = String(r[0]);
                return {
                  label:
                    klass === "N"
                      ? "N — rejected by the gate"
                      : `${klass} — ${klass === "S1" ? "highly " : ""}suitable`,
                  sub: `${cell(r, 1).toLocaleString("en-IN")} district-crop-season cells`,
                  value: cell(r, 2),
                  tone:
                    klass === "N"
                      ? ("clay" as const)
                      : klass === "S1"
                        ? ("green" as const)
                        : ("mute" as const),
                };
              })}
            />
            <p className="ex-caption mt-4">
              Share of cells in which the crop was actually planted. The gate
              was written from FAO EcoCrop and ICAR envelopes without ever
              seeing this planting data, and the ordering it produces is
              monotone.
            </p>
          </Card>

          <Card
            span={6}
            n="Fig. 7.8"
            title="What fixing the gate was worth"
            icon={ShieldBan}
            tone="gold"
            lede="A false veto is the expensive error. The S2 upgrade cut them by a factor of seven."
            source="ml engine for Recommendation/reports/s2_s3_upgrade.md"
            footnote="The worst defect: a 150-day growing-period rule for sugarcane, against an observed 70–149 days, vetoed it across 96% of the area it occupies."
          >
            <Ladder
              format={(v) => `${v.toFixed(2)}%`}
              steps={[
                {
                  label: "False vetoes on >5% of district area — before",
                  value: 6.34,
                  note: "the gate as first shipped",
                },
                {
                  label: "After the S2 upgrade",
                  value: 0.9,
                  delta: -5.44,
                  note: "envelopes rewritten against observed ranges",
                },
                {
                  label: "Agronomic veto rate overall",
                  value: 2.9,
                  delta: -12.5,
                  note: "down from 15.4%",
                },
              ]}
            />
          </Card>

          <Card
            span={6}
            n="Fig. 7.9"
            title="Does the uncertainty band mean what it says?"
            icon={Gauge}
            tone="blue"
            lede="A nominal 80% interval covered the truth 73% of the time. Conformal calibration fixes that, at the price of a wider band."
            source={conformal.source}
            at={conformal.heading}
            wide
          >
            <ReportTableView table={conformal} />
            <p className="ex-caption mt-4">
              An interval is a promise about how often it is right. Widening it
              until the promise holds is the only version of that promise worth
              printing.
            </p>
          </Card>

          <Card
            span={6}
            n="Fig. 7.10"
            title="The list as served, against the bars that matter"
            icon={Target}
            tone="gold"
            lede="Train on the past, rank the next season. The honest baseline is not random — it is what a farmer would do anyway."
            source={served.source}
            at={served.heading}
            wide
            footnote="District persistence — grow what the district grew last year — scores 0.819 against the engine's 0.829. A far harder bar than the 0.717 popularity prior."
          >
            <BarRow
              max={1}
              labelWidth="lg"
              baseline={{
                value: 0.819,
                label:
                  "district persistence — grow what the district grew last year",
              }}
              format={(v) => v.toFixed(3)}
              rows={[...served.rows]
                .sort((a, b) => cell(b, 1) - cell(a, 1))
                .map((r) => {
                  const label = String(r[0]);
                  const ours = label.startsWith("Engine as served");
                  return {
                    label: label.replace(/\s*\(.*\)$/, ""),
                    value: cell(r, 1),
                    tone: ours
                      ? ("gold" as const)
                      : label.startsWith("Ranker alone")
                        ? ("blue" as const)
                        : ("mute" as const),
                  };
                })}
            />
          </Card>

          <Card span={12} quiet>
            <Honest title="The blend is currently costing accuracy">
              Under forward chaining the ranker alone scores 0.844 and the
              engine as served — after blending with the rules and applying
              vetoes — scores 0.829. The safety layer is, on this metric, making
              the list slightly worse. It is kept because a veto prevents a
              specific, expensive kind of wrong answer that NDCG does not
              measure, but the trade is real and it is not hidden in the
              scorecard.
            </Honest>
          </Card>
        </Grid>
      </Block>

      <Block
        title="The engine grades itself"
        lede="Eleven weighted criteria and six hard gates, with anchors hashed before the run so the target cannot move."
      >
        <Grid>
          <Card
            span={7}
            n="Fig. 7.11"
            title={`Scorecard — ${SCORECARD.label}`}
            icon={ClipboardCheck}
            tone="gold"
            lede="A failed hard gate caps the composite at 6.0. Two criteria were never measured and show as empty tracks, not dropped."
            source={SCORECARD.source}
            at={SCORECARD.at}
          >
            <ScoreBars
              items={SCORECARD.subScores}
              composite={{
                value: SCORECARD.composite,
                of: 10,
                note: `${gatesPassed}/${SCORECARD.gates.length} hard gates pass`,
              }}
            />
          </Card>

          <div className="flex flex-col gap-4 md:col-span-6 lg:col-span-5">
            <Card
              span={12}
              n="Fig. 7.12"
              title="How it got there"
              lede="Four measured runs in one day. Each label is what changed."
              source="ml engine for Recommendation/reports/scorecard_history.csv"
            >
              <Trend
                height={160}
                domain={[5.5, 10]}
                target={{ value: TARGET, label: `target ${TARGET}` }}
                points={SCORECARD.history.map((h, i) => ({
                  label: `Run ${i + 1}`,
                  value: h.composite,
                  note: h.gates,
                }))}
              />
              <ul className="mt-4 flex flex-col gap-1.5">
                {SCORECARD.history.map((h, i) => (
                  <li key={h.at} className="ex-caption leading-snug">
                    <span className="font-mono text-ink">{i + 1}</span>{" "}
                    <span className="text-ink">{h.composite.toFixed(2)}</span> —{" "}
                    {h.label}
                  </li>
                ))}
              </ul>
            </Card>

            <Card
              span={12}
              n="Fig. 7.13"
              title="The hard gates"
              icon={ClipboardCheck}
              tone="green"
              lede="Each of these caps the composite at 6.0 on its own if it fails."
              source={SCORECARD.source}
            >
              <ProgressRow
                rows={[
                  {
                    label: "Hard gates passing",
                    value: gatesPassed,
                    of: SCORECARD.gates.length,
                    tone: "green",
                  },
                  {
                    label: "Scorecard weight actually measured",
                    value: Math.round(SCORECARD.measuredWeight * 100),
                    of: 100,
                    tone: "gold",
                  },
                ]}
              />
              <ul className="mt-4 flex flex-col gap-1.5">
                {SCORECARD.gates.map((g) => (
                  <li key={g.name} className="ex-caption leading-snug">
                    <span className="text-ink">{g.name}</span> — {g.detail}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card
            span={12}
            n="Fig. 7.14"
            title="The distance to 9.5"
            icon={Target}
            tone="clay"
            lede={`The target the project set itself. ${pointsAvailable} weighted points are still on the table across the nine measured criteria; reaching ${TARGET} needs ${pointsNeeded} of them. This is where they sit.`}
            source={SCORECARD.source}
            footnote="The two ranking margins are more of the gap than everything else combined, and neither closes with a better model — both need more years of labels."
          >
            <BarRow
              labelWidth="lg"
              format={(v) => v.toFixed(2)}
              rows={[...SCORECARD.subScores]
                .filter((s) => s.score !== null)
                .map((s) => ({
                  label: s.label,
                  value: Math.round((10 - s.score!) * s.weight * 100) / 100,
                  tone:
                    (10 - s.score!) * s.weight > 5
                      ? ("clay" as const)
                      : ("mute" as const),
                  sub: `scores ${s.score!.toFixed(2)} at weight ${s.weight}`,
                }))
                .sort((a, b) => b.value - a.value)}
            />
            <p className="ex-caption mt-4">
              Weighted points still available on each criterion — the bar is (10
              − score) × weight. They do not sum to the composite gap: the
              composite divides by the {measuredWeight} of measured weight, so{" "}
              {pointsAvailable} weighted points are{" "}
              {(pointsAvailable / measuredWeight).toFixed(2)} composite points.
              Two criteria are missing from this chart entirely, because they
              have never been measured — see Fig. 7.10.
            </p>
          </Card>

          <Card span={12} quiet>
            <DecisionCard decision={decision("freeze-scorecard-anchors")} />
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
