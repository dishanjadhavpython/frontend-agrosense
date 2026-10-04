import type { Metadata } from "next";
import { Trophy, Sprout, FlaskConical, TrendingUp, Timer } from "lucide-react";
import type { Tournament } from "@/data/examiner/types";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Honest, Points } from "@/components/examiner/viz/Figure";
import { Card, Grid, StatCard } from "@/components/examiner/viz/Card";
import { BarRow, DotPlot } from "@/components/examiner/viz/Bars";
import { Table } from "@/components/examiner/viz/Matrix";
import { DeltaCI } from "@/components/examiner/viz/DeltaCI";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { decision } from "@/data/examiner/decisions";
import {
  TOURNAMENTS,
  RANKER_DELTA,
  CROP_FEATURES,
  FERTILISER_RANDOM_BASELINE,
  FERTILISER_HOLDOUT,
} from "@/data/examiner/generated/tournaments";

export const metadata: Metadata = { title: "Which model, and why that one" };

// Typed against the interface rather than the inferred literal: `as const
// satisfies` narrows each element to its own shape, so `cost` and `failed` —
// which only some of them carry — are invisible on the union.
const byId = (id: string): Tournament =>
  TOURNAMENTS.find((t) => t.id === id)! as Tournament;
const crop = byId("crop-model");
const fert = byId("fertiliser-model");
const ranker = byId("engine-ranker");
const yieldT = byId("engine-yield");

/** Winner minus runner-up, per tournament, in that tournament's own metric. */
const gap = (t: Tournament) => {
  const scored = t.contenders
    .filter((c) => c.score !== null)
    .map((c) => Number(c.score))
    .sort((a, b) => b - a);
  return Math.round((scored[0] - scored[1]) * 10000) / 10000;
};

const NAME: Record<string, string> = {
  lightgbm: "LightGBM",
  xgboost: "XGBoost",
  catboost: "CatBoost",
  tabpfn: "TabPFN v2",
};
const nice = (n: string) => NAME[n] ?? n;

const MARGINS = {
  crop: gap(crop),
  fert: gap(fert),
  ranker: gap(ranker),
  // Signed the other way on purpose: the model that was kept is the one BEHIND
  // on this metric, so the bar is drawn as a cost rather than as a win.
  yield_: gap(yieldT),
};

/**
 * One tournament: the margin first, then the table.
 *
 * The strip is a dot plot on a domain that starts where the data does, not at
 * zero. Bars from zero are the right chart for a count and the wrong one for
 * two accuracies that differ in the third decimal — twelve-hundredths of a bar
 * is not a difference anyone can see, and drawing it as one would overstate
 * what was measured. The domain is printed on the axis every time.
 */
function Board({
  t,
  icon,
  tone,
  span = 6,
  n,
  domain,
  floor,
}: {
  t: Tournament;
  icon: React.ComponentType<{ className?: string }>;
  tone: "gold" | "green" | "blue" | "clay";
  span?: 6 | 12;
  n: string;
  /** Stated per tournament: these are four different metrics. */
  domain: readonly [number, number];
  /** A random or majority baseline, where one exists. */
  floor?: { label: string; value: number };
}) {
  const scored = t.contenders.filter((c) => c.score !== null);
  const series = [
    ...scored.map((c) => ({
      name: nice(c.name),
      tone: (c.chosen ? "gold" : "slate") as "gold" | "slate",
    })),
    ...(floor ? [{ name: floor.label, tone: "mute" as const }] : []),
  ];

  return (
    <Card
      span={span}
      n={n}
      title={t.task}
      icon={icon}
      tone={tone}
      lede={`${t.protocol}. Decided on ${t.metric}.`}
      source={t.source}
      footnote={t.cost}
      wide
    >
      <DotPlot
        domain={domain}
        format={(v) => v.toFixed(4)}
        series={series}
        groups={[
          {
            label: t.metric,
            sub: `${scored.length} arms scored`,
            points: [
              ...scored.map((c) => ({
                series: nice(c.name),
                value: Number(c.score),
              })),
              ...(floor ? [{ series: floor.label, value: floor.value }] : []),
            ],
          },
        ]}
      />

      <div className="mt-6">
        <Table
          head={["Model", t.metric, "Also measured"]}
          numeric={[1]}
          rows={t.contenders.map((c) => ({
            chosen: c.chosen,
            rejected: !!c.failed,
            cells: [
              nice(c.name),
              c.score ?? "—",
              c.failed ? c.failed.split(":")[0] : (c.detail ?? ""),
            ],
            note: c.failed ? "no result produced" : undefined,
          }))}
        />
      </div>
      <p className="ex-caption mt-4 border-l-2 border-gold pl-3">{t.why}</p>
    </Card>
  );
}

export default function Page() {
  return (
    <Chapter href="/examiner/tournaments">
      <Grid>
        <StatCard
          span={3}
          icon={Trophy}
          tone="gold"
          value={TOURNAMENTS.length}
          label="head-to-head comparisons"
          sub="each on a protocol fixed before the run"
        />
        <StatCard
          span={3}
          icon={Sprout}
          tone="green"
          value={crop.contenders.find((c) => c.chosen)!.score!}
          label={`crop model, CV accuracy (${nice(crop.chosen)})`}
          sub={`${CROP_FEATURES.length} features, no N/P/K`}
        />
        <StatCard
          span={3}
          icon={FlaskConical}
          tone="clay"
          value={fert.contenders.find((c) => c.chosen)!.score!}
          label="fertiliser model, CV accuracy"
          sub={`a seven-way coin toss scores ${FERTILISER_RANDOM_BASELINE.toFixed(4)}`}
        />
        <StatCard
          span={3}
          icon={Timer}
          tone="slate"
          value={2}
          label="arms that produced no number"
          sub="recorded, not dropped from the table"
        />
      </Grid>

      <Block
        title="The same shape, four times"
        lede="Candidates, a protocol fixed beforehand, one metric, a stated cost. Two of the four were won by the worse headline number."
      >
        <Grid>
          <Board
            t={crop}
            icon={Sprout}
            tone="green"
            n="Fig. 6.1"
            domain={[0.95, 0.97]}
          />
          <Board
            t={fert}
            icon={FlaskConical}
            tone="clay"
            n="Fig. 6.2"
            domain={[0.13, 0.19]}
            floor={{
              label: "seven-way coin toss",
              value: FERTILISER_RANDOM_BASELINE,
            }}
          />

          <Card span={12} quiet>
            <Honest title="The fertiliser model is barely better than guessing, and it is still in the product">
              <p>
                It scores {fert.contenders.find((c) => c.chosen)!.score} against
                the {FERTILISER_RANDOM_BASELINE.toFixed(4)} a seven-way coin
                toss gives — and {FERTILISER_HOLDOUT.top3.toFixed(4)} if you
                allow it three guesses. Its labels are synthetic (a Kaggle
                generator), so a high score would have meant the
                generator&rsquo;s rule was learned, not agronomy.
              </p>
              <Points
                items={[
                  "So it is not allowed to choose",
                  "Need is computed from the farmer's own card; the model only breaks ties",
                  "The confidence shown to the farmer is the nutrient match, never the softmax",
                  "A percentage from a 17%-accurate classifier, printed beside a purchase, is a lie with a decimal point on it",
                ]}
              />
            </Honest>
          </Card>

          <Board
            t={ranker}
            icon={TrendingUp}
            tone="gold"
            n="Fig. 6.3"
            domain={[0.87, 0.895]}
          />
          <Board
            t={yieldT}
            icon={TrendingUp}
            tone="blue"
            n="Fig. 6.4"
            domain={[0.39, 0.5]}
          />
          <Card
            span={12}
            n="Fig. 6.5"
            title="Every one of these was decided by a hair"
            icon={Trophy}
            tone="gold"
            lede="First against second in each tournament, in its own metric. Three were won by the better number; the fourth was not."
            source="ML/models/*_metadata.json · ml engine for Recommendation/artifacts/model_selection.json"
            footnote={`The four bars are in four different metrics and are not comparable with each other — only within a row, against zero. Each is the difference of the two reported scores; the ranker\u2019s paired estimate over the same 544 queries is +${RANKER_DELTA.delta} with an interval, which is Fig. 6.6 and is the number that decided it. What the four show together is that no model here won by a margin anybody could call decisive.`}
          >
            <BarRow
              labelWidth="lg"
              format={(v) => v.toFixed(4)}
              rows={[
                {
                  label: "Crop model",
                  sub: "CV accuracy · LightGBM over XGBoost",
                  value: MARGINS.crop,
                  tone: "gold",
                },
                {
                  label: "Fertiliser model",
                  sub: "CV accuracy · XGBoost over LightGBM",
                  value: MARGINS.fert,
                  tone: "gold",
                },
                {
                  label: "Engine ranker",
                  sub: "NDCG@5 · CatBoost over LightGBM",
                  value: MARGINS.ranker,
                  tone: "gold",
                },
                {
                  label: "Engine yield",
                  sub: "within-crop rho · the KEPT model is behind by this much",
                  value: MARGINS.yield_,
                  tone: "clay",
                  display: `−${MARGINS.yield_.toFixed(4)}`,
                },
              ]}
            />
            <p className="ex-caption mt-4">
              The last bar is the one to stop on. LightGBM was kept although
              CatBoost predicted the point estimate better, because
              CatBoost&rsquo;s 80% interval covered the truth 62% of the time
              against 71.5%.
            </p>
          </Card>
        </Grid>
      </Block>

      <Block
        title="Two results that went against the headline number"
        lede="A tournament is only worth running if it can return an answer you did not want. These two did."
      >
        <Grid>
          {RANKER_DELTA ? (
            <Card
              span={6}
              n="Fig. 6.6"
              title="CatBoost's margin over the incumbent ranker"
              icon={TrendingUp}
              tone="gold"
              lede={`Paired over ${RANKER_DELTA.districts} districts and ${RANKER_DELTA.queries} queries, Holm-corrected. The interval excludes zero, so the challenger is adopted.`}
              source="ml engine for Recommendation/artifacts/model_selection.json"
              footnote={
                <Points
                  items={[
                    "The first run was unfair — only LightGBM carried monotone constraints",
                    "Equalised, the edge fell from +0.0050 to +0.0038 and corrected p moved from 0.0017 to 0.021",
                    "The margin that survived a fair fight is the one reported",
                  ]}
                />
              }
            >
              <DeltaCI
                domain={[-0.002, 0.008]}
                zeroLabel="zero — the two rankers are equally good"
                rows={[
                  {
                    label: "CatBoost against LightGBM",
                    sub: `NDCG@5, forward chaining · ${RANKER_DELTA.queries} queries`,
                    delta: RANKER_DELTA.delta,
                    lo: RANKER_DELTA.lo,
                    hi: RANKER_DELTA.hi,
                    stat: `Holm p = ${RANKER_DELTA.p}`,
                    verdict: "wins",
                  },
                ]}
              />
              <p className="ex-caption mt-4">
                A margin of {RANKER_DELTA.delta} is below the 0.01 this
                project&rsquo;s own limits section calls indistinguishable from
                chance at 34 districts. It was adopted because the interval
                excludes zero and the cost of being wrong is four milliseconds
                of serving time — not because the gap is large.
              </p>
            </Card>
          ) : null}

          <Card
            span={6}
            n="Fig. 6.7"
            title="The yield model that lost on rho and won anyway"
            icon={TrendingUp}
            tone="blue"
            lede="CatBoost predicted the point estimate better. LightGBM was kept because its uncertainty interval told the truth."
            source="ml engine for Recommendation/artifacts/model_selection.json"
            footnote="Recorded alongside this decision: the coverage criterion was added after the result was seen, which deserves scrutiny."
          >
            <BarRow
              max={1}
              labelWidth="lg"
              baseline={{
                value: 0.8,
                label: "nominal 80% — what the interval claims",
              }}
              rows={[
                {
                  label: "LightGBM — interval coverage",
                  value: 0.715,
                  tone: "gold",
                  sub: "within-crop rho 0.418",
                },
                {
                  label: "CatBoost — interval coverage",
                  value: 0.62,
                  tone: "clay",
                  sub: "within-crop rho 0.469 — the better point estimate",
                },
              ]}
              format={(v) => v.toFixed(3)}
            />
            <p className="ex-caption mt-4">
              An 80% interval that contains the truth 62% of the time is not a
              sharper answer; it is a confident one. A farmer reading a yield
              band is reading the band, not the midpoint.
            </p>
          </Card>

          <Card span={12} quiet>
            <DecisionCard
              decision={decision("fertiliser-model-does-not-choose")}
            />
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
