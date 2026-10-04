import type { Metadata } from "next";
import { FileScan, ScanText, Vote, ShieldCheck } from "lucide-react";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Honest, Points } from "@/components/examiner/viz/Figure";
import { Card, Grid, StatCard } from "@/components/examiner/viz/Card";
import { Pipeline } from "@/components/examiner/viz/Flow";
import { Matrix, Table } from "@/components/examiner/viz/Matrix";
import { Ladder } from "@/components/examiner/viz/Stats";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { decision } from "@/data/examiner/decisions";

export const metadata: Metadata = { title: "Reading the Soil Health Card" };

/** The twelve metrics the reader extracts, in the order the card prints them. */
const METRICS = [
  ["available_nitrogen", "N", "kg/ha"],
  ["available_phosphorus", "P", "kg/ha"],
  ["available_potassium", "K", "kg/ha"],
  ["ph", "pH", "—"],
  ["ec", "EC", "dS/m"],
  ["organic_carbon", "OC", "%"],
  ["available_sulphur", "S", "ppm"],
  ["available_zinc", "Zn", "ppm"],
  ["available_boron", "B", "ppm"],
  ["available_iron", "Fe", "ppm"],
  ["available_manganese", "Mn", "ppm"],
  ["available_copper", "Cu", "ppm"],
];

/**
 * The eight attempts, in the order `backend/ocr.py` ranks them. Four
 * preprocessors against three page-segmentation modes is twelve combinations
 * and two language sets makes twenty-four; eight are tried. The search is
 * ranked and sparse on purpose — the first pass that recovers all twelve
 * readings wins and the rest never run.
 */
const PREP = ["scaled", "plain", "boost", "binary"] as const;
const PSM = [6, 4, 3] as const;
const RANK: Readonly<Record<string, number>> = {
  "scaled/6": 1,
  "plain/6": 2,
  "boost/6": 3,
  "scaled/4": 4,
  "boost/4": 5,
  "binary/6": 7,
  "plain/3": 8,
};

export default function Page() {
  return (
    <Chapter href="/examiner/reading">
      <Grid>
        <StatCard
          span={3}
          icon={ScanText}
          tone="gold"
          value="12/12"
          label="readings recovered from a photographed card"
          sub="the default OCR configuration got 3, two of them wrong"
          delta={{
            value: "+9",
            direction: "up",
            good: true,
            title: "after the eight-pass search",
          }}
        />
        <StatCard
          span={3}
          icon={FileScan}
          tone="blue"
          value={8}
          label="OCR attempts per image"
          sub="ranked, with an early exit on a perfect read"
        />
        <StatCard
          span={3}
          icon={Vote}
          tone="green"
          value={2}
          label="stage vote"
          sub="the printed range first, then the reading"
        />
        <StatCard
          span={3}
          icon={ShieldCheck}
          tone="slate"
          value={20}
          label="page cap on a PDF"
          sub="a 400-page file fits inside the 10 MB limit"
        />
      </Grid>

      <Block
        title="A photograph of a printed card becomes twelve numbers"
        lede="A document the farmer already has. Reading it is the only way this product starts from real soil data, not an estimate."
      >
        <Grid>
          <Card
            span={12}
            n="Fig. 3.1"
            title="The ingest path"
            icon={FileScan}
            tone="blue"
            lede="The extension picks the parser; the magic bytes decide whether to believe it."
            source="backend/document_service.py · backend/ingest.py · backend/pdf_processor.py"
            footnote={
              <Points
                tone="clay"
                items={[
                  "The 20-page cap is not a tuning knob",
                  "A 400-page PDF fits easily inside the 10 MB upload limit",
                  "OCR at 300 DPI on 400 pages is a denial-of-service needing no skill",
                ]}
              />
            }
          >
            <Pipeline
              feedback="Every OCR-derived metric is stored with confidence 'unconfirmed' and the document is flagged needs_review. The reader never claims a reading is confirmed just because it parsed."
              steps={[
                {
                  label: "Store",
                  sub: "1 MB chunks",
                  detail: "Streamed to disk under a random name",
                },
                {
                  label: "Verify magic bytes",
                  detail:
                    "%PDF-, JPEG, PNG, TIFF prefixes — the extension is not trusted",
                },
                {
                  label: "Extract text",
                  sub: "PyMuPDF",
                  detail: "Native text first; OCR only where a page has none",
                },
                {
                  label: "Eight OCR attempts",
                  detail: "Ranked, scored by how many readings each recovers",
                },
                {
                  label: "Merge and vote",
                  detail: "Range first, then reading among passes that agreed",
                },
                {
                  label: "Twelve metrics",
                  detail: "Each with the card's own printed range",
                },
              ]}
            />
          </Card>

          <Card
            span={6}
            n="Fig. 3.2"
            title="Why eight attempts and not one"
            icon={ScanText}
            tone="gold"
            lede="Tesseract's defaults assume a scanned page. A card photographed on a phone is a skewed, low-contrast table read as prose."
            source="backend/ocr.py"
          >
            <Ladder
              format={(v) => String(v)}
              steps={[
                {
                  label: "Default configuration (PSM 3, no preprocessing)",
                  value: 3,
                  note: "and two of the three were wrong",
                },
                {
                  label: "PSM 6 with upscaling to 2400px",
                  value: 12,
                  delta: 9,
                  note: "every reading exact",
                },
              ]}
              max={12}
            />
            <p className="ex-caption mt-3">
              readings recovered, out of the twelve the card carries
            </p>
          </Card>

          <Card
            span={6}
            n="Fig. 3.3"
            title="The two-stage vote"
            icon={Vote}
            tone="green"
            lede="Every attempt's output is kept, including the implausible ones. They vote."
            source="backend/soil_report.py"
            footnote={
              <Points
                items={[
                  "Ranges are typeset, so they survive a bad scan better than the reading does",
                  "Agreeing the range first means the reading is voted on only among passes that read the same row",
                ]}
              />
            }
          >
            <Pipeline
              steps={[
                {
                  label: "Discard the impossible",
                  tone: "clay",
                  badge: "guard",
                  detail:
                    "A plausible-range table and a maximum range multiple, applied before any vote is counted",
                },
                {
                  label: "Vote on the printed range",
                  tone: "green",
                  badge: "stage 1",
                  detail:
                    "Typeset, high-contrast, identical on every card — the most reliable thing on the page",
                },
                {
                  label: "Vote on the reading",
                  tone: "gold",
                  badge: "stage 2",
                  detail:
                    "Only among passes that agreed on the range, so a pass that misread the row cannot reach the number",
                },
              ]}
            />
          </Card>

          <Card
            span={5}
            n="Fig. 3.4"
            title="The search grid — twenty-four combinations, eight tried"
            icon={ScanText}
            tone="gold"
            lede="Four preprocessors × three segmentation modes. Shading is the search order; a pass that recovers all twelve readings stops the rest."
            source="backend/ocr.py"
            wide
            footnote={
              <Points
                items={[
                  "A sixth attempt repeats scaled/PSM 6 in English only — Marathi tessdata is missing on some machines",
                  "Empty cells measured worse in the sweep that produced this ranking, and are not run",
                ]}
              />
            }
          >
            <Matrix
              rowHeader="preprocessing"
              colHeader="page-segmentation mode"
              markDiagonal={false}
              rows={PREP.map((p) => p)}
              cols={PSM.map((m) => `PSM ${m}`)}
              values={PREP.map((prep) =>
                PSM.map((m) => {
                  const r = RANK[`${prep}/${m}`];
                  // Inverted so the earliest attempt is the darkest step: the
                  // ramp reads "bigger is more", and here what is "more" is
                  // how much the sweep expected of this configuration.
                  return r ? 9 - r : 0;
                }),
              )}
              format={(v) => (v === 0 ? "" : `#${9 - v}`)}
            />
          </Card>

          <Card
            span={7}
            n="Fig. 3.5"
            title="The twelve metrics"
            lede="Three macronutrients, two chemistry measures, organic carbon, and six micronutrients."
            source="backend/soil_report.py"
            footnote={
              <Points
                items={[
                  "Anything from OCR is stored 'unconfirmed' and the document flagged needs_review",
                  "The extraction carries a version, so a record from an older reader is re-read, not served stale",
                ]}
              />
            }
            wide
          >
            <Table
              head={["Metric", "Symbol", "Unit"]}
              numeric={[]}
              minWidth="24rem"
              rows={METRICS.map(([k, sym, unit]) => ({
                cells: [
                  k.replace(/^available_/, "").replace(/_/g, " "),
                  sym,
                  unit,
                ],
              }))}
            />
          </Card>

          <Card span={12} quiet>
            <DecisionCard decision={decision("ranges-from-the-card")} />
          </Card>

          <Card span={12} quiet>
            <Honest title="This is measured on a handful of cards, not a corpus">
              The 3-of-12 to 12-of-12 result is a real, repeatable measurement
              on the project&rsquo;s own test fixture and the six real cards in
              the repository. It is not an accuracy figure over a large sample
              of field photographs, because no such sample exists. What can be
              said is that the eight-pass search fixed a specific failure that
              the default configuration produced reliably.
            </Honest>
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
