import type { Metadata } from "next";
import {
  Images,
  Layers,
  Target,
  Scale,
  Gauge,
  TriangleAlert,
} from "lucide-react";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Honest, Points } from "@/components/examiner/viz/Figure";
import {
  Card,
  Grid,
  StatCard,
  ProgressRow,
} from "@/components/examiner/viz/Card";
import {
  BarRow,
  DotPlot,
  GroupedBars,
  Spread,
} from "@/components/examiner/viz/Bars";
import { Histogram, StackedBar } from "@/components/examiner/viz/Distribution";
import { Matrix, Table } from "@/components/examiner/viz/Matrix";
import { Ladder } from "@/components/examiner/viz/Stats";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { decision } from "@/data/examiner/decisions";
import { SOIL_MODEL as M } from "@/data/examiner/generated/soilModel";

export const metadata: Metadata = {
  title: "Classifying soil from a photograph",
};

const SRC = "ML/models/soil_v2/soil_metadata.json";
const OOF = "ML/models/soil_v2/out_of_fold.json";
const MANIFEST = "ML/data/soil_v2/manifest.json";
const ARM_LABEL: Record<string, string> = {
  efficientnet_b0: "EfficientNet-B0",
  resnet18: "ResNet-18",
  efficientnet_b0_warm: "EfficientNet-B0, warm-started",
};
const label = (a: string) => ARM_LABEL[a] ?? a;
const winner = M.arms.find((a) => a.chosen)!;
const classes = M.dataset.classes;
const nClasses = classes.length;
const en = (v: number) => v.toLocaleString("en-IN");
const at = <T,>(r: Readonly<Record<string, T>>, k: string) => r[k as keyof typeof r];

/** Recall as a tone, so the hit-rate chart reads without counting cells. */
const recallTone = (r: number) =>
  r >= 0.85 ? ("green" as const) : r >= 0.7 ? ("gold" as const) : ("clay" as const);

const byRecall = [...M.pooled.classes].sort((a, b) => a.recall - b.recall);
const weakest = byRecall.slice(0, 2);

/** The single largest off-diagonal cell: where the model is most often wrong. */
const topConfusion = M.pooled.confusion
  .flatMap((row, i) => row.map((n, j) => ({ n, truth: classes[i], predicted: classes[j], i, j })))
  .filter((c) => c.i !== c.j)
  .sort((a, b) => b.n - a.n);

const copiesRemoved = M.dataset.filesScanned - M.dataset.distinctScenes;
const imageCounts: number[] = classes.map((c) => at(M.dataset.imagesPerClass, c));
const largest = classes[imageCounts.indexOf(Math.max(...imageCounts))];
const smallest = classes[imageCounts.indexOf(Math.min(...imageCounts))];
const scenesRank = [...classes].sort(
  (a, b) => at(M.dataset.scenesPerClass, b) - at(M.dataset.scenesPerClass, a),
);
const ordinal = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

/**
 * The twenty generated bins, pooled into five bands.
 *
 * Twenty bins answer "where do the predictions sit"; they cannot answer "how
 * often is this band right", because the bands at the bottom hold two or three
 * predictions and a rate over three predictions is not a rate. Five bands are
 * wide enough to carry one.
 */
const BANDS = [
  { label: "below 0.50", from: 0, to: 0.5 },
  { label: "0.50 – 0.70", from: 0.5, to: 0.7 },
  { label: "0.70 – 0.85", from: 0.7, to: 0.85 },
  { label: "0.85 – 0.95", from: 0.85, to: 0.95 },
  { label: "0.95 and above", from: 0.95, to: 1 },
].map((b) => {
  const inside = M.pooled.confidenceBins.filter(
    (x) => x.from >= b.from && x.to <= b.to,
  );
  const correct = inside.reduce((a, x) => a + x.correct, 0);
  const wrong = inside.reduce((a, x) => a + x.wrong, 0);
  return { ...b, correct, total: correct + wrong };
});
const pct = (n: number, d: number) => Math.round((n / d) * 100);
const below70 = BANDS.slice(0, 2);
const below70Total = below70.reduce((a, b) => a + b.total, 0);
const below70Wrong = below70.reduce((a, b) => a + b.total - b.correct, 0);
const top = BANDS[4];
const bottom = BANDS[0];

export default function Page() {
  return (
    <Chapter href="/examiner/soil-model">
      {/* The hero row: what an examiner should be able to read in five seconds. */}
      <Grid>
        <StatCard
          span={3}
          icon={Images}
          tone="blue"
          value={M.dataset.distinctScenes}
          label="distinct scenes"
          sub={`from ${en(M.dataset.filesScanned)} delivered files`}
          delta={{
            value: `−${en(copiesRemoved)} files`,
            direction: "down",
            good: true,
            title: "Duplicates and re-crops removed before any split was made",
          }}
        />
        <StatCard
          span={3}
          icon={Target}
          tone="gold"
          value={winner.macroF1.toFixed(4)}
          label={`${nClasses}-class macro-F1`}
          sub={`${M.folds}-fold CV grouped by scene · ${label(winner.name)}`}
        />
        <StatCard
          span={3}
          icon={Gauge}
          tone="green"
          value={winner.ece.toFixed(4)}
          label="expected calibration error"
          sub={`temperature ${winner.temperature.toFixed(3)}`}
        />
        <StatCard
          span={3}
          icon={TriangleAlert}
          tone="clay"
          value={M.previous ? M.previous.reportedMacroF1.toFixed(4) : "—"}
          label="the model it replaced, self-reported"
          sub="ungrouped folds · quoted, not compared"
        />
      </Grid>

      <Block
        title="The dataset had to be rebuilt before anything could be measured"
        lede="The delivered dataset could not support a number: the same photograph sat on both sides of its train/test split, many times over."
      >
        <Grid>
          <Card
            span={7}
            n="Fig. 5.1"
            title={`${en(M.dataset.filesScanned)} files are ${en(M.dataset.distinctScenes)} scenes`}
            icon={Layers}
            tone="blue"
            lede="Hashes remove exact duplicates. Crops, rotations and burst frames survive that, so scenes are grouped perceptually and held out as groups."
            source={MANIFEST}
            footnote={`Grouping is by dihedral perceptual hash within a Hamming distance of ${M.dataset.hammingThreshold}, so a photograph and its mirror land in the same group. Filenames are evidence only inside one class: Cinder, Laterite, Peat and Yellow are each numbered from 1.jpg, and two files called 21.jpg in different folders are different photographs. ${M.dataset.droppedLabelConflicts} groups were dropped because the same pixels had been filed under two soils — a label that contradicts itself cannot be trained on or tested against.`}
          >
            <Ladder
              steps={[
                {
                  label: "Image files delivered",
                  value: M.dataset.filesScanned,
                },
                {
                  label: "Distinct by file hash",
                  value: M.dataset.distinctByMd5,
                  delta: M.dataset.distinctByMd5 - M.dataset.filesScanned,
                  note: "byte-identical copies removed",
                },
                {
                  label: "Distinct scenes",
                  value: M.dataset.distinctScenes,
                  delta: M.dataset.distinctScenes - M.dataset.distinctByMd5,
                  note: "crops, rotations and burst frames folded together",
                },
              ]}
              format={en}
            />
          </Card>

          <Card
            span={5}
            n="Fig. 5.2"
            title={`What the ${en(M.dataset.filesScanned)} delivered files actually were`}
            icon={Layers}
            tone="clay"
            lede={`Read as a composition rather than as a funnel: ${pct(copiesRemoved, M.dataset.filesScanned)}% of the delivered dataset was the same photographs again.`}
            source={MANIFEST}
          >
            <StackedBar
              unit=" files"
              segments={[
                {
                  label: "Distinct scenes — what can be trained on",
                  value: M.dataset.distinctScenes,
                  tone: "green",
                },
                {
                  label: "Crops, rotations and burst frames of a scene above",
                  value: M.dataset.distinctByMd5 - M.dataset.distinctScenes,
                  tone: "gold",
                },
                {
                  label: "Byte-identical copies",
                  value: M.dataset.filesScanned - M.dataset.distinctByMd5,
                  tone: "clay",
                },
              ]}
            />
          </Card>

          <Card
            span={5}
            n="Fig. 5.3"
            title="Scenes per class"
            lede="Class balance after grouping — and the reason macro-F1, not accuracy, is the headline."
            source={MANIFEST}
          >
            <BarRow
              labelWidth="md"
              format={(v) => String(v)}
              rows={scenesRank.map((c) => ({
                label: c,
                value: at(M.dataset.scenesPerClass, c),
                tone: "blue" as const,
              }))}
            />
          </Card>

          <Card
            span={7}
            n="Fig. 5.4"
            title={`${nClasses} classes, and what they are in survey vocabulary`}
            lede="Five name a soil a Maharashtra land record would use, with Red and Yellow sharing one survey order. Clay is a texture, and Cinder and Peat are not Maharashtra soils, so those three cast no survey vote."
            source={MANIFEST}
            footnote="The fusion step reads this column: a photograph moves the surveyed soil type only through a class that has a survey name."
            wide
          >
            <Table
              head={["Class", "Survey name"]}
              numeric={[]}
              minWidth="20rem"
              rows={classes.map((c) => ({
                cells: [c, at(M.dataset.surveyVocabulary, c) ?? "— no survey vote"],
              }))}
            />
          </Card>

          <Card
            span={12}
            n="Fig. 5.5"
            title="Where the duplication was"
            icon={Images}
            tone="gold"
            lede={`The classes were not duplicated evenly. ${largest} has the most files and is ${ordinal[scenesRank.indexOf(largest)]} by scene; the four 640×640 classes carry three or more files per scene, Black barely more than one.`}
            source={MANIFEST}
            footnote="Why the split is on scenes and the headline is macro-F1: scored on files, the model is rewarded for memorising the over-copied classes, and every number here would be higher and wrong."
          >
            <GroupedBars
              format={(v) => String(v)}
              series={[
                { name: "image files", tone: "slate" },
                { name: "distinct scenes", tone: "gold" },
              ]}
              groups={classes.map((c) => ({
                label: c,
                bars: [
                  { series: "image files", value: at(M.dataset.imagesPerClass, c) },
                  { series: "distinct scenes", value: at(M.dataset.scenesPerClass, c) },
                ],
              }))}
            />
          </Card>

          <Card span={12} quiet>
            <Honest title="What this costs">
              Every fold trains on roughly{" "}
              {Math.round((M.dataset.distinctScenes * (M.folds - 1)) / M.folds)}{" "}
              scenes — under a hundred per class for a {nClasses}-way image
              problem, and the single biggest reason the numbers below are what
              they are. Reporting the file count instead would have produced a
              far better-looking model and a worse one.
            </Honest>
          </Card>
        </Grid>
      </Block>

      <Block
        title="One network, five grouped folds"
        lede="EfficientNet-B0 from ImageNet weights, with resolution normalised and sampling balanced by class. The warm-started arm of the earlier four-class run is refused on this data: the checkpoint it starts from was trained on this same folder."
      >
        <Grid>
          <Card
            span={7}
            n="Fig. 5.6"
            title={`Grouped cross-validation over ${M.folds} folds`}
            icon={Target}
            tone="gold"
            lede={
              M.fourClass
                ? `Lower than the four-class run's ${M.fourClass.macroF1.toFixed(4)}, and expected to be: twice the classes, and four of them photographed from one source at one size.`
                : "Every score here is from a fold that never saw the scene it is scoring."
            }
            source={SRC}
            wide
            footnote={
              <Points
                items={[
                  "Temperature scales the logits before softmax; below one means the raw network was under-confident",
                  "ECE is the gap between stated confidence and observed accuracy",
                  "ECE is what decides whether a confidence score can be shown to a farmer at all",
                ]}
              />
            }
          >
            <Table
              head={["Arm", "macro-F1", "±", "Accuracy", "ECE", "Temp.", "Size"]}
              rows={[...M.arms]
                .sort((a, b) => b.macroF1 - a.macroF1)
                .map((a) => ({
                  chosen: a.chosen,
                  cells: [
                    label(a.name),
                    a.macroF1.toFixed(4),
                    a.macroF1Std.toFixed(3),
                    a.accuracy.toFixed(4),
                    a.ece.toFixed(4),
                    a.temperature.toFixed(3),
                    `${(a.checkpointBytes / 1e6).toFixed(1)} MB`,
                  ],
                }))}
            />
          </Card>

          <Card
            span={5}
            n="Fig. 5.7"
            title="The spread matters more than the mean"
            lede={`Fold scores run from ${Math.min(...winner.perFold).toFixed(3)} to ${Math.max(...winner.perFold).toFixed(3)}. That range, not the third decimal of the mean, is the uncertainty on the headline.`}
            source={SRC}
          >
            <Spread
              domain={[0.6, 0.9]}
              rows={[...M.arms]
                .sort((a, b) => b.macroF1 - a.macroF1)
                .map((a) => ({
                  label: label(a.name),
                  points: a.perFold,
                  mean: a.macroF1,
                  tone: a.chosen ? ("gold" as const) : ("mute" as const),
                }))}
            />
          </Card>
        </Grid>
      </Block>

      <Block
        title="Where the model actually goes wrong"
        lede={`Pooled over the ${M.folds} held-out folds, so every one of the ${en(M.pooled.support)} images is scored exactly once, by the fold that had never seen it.`}
      >
        <Grid>
          <Card
            span={7}
            n="Fig. 5.8"
            title="Confusion, pooled out-of-fold"
            lede="Errors are not spread evenly. They gather among Laterite, Red, Yellow and Peat — and laterite is itself a red-to-yellow soil, so the confusion is physical before it is statistical."
            source={OOF}
            wide
            footnote={`The largest single cells: ${topConfusion
              .slice(0, 3)
              .map((c) => `${c.truth} read as ${c.predicted} (${c.n})`)
              .join(", ")}. The weakest recalls are ${weakest
              .map((c) => `${c.label} at ${c.recall.toFixed(3)}`)
              .join(" and ")}.`}
          >
            <Matrix
              rows={[...classes]}
              cols={[...classes]}
              values={M.pooled.confusion.map((r) => [...r])}
            />
          </Card>

          <Card
            span={5}
            n="Fig. 5.9"
            title="Per class, out-of-fold"
            lede={`Macro-F1 weights the ${nClasses} classes equally. ${largest} has ${(Math.max(...imageCounts) / Math.min(...imageCounts)).toFixed(1)}× the images of ${smallest}, so plain accuracy would over-report the large classes.`}
            source={OOF}
          >
            <DotPlot
              domain={[0.5, 1]}
              series={[
                { name: "precision", tone: "blue" },
                { name: "recall", tone: "gold" },
                { name: "F1", tone: "ink" },
              ]}
              groups={M.pooled.classes.map((c) => ({
                label: c.label,
                sub: `n = ${c.support}`,
                points: [
                  { series: "precision", value: c.precision },
                  { series: "recall", value: c.recall },
                  { series: "F1", value: c.f1 },
                ],
              }))}
            />
          </Card>

          <Card
            span={6}
            n="Fig. 5.10"
            title="The model knows when it is guessing"
            icon={Gauge}
            tone="green"
            lede="Mean confidence when right, against when wrong. The gap is what makes an abstention threshold possible at all."
            source={OOF}
          >
            <BarRow
              max={1}
              labelWidth="lg"
              rows={[
                {
                  label: "Confidence when correct",
                  value: M.pooled.meanConfidenceCorrect,
                  tone: "green",
                },
                {
                  label: "Confidence when wrong",
                  value: M.pooled.meanConfidenceWrong,
                  tone: "clay",
                },
                {
                  label: "Overall accuracy",
                  value: M.pooled.accuracy,
                  tone: "ink",
                },
              ]}
              format={(v) => v.toFixed(4)}
            />
          </Card>

          <Card
            span={6}
            n="Fig. 5.11"
            title="Correct predictions, by class"
            lede="The same matrix as a hit rate: green above 0.85 recall, clay below 0.70, so the classes that hold up and the ones that do not are visible without counting cells."
            source={OOF}
          >
            <ProgressRow
              rows={M.pooled.classes.map((c) => ({
                label: c.label,
                value: Math.round(c.recall * c.support),
                of: c.support,
                tone: recallTone(c.recall),
              }))}
            />
          </Card>
          <Card
            span={7}
            n="Fig. 5.12"
            title="The same confidence, binned"
            icon={Gauge}
            tone="green"
            lede="Two means hide the shape. Binned, it shows how separable right from wrong is, and what a threshold would cost."
            source={OOF}
            footnote={`Above 0.95 the model is right ${pct(top.correct, top.total)}% of the time; below 0.50 it is right ${pct(bottom.correct, bottom.total)}% of the time — better than the ${pct(1, nClasses)}% of a guess among ${nClasses}, not good enough to show a farmer. Refusing to answer below 0.50 would discard ${bottom.total} of ${en(M.pooled.support)} predictions to avoid ${bottom.total - bottom.correct} errors. The threshold is a product decision, and this is the chart it should be made from.`}
          >
            <Histogram
              height={190}
              xLabel="predicted probability of the chosen class, after temperature scaling"
              xTicks={[0, 0.25, 0.5, 0.75, 1]}
              series={[
                { name: "correct", tone: "green" },
                { name: "wrong", tone: "clay" },
              ]}
              bins={M.pooled.confidenceBins.map((b) => ({
                from: b.from,
                to: b.to,
                values: { correct: b.correct, wrong: b.wrong },
              }))}
            />
          </Card>
          <Card
            span={5}
            n="Fig. 5.13"
            title="How often each confidence band is right"
            icon={Gauge}
            tone="gold"
            lede="The same predictions pooled into five bands, because a rate over the three predictions in a narrow bin is not a rate."
            source={OOF}
            footnote={`The chart a threshold is chosen from. Refusing below 0.70 holds back ${pct(below70Total, M.pooled.support)}% of all answers, and buys the two bands where the model is wrong ${pct(below70Wrong, below70Total)}% of the time.`}
          >
            <ProgressRow
              rows={BANDS.map((b) => ({
                label: `${b.label} — ${b.total} predictions`,
                value: b.correct,
                of: b.total,
                tone:
                  b.correct / b.total > 0.9
                    ? ("green" as const)
                    : b.correct / b.total > 0.7
                      ? ("gold" as const)
                      : ("clay" as const),
              }))}
            />
            <p className="ex-caption mt-4">
              correct predictions in each band, over the number of predictions
              that landed in it
            </p>
          </Card>
        </Grid>
      </Block>

      <Block
        title="Promoted, without a head-to-head"
        lede="An eight-class classifier was already in production. Replacing it would normally be decided on photographs neither model had seen. In this project there are none."
      >
        <Grid>
          <Card
            span={7}
            n="Fig. 5.14"
            title="Three scores that cannot be ranked"
            icon={Scale}
            tone="clay"
            lede="Each row is honest about its own protocol, and the protocols differ — so the column is a list, not a leaderboard."
            source={SRC}
            wide
            footnote="The owner's field folder, 4 soils in use, was the obvious held-out set. Every one of its 1,717 files is byte-identical to a file in data set of the project, which both eight-class models were trained on, so it can test neither."
          >
            <Table
              head={["Model", "Classes", "Folds", "macro-F1"]}
              rows={[
                {
                  chosen: true,
                  cells: [
                    `${label(winner.name)}, ${M.promoted ? "serving" : "trained, not yet promoted"}`,
                    nClasses,
                    `grouped by scene, ${en(M.dataset.distinctScenes)} scenes`,
                    `${winner.macroF1.toFixed(4)} ± ${winner.macroF1Std.toFixed(3)}`,
                  ],
                },
                ...(M.previous
                  ? [
                      {
                        cells: [
                          `${label(M.previous.architecture)}, retired`,
                          M.previous.classes,
                          "ungrouped — copies on both sides",
                          `${M.previous.reportedMacroF1.toFixed(4)} ± ${M.previous.reportedMacroF1Std.toFixed(3)}`,
                        ],
                      },
                    ]
                  : []),
                ...(M.fourClass
                  ? [
                      {
                        cells: [
                          "Four-class run, superseded",
                          M.fourClass.classes,
                          `grouped by scene, ${en(M.fourClass.scenes)} scenes`,
                          `${M.fourClass.macroF1.toFixed(4)} ± ${M.fourClass.macroF1Std.toFixed(3)}`,
                        ],
                      },
                    ]
                  : []),
              ]}
            />
          </Card>

          <Card
            span={5}
            n="Fig. 5.15"
            title="What promotion changed"
            icon={TriangleAlert}
            tone="gold"
            lede="The serving labels, the fusion likelihoods and the calibration all moved together, because they are written together."
            source="ML/models/soil_metadata.json"
          >
            <Points
              items={[
                "ML/models/ now holds this fit, relabelled to the slugs the backend keys on — alluvial, black, cinder, clay, laterite, peat, red, yellow",
                "The engine's soil fusion reads the new pooled confusion, so a photograph is weighed by this model's errors, not the old one's",
                "The previous checkpoint sits in ML/models/legacy_8class/; rolling back is a copy",
              ]}
            />
          </Card>

          <Card span={12} quiet>
            <DecisionCard decision={decision("promote-eight-class-soil-model")} />
          </Card>

          <Card span={12} quiet>
            <Honest title="What is still not known">
              <Points
                tone="clay"
                items={[
                  "Every figure on this page is cross-validation",
                  "There is no held-out field test set — no farmer's phone photographs set aside before training",
                  "Whether the new model beats the old one on field photographs is unmeasured, in either direction",
                  "Cross-validated macro-F1 on a curated dataset is an upper bound on field performance, not an estimate of it",
                ]}
              />
              <p className="mt-3">
                The retired model is also recorded at 0.777 macro-F1 elsewhere
                in the project&rsquo;s notes, against the 0.906 in its own
                metadata. Different fold constructions; nothing in the
                repository reconciles them. Both are quoted with the protocol
                attached.
              </p>
            </Honest>
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
