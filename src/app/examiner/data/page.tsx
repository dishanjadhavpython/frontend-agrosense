import type { Metadata } from "next";
import {
  Database,
  CloudRain,
  Map,
  FlaskConical,
  Ban,
  Filter,
  Route,
} from "lucide-react";
import { Chapter } from "@/components/examiner/Chapter";
import { Block, Honest, Points } from "@/components/examiner/viz/Figure";
import {
  Card,
  Grid,
  StatCard,
  ProgressRow,
} from "@/components/examiner/viz/Card";
import { Table } from "@/components/examiner/viz/Matrix";
import { Flow, Pipeline } from "@/components/examiner/viz/Flow";
import { BarRow } from "@/components/examiner/viz/Bars";
import { DecisionCard } from "@/components/examiner/viz/Decision";
import { SCRAPE_PATH } from "@/data/examiner/diagrams";
import { decision } from "@/data/examiner/decisions";
import {
  SCRAPED_FILES,
  SCRAPED_TOTALS,
} from "@/data/examiner/generated/scrapers";

export const metadata: Metadata = { title: "Where the data comes from" };

const group = (g: string) => SCRAPED_FILES.filter((f) => f.group === g);
const weatherRows = group("Daily weather")[0]?.rows ?? 0;
const fertRows = group("Fertiliser recommendations")[0]?.rows ?? 0;
const shc = group("Soil Health Card");
const kB = (n: number | null) =>
  n === null ? "—" : `${Math.round(n / 1024)} KB`;
/** Every taluka in the state: the soil-type map is the one file that has them all. */
const ALL_TALUKAS = group("Soil type")[0]?.rows ?? 358;
const crops = group("Crop statistics");

/** The six scrapers, their upstream, and what each one cannot tell you. */
const SCRAPERS = [
  {
    file: "scraper.py",
    source: "Soil Health Card nutrient dashboard",
    host: "soilhealth4.dac.gov.in",
    via: "GraphQL",
    gives: "Twelve nutrient parameters as Low/Medium/High shares, per taluka",
    cannot:
      "A share, never a reading. It says 62% of samples were low in nitrogen, not what any one field holds.",
  },
  {
    file: "weather_scraper.py",
    source: "NASA POWER daily point API",
    host: "power.larc.nasa.gov",
    via: "REST, no key",
    gives:
      "Max/min temperature, humidity, rainfall, wind — daily, per taluka centroid",
    cannot:
      "A ~55 km reanalysis grid, so neighbouring talukas can share a cell. It is not a rain gauge.",
  },
  {
    file: "weather_backfill.py",
    source: "the same POWER API, 29 years back",
    host: "power.larc.nasa.gov",
    via: "chunked + cached",
    gives:
      "1997-98 to 2025-26, which is what made as-of climate normals possible",
    cannot:
      "Nothing the daily scraper cannot; it is the same source over a longer window.",
  },
  {
    file: "soil_type_scraper.py",
    source: "ICAR-NBSS&LUP 1:1M soil map",
    host: "BHOOMI geoportal",
    via: "grid sampling",
    gives: "Texture, depth, drainage, pH class, parent material, per taluka",
    cannot:
      "Sampled on a 0.06° grid, so a taluka's minority soils are under-represented by construction.",
  },
  {
    file: "crop_scraper.py",
    source: "Area, Production and Yield statistics",
    host: "data.desagri.gov.in",
    via: "REST",
    gives: "Eight years of district-crop-season area, production and yield",
    cannot:
      "District level only, and the series stops at 2022-23 — the scraper refuses later years rather than inventing them.",
  },
  {
    file: "fertilizer_scraper.py",
    source: "SHC fertiliser recommendation table",
    host: "soilhealth4.dac.gov.in",
    via: "GraphQL",
    gives: "The government's own dose table: district × crop × soil class",
    cannot:
      "It is a lookup, not a model. Where the table is silent the engine must abstain.",
  },
];

export default function Page() {
  return (
    <Chapter href="/examiner/data">
      <Grid>
        <StatCard
          span={3}
          icon={Database}
          tone="blue"
          value={SCRAPERS.length}
          label="scrapers, all against government sources"
          sub="run by hand, not on a schedule"
        />
        <StatCard
          span={3}
          icon={CloudRain}
          tone="slate"
          value={29}
          label="years of daily weather"
          sub={`${weatherRows.toLocaleString("en-IN")} taluka-days in a single year`}
        />
        <StatCard
          span={3}
          icon={FlaskConical}
          tone="gold"
          value={fertRows.toLocaleString("en-IN")}
          label="rows in the government fertiliser table"
          sub="district × crop × soil class"
        />
        <StatCard
          span={3}
          icon={Map}
          tone="green"
          value={shc[shc.length - 1]?.rows ?? 351}
          label="talukas with Soil Health Card coverage"
          sub="across 34 districts"
        />
      </Grid>

      <Block
        title="Six scrapers, and what each one cannot tell you"
        lede="Every dataset is a government source. The second column matters most: its limits decide what the engine may claim."
      >
        <Grid>
          <Card
            span={12}
            n="Fig. 2.1"
            title="The sources"
            icon={Database}
            tone="blue"
            source="scrape data imp/"
            wide
            footnote="None run on a schedule. They are command-line scripts, and their output is validated before it goes near the engine — Fig. 2.2."
          >
            <Table
              head={[
                "Script",
                "Upstream",
                "What it gives",
                "What it cannot tell you",
              ]}
              numeric={[]}
              minWidth="52rem"
              rows={SCRAPERS.map((s) => ({
                cells: [s.file, s.host, s.gives, s.cannot],
                note: `${s.source} · ${s.via}`,
              }))}
            />
          </Card>

          <Card
            span={12}
            n="Fig. 2.2"
            title="From a government portal to a column in the feature store"
            icon={Route}
            tone="blue"
            lede="Five steps, one of them the scrape. A file that fails is quarantined with a note — never repaired, never dropped."
            source="scrape data imp/ · ml engine for Recommendation/scripts/ingest_weather.py"
          >
            <Flow {...SCRAPE_PATH} rowHeight={124} maxWidth={980} />
          </Card>

          <Card
            span={7}
            n="Fig. 2.3"
            title="What is actually on disk"
            lede="Counted by reading the files, not quoted from a plan. A representative file from each family."
            source="scrape data imp/output/"
            wide
          >
            <Table
              head={["Dataset", "Period", "Rows", "Columns", "Size"]}
              numeric={[2, 3, 4]}
              rows={SCRAPED_FILES.map((f) => ({
                cells: [
                  f.group,
                  f.period,
                  f.rows === null ? "—" : f.rows.toLocaleString("en-IN"),
                  f.columns ?? "—",
                  kB(f.bytes),
                ],
                note: f.name,
              }))}
            />
          </Card>

          <Card
            span={5}
            n="Fig. 2.4"
            title="Rows per dataset family"
            lede="Two panels: weather is ~300× the next largest file and would render every other bar as a hairline."
            source="scrape data imp/output/"
            footnote="Across the files sampled in Fig. 2.3. The full weather panel is 29 years of the top bar."
          >
            <BarRow
              labelWidth="lg"
              format={(v) => v.toLocaleString("en-IN")}
              rows={[
                {
                  label: "Daily weather",
                  value: SCRAPED_TOTALS["Daily weather"],
                  tone: "blue",
                  sub: "two years sampled, measured daily",
                },
              ]}
            />
            <p className="ex-source mt-5 border-t border-line pt-3">
              everything else, on its own scale
            </p>
            <div className="mt-3">
              <BarRow
                labelWidth="lg"
                format={(v) => v.toLocaleString("en-IN")}
                rows={Object.entries(SCRAPED_TOTALS)
                  .filter(([k]) => k !== "Daily weather")
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, value], i) => ({
                    label,
                    value,
                    tone: (["gold", "green", "slate"] as const)[i] ?? "mute",
                    sub: "measured once a season",
                  }))}
              />
            </div>
          </Card>

          <Card
            span={6}
            n="Fig. 2.5"
            title="Soil Health Card coverage, by cycle"
            icon={Map}
            tone="green"
            lede={`Against the ${ALL_TALUKAS} talukas the soil map lists — the only file in the set that covers the whole state.`}
            source="scrape data imp/output/maharashtra_all_parameters_*_talukas.csv"
            footnote={`Coverage is still short of complete, and the engine is built on the talukas that have a cycle. A taluka absent from all three years has no Soil Health Card evidence at all, and the gate has to reason about it from soil type and weather alone.`}
          >
            <ProgressRow
              tone="green"
              rows={shc.map((f) => ({
                label: `${f.period} cycle`,
                value: f.rows ?? 0,
                of: ALL_TALUKAS,
              }))}
            />
          </Card>

          <Card
            span={6}
            n="Fig. 2.6"
            title="Crop statistics, rows per year"
            icon={Filter}
            tone="slate"
            lede="District × crop × season. The count grows because more crop-season combinations are reported, not more districts."
            source="scrape data imp/output/maharashtra_crops_apy_*.csv"
            footnote="The series ends at 2022-23; the scraper refuses later years rather than interpolate. Eight years of labels binds both ranking margins in chapter 7."
          >
            <BarRow
              labelWidth="sm"
              format={(v) => v.toLocaleString("en-IN")}
              rows={crops.map((f) => ({
                label: f.period,
                value: f.rows ?? 0,
                tone: "slate" as const,
                sub: `${f.columns} columns`,
              }))}
            />
          </Card>
        </Grid>
      </Block>

      <Block
        title="Getting the data is the easy half"
        lede="Scraped data arrives wrong in ways that are quiet. Two of the checks below exist because something wrong got through once."
      >
        <Grid>
          <Card
            span={12}
            n="Fig. 2.7"
            title="What a weather file has to survive before the engine sees it"
            icon={CloudRain}
            tone="slate"
            lede="ingest_weather.py refuses any file that fails one of these. Replacing an existing file needs --force, after its MD5 is printed."
            source="ml engine for Recommendation/scripts/ingest_weather.py"
            footnote="Not defensive programming in the abstract: a duplicate did get through once, and the fourth check below is what catches it now."
          >
            <Pipeline
              feedback="A file that fails any step is quarantined under data/raw/_rejected/ with a README saying why — not deleted, so the rejection itself stays auditable."
              steps={[
                {
                  label: "Dates match the filename",
                  detail:
                    "The Date column has to agree with the span the name claims",
                },
                {
                  label: "Every taluka, every day",
                  detail: "358 talukas × 365 rows, no gaps",
                },
                {
                  label: "No empty cells",
                  detail: "POWER's −999 sentinel is a failure, not a value",
                },
                {
                  label: "Not a duplicate",
                  detail: "MD5 against every file already accepted",
                },
                {
                  label: "Column order exact",
                  detail:
                    "A reordered header silently shifts every downstream feature",
                },
              ]}
            />
          </Card>

          <Card span={12} quiet>
            <Honest title="One file was a byte-identical duplicate of another, and it was caught late">
              The file named{" "}
              <code className="font-mono text-[13px]">
                maharashtra_daily_weather_taluka_2022-04-01_to_2023-03-31.csv
              </code>{" "}
              is byte-for-byte identical to the 2025-26 file, and its own Date
              column reads 2025-04-01 to 2026-03-31. It claims to be a year it
              is not. It is quarantined rather than deleted, the rejection is
              recorded with a reason, and there is now a test that fails if it
              ever reappears in the engine&rsquo;s inputs.
            </Honest>
          </Card>

          <Card span={12} quiet>
            <DecisionCard decision={decision("nasa-power-over-imd")} />
          </Card>

          <Card
            span={12}
            n="Fig. 2.8"
            title="What this project does not have"
            icon={Ban}
            tone="clay"
            lede="Two absences worth stating plainly, because both are the kind of thing a demo usually papers over."
            source="ml engine for Recommendation/src/rules/fertiliser.py"
          >
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[14px] font-semibold text-ink">
                  There is no price scraper.
                </p>
                <Points
                  tone="clay"
                  items={[
                    "No market-price dataset exists anywhere in this repository",
                    "The only prices are eight hard-coded indicative rates — urea 5.36, DAP 27.00, SSP 9.50, MOP 34.00 ₹/kg",
                    "Labelled 2024-25 subsidised rates in the source; every cost figure is built from those eight numbers",
                  ]}
                />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-ink">
                  Crop statistics stop at 2022-23.
                </p>
                <p className="ex-caption mt-1 max-w-2xl">
                  The DES series ends there, and the scraper refuses later years
                  rather than interpolating. Every label the ranker learns from
                  is dated 2015-16 to 2022-23 — eight years, the binding
                  constraint on both ranking margins in chapter 7.
                </p>
              </div>
            </div>
          </Card>
        </Grid>
      </Block>
    </Chapter>
  );
}
