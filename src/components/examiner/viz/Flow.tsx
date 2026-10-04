import type { ReactNode } from "react";
import type { Tone } from "@/data/examiner/types";
import { cn } from "@/lib/cn";
import { DIA_FILL, DIA_LINE, TONE, WASH, q } from "./geom";

/**
 * Architecture diagrams: real DOM nodes on a CSS grid, with the edges drawn as
 * one SVG overlay behind them.
 *
 * Hand-written SVG was the obvious approach and is the wrong one at this width.
 * `site/recommend/LiebigStaves.tsx` already records the failure in this
 * codebase: a 400-unit viewBox stretched across a 1200px panel rendered its
 * 10-unit labels at 30px — "the chart shouted". Nodes here read "FastAPI
 * reading service :8000"; inside a scaled viewBox on a phone those land at
 * about four pixels.
 *
 * So the nodes are divs. They wrap their own text, balance it, scale with the
 * reader's font size, can be selected and copied, print, and take their colours
 * from the same tokens as everything else — which is also why no diagram here
 * needs a dark-mode variant.
 *
 * The edges are percentages of the same grid the nodes sit in, so both derive
 * from one set of integer (col, row) constants and stay glued with no
 * measurement, no `getBoundingClientRect`, no effect and no client JavaScript.
 * Routing is arithmetic on cell boundaries — deterministic, and quantised
 * through `q()` like everything else that becomes an attribute.
 *
 * Two things the geometry depends on, both load-bearing:
 *
 *   The canvas is `rows × rowHeight` **exactly**, not a `min-height`. Equal
 *   `1fr` rows inside a known height are the whole reason a percentage anchor
 *   lands on a cell boundary. A `min-height` lets the grid settle at its
 *   content height while the `inset-0` overlay keeps mapping 0–100 across the
 *   box, and every edge in the section is then computed against a canvas taller
 *   than the nodes occupy. It also makes the boxes a uniform size, which is
 *   most of why a diagram reads as drawn rather than as assembled.
 *
 *   Anchors are inset by the node's own margin, so a line touches the box it
 *   points at instead of stopping in the gutter six pixels short.
 *
 * One thing the routing does not do is avoid obstacles: an elbow between two
 * cells is drawn whether or not a node sits between them, and an edge that
 * passes through one reads as if that node were the sender. Lay the diagram out
 * so it does not happen — a fan is one column of targets, not a block.
 *
 * Arrowheads are DOM, not SVG markers: the overlay uses
 * `preserveAspectRatio="none"` so a marker would be sheared by whatever aspect
 * ratio the container happens to have. Every edge arrives on one of four sides,
 * so the rotation is a quarter turn and needs no trigonometry. Edge labels are
 * DOM for the same reason.
 */

export type Side = "t" | "r" | "b" | "l";

export type FlowNode = {
  id: string;
  /** 1-based grid position. */
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
  kind?: "process" | "store" | "external" | "group" | "note";
  label: string;
  /** ":8000", "ARM64 Fargate" — set in the mono face under the label. */
  sub?: string;
  /** Facts that belong inside the box rather than in the prose. Keep to two. */
  meta?: readonly string[];
  tone?: Tone;
};

export type FlowEdge = {
  from: string;
  to: string;
  fromSide?: Side;
  toSide?: Side;
  label?: string;
  kind?: "data" | "control" | "veto" | "retry" | "offline";
  /** Nudge along the shared gutter, to separate parallel edges. */
  offset?: number;
};

type EdgeKind = NonNullable<FlowEdge["kind"]>;

/**
 * Line weight, colour and dash carry the kind of connection, and the legend
 * under the diagram names them. A reader should not have to be told in prose
 * that the red line is the veto — the picture says which line is which, and the
 * dash pattern survives a black-and-white print, which colour does not.
 *
 * `stroke` and `ink` are two different colours on purpose. A line is a
 * non-text UI component and clears its bar at 3:1, which is why the diagram
 * palette can be as bright as it is. The label riding on that line is text and
 * owes 4.5:1. Painting the label in the line's own colour put nine of them
 * between 3.2 and 3.6 against the canvas — so the label takes the darker
 * accent token the rest of the section sets type in, and only the line keeps
 * the bright one.
 */
const EDGE_STYLE: Record<
  EdgeKind,
  { stroke: string; ink: string; dash?: string; name: string }
> = {
  data: { stroke: "var(--dia-edge)", ink: "var(--dia-edge)", name: "request" },
  control: {
    stroke: DIA_LINE.gold,
    ink: TONE.gold,
    dash: "5 4",
    name: "in-process step",
  },
  veto: { stroke: DIA_LINE.clay, ink: TONE.clay, name: "veto" },
  retry: { stroke: DIA_LINE.gold, ink: TONE.gold, dash: "2 4", name: "retry" },
  offline: {
    stroke: DIA_LINE.slate,
    ink: TONE.slate,
    dash: "7 5",
    name: "reads and writes",
  },
};

/** Named on the stacked rendering, where the box shape has to carry it alone. */
const KIND_NAME: Record<NonNullable<FlowNode["kind"]>, string | null> = {
  process: null,
  store: "store",
  external: "outside the system",
  group: null,
  note: "code, not a service",
};

/**
 * The inset between a node and its cell boundary, in pixels, per side — so the
 * gutter between two neighbours is twice this.
 *
 * Nine, not seven, because a label pill is about seventeen pixels tall and an
 * eighteen-pixel gutter is what lets one sit on a vertical connector without
 * covering the first line of the box underneath it.
 */
const NODE_M = 9;

/** Corner radius of an elbow, in pixels. */
const ELBOW_R = 10;

/**
 * An orthogonal polyline with rounded corners.
 *
 * The radius has to be given per axis. The overlay is `preserveAspectRatio
 * ="none"`, so one viewBox unit is a different number of pixels across than it
 * is down, and a corner cut equally in both would arrive on screen as a quarter
 * of an ellipse leaning whichever way the container happens to be shaped. Given
 * `rx` and `ry` already converted from the same pixel radius, the two arms are
 * trimmed by different amounts and the shear puts them back together square.
 *
 * The corner itself is a quadratic Bézier with the corner as its control point:
 * a circular arc would need the same per-axis correction applied a second time
 * inside the arc flags, and at ten pixels nobody can tell the two apart.
 */
function roundedPath(
  points: readonly (readonly [number, number])[],
  rx: number,
  ry: number,
): string {
  if (points.length < 2) return "";
  const [sx, sy] = points[0];
  let d = `M ${sx} ${sy}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    // Orthogonal routing: each arm moves along exactly one axis.
    const inX = cx !== px;
    // Never eat more than half an arm, or two tight corners meet and cross.
    const back = inX
      ? Math.min(rx, Math.abs(cx - px) / 2)
      : Math.min(ry, Math.abs(cy - py) / 2);
    const fwd = inX
      ? Math.min(ry, Math.abs(ny - cy) / 2)
      : Math.min(rx, Math.abs(nx - cx) / 2);
    const ax = inX ? q(cx - Math.sign(cx - px) * back) : cx;
    const ay = inX ? cy : q(cy - Math.sign(cy - py) * back);
    const bx = inX ? cx : q(cx + Math.sign(nx - cx) * fwd);
    const by = inX ? q(cy + Math.sign(ny - cy) * fwd) : cy;
    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }
  const [ex, ey] = points[points.length - 1];
  return `${d} L ${ex} ${ey}`;
}

export function Flow({
  nodes,
  edges,
  cols,
  rows,
  caption,
  order,
  legend = true,
  rowHeight = 108,
  maxWidth = 720,
}: {
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  cols: number;
  rows: number;
  caption?: string;
  /** Reading order for the stacked rendering and the text equivalent. */
  order?: readonly string[];
  /** Set false where a diagram has one kind of edge and the key is noise. */
  legend?: boolean;
  /**
   * Height of one grid row, in pixels. The canvas is exactly `rows × this`, so
   * every box in every diagram in the section is the same height unless it
   * spans. Raise it for a diagram whose nodes carry `meta`.
   */
  rowHeight?: number;
  maxWidth?: number;
}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const height = rows * rowHeight;

  // A pixel length as a percentage of each axis. The height is exact; the width
  // is the cap, so on a narrower screen corners round a shade more generously
  // and insets sit a shade further out — neither is visible, and both stay
  // deterministic, which is the property that actually matters here.
  const px = (v: number) => q((v / maxWidth) * 100);
  const py = (v: number) => q((v / height) * 100);

  // Cell geometry, in percentages of the grid, inset to the node's own edge so
  // an edge touches the box rather than stopping in the gutter.
  const anchor = (n: FlowNode, side: Side) => {
    const cx = q(((n.col - 1 + (n.colSpan ?? 1) / 2) / cols) * 100);
    const cy = q(((n.row - 1 + (n.rowSpan ?? 1) / 2) / rows) * 100);
    const right = q(((n.col - 1 + (n.colSpan ?? 1)) / cols) * 100 - px(NODE_M));
    const left = q(((n.col - 1) / cols) * 100 + px(NODE_M));
    const bottom = q(
      ((n.row - 1 + (n.rowSpan ?? 1)) / rows) * 100 - py(NODE_M),
    );
    const top = q(((n.row - 1) / rows) * 100 + py(NODE_M));
    if (side === "r") return { x: right, y: cy };
    if (side === "l") return { x: left, y: cy };
    if (side === "b") return { x: cx, y: bottom };
    return { x: cx, y: top };
  };

  /** Which sides two nodes face each other on, when not stated. */
  const infer = (a: FlowNode, b: FlowNode): [Side, Side] => {
    const dc = b.col - a.col;
    const dr = b.row - a.row;
    if (Math.abs(dc) >= Math.abs(dr)) return dc >= 0 ? ["r", "l"] : ["l", "r"];
    return dr >= 0 ? ["b", "t"] : ["t", "b"];
  };

  const routed = edges.flatMap((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return [];
    const [fs, ts] =
      e.fromSide && e.toSide ? [e.fromSide, e.toSide] : infer(a, b);
    const p0 = anchor(a, fs);
    const p1 = anchor(b, ts);
    const nudge = (e.offset ?? 0) * (100 / rows) * 0.3;

    // An orthogonal elbow through the gutter between the two cells. Horizontal
    // pairs turn at the midpoint in x, vertical pairs at the midpoint in y.
    let points: [number, number][];
    if (fs === "r" || fs === "l") {
      const mx = q((p0.x + p1.x) / 2);
      points =
        q(p0.y) === q(p1.y)
          ? [
              [p0.x, p0.y],
              [p1.x, p1.y],
            ]
          : [
              [p0.x, p0.y],
              [mx, p0.y],
              [mx, p1.y],
              [p1.x, p1.y],
            ];
    } else {
      const my = q((p0.y + p1.y) / 2 + nudge);
      points =
        q(p0.x) === q(p1.x)
          ? [
              [p0.x, p0.y],
              [p1.x, p1.y],
            ]
          : [
              [p0.x, p0.y],
              [p0.x, my],
              [p1.x, my],
              [p1.x, p1.y],
            ];
    }

    // The label goes on the longest straight run of the edge, which is both the
    // piece most likely to be clear of a node and the only one with room for
    // a word. Length is measured in pixels, not in viewBox units: the two axes
    // are scaled differently and comparing them raw picks the wrong segment.
    //
    // What counts as room then depends on which way the run goes, and getting
    // that wrong is why the first version fell back to numbered markers on
    // almost every diagram. A pill on a HORIZONTAL run has to fit its own
    // width along the line. On a VERTICAL one it only has to fit its height:
    // the run sits in the gutter between two rows, and there is nothing either
    // side of it at that height to collide with, so the pill may be as wide as
    // the words need.
    let best = 0;
    let bestLen = -1;
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const len =
        Math.abs(x1 - x0) * (maxWidth / 100) +
        Math.abs(y1 - y0) * (height / 100);
      if (len > bestLen) {
        bestLen = len;
        best = i;
      }
    }
    const [ma, mb] = [points[best], points[best + 1]];

    return [
      {
        ...e,
        points,
        head: { ...p1, side: ts },
        mid: {
          x: q((ma[0] + mb[0]) / 2),
          y: q((ma[1] + mb[1]) / 2),
          // Room on that run, in pixels, against what the pill needs. Below it
          // the label becomes a numbered marker and the key spells it out —
          // which is how a printed engineering drawing has always handled a
          // callout that will not fit beside the thing it names.
          // The vertical bar is the gutter itself, less a pixel. An edge
          // straight down between two neighbours is exactly `2 × NODE_M` long,
          // and the two anchors are each quantised to three decimals of a
          // percentage before being turned back into pixels — so that edge
          // measures 17.99984 and a test for the round number rejects the one
          // case it was written to admit.
          fits:
            q(ma[1]) === q(mb[1])
              ? bestLen > (e.label?.length ?? 0) * 6.4 + 26
              : bestLen >= NODE_M * 2 - 1,
          // Which way to step a marker off the line, so it lands in the gutter
          // rather than on the first line of the node it points at.
          horizontal: q(ma[1]) === q(mb[1]),
        },
        style: EDGE_STYLE[e.kind ?? "data"],
      },
    ];
  });

  const reading = (order ?? nodes.map((n) => n.id))
    .map((id) => byId.get(id))
    .filter(Boolean) as FlowNode[];

  const pills = routed.filter((e) => e.label && e.mid.fits);
  const marked = routed
    .filter((e) => e.label && !e.mid.fits)
    .map((e, i) => ({ ...e, tag: i + 1 }));

  // One entry per kind actually drawn, in the order the styles are declared, so
  // two diagrams that share a kind list it in the same place.
  const kinds = (Object.keys(EDGE_STYLE) as EdgeKind[]).filter((k) =>
    routed.some((e) => (e.kind ?? "data") === k),
  );

  return (
    // Full height, so a diagram in a short card next to a tall one fills the
    // cell instead of leaving a card-sized hole under it. The canvas grows and
    // the drawing stays centred in it — the dot grid reads as a board with room
    // around the picture, which is what it should have looked like anyway.
    <div className="flex h-full flex-col">
      {/* Wide: the diagram, on its own canvas.

          The dot grid is the one piece of pure decoration in the section and it
          earns its place: it separates the drawing from the card it sits on, so
          a reader knows where the picture starts, and it gives the boxes
          something to sit on rather than float against. It prints white — on
          paper the page edge does the same job. */}
      <div
        className="ex-dia-canvas relative mx-auto hidden w-full flex-col justify-center overflow-hidden rounded-[16px] border border-line p-3 md:flex"
        style={{ maxWidth: maxWidth + 24, minHeight: height + 24 }}
        aria-hidden
      >
        {/* Capped: at 1440 the content column is ~1000px, and three fluid
            columns put 330px of box around forty characters of label. A diagram
            is easier to read when the boxes are close to the size of their
            contents. */}
        <div className="relative w-full shrink-0" style={{ height }}>
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {routed.map((e, i) => (
              <path
                key={i}
                d={roundedPath(e.points, px(ELBOW_R), py(ELBOW_R))}
                fill="none"
                stroke={e.style.stroke}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={e.style.dash}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* No `gap` on the grid, and a margin on each node instead.
              A gap makes the real cell boundaries smaller than the fractions
              `anchor()` computes from (col, row), so every arrowhead and every
              edge label lands a few pixels inside the next node rather than in
              the gutter — the error grows with the gap and with the row count.
              Insetting the node keeps the same visual gutter and leaves the
              arithmetic exact. */}
          <div
            className="relative grid h-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {nodes.map((n) => {
              const tone = n.tone ?? "mute";
              const kind = n.kind ?? "process";
              return (
                <div
                  key={n.id}
                  style={{
                    gridColumn: `${n.col} / span ${n.colSpan ?? 1}`,
                    gridRow: `${n.row} / span ${n.rowSpan ?? 1}`,
                    margin: NODE_M,
                    background:
                      kind === "group" ? "transparent" : DIA_FILL[tone],
                    borderColor: DIA_LINE[tone],
                  }}
                  className={cn(
                    "flex flex-col justify-center overflow-hidden rounded-[12px] border-[1.5px] px-3 py-2 shadow-card",
                    // Shape carries what colour cannot: a box the system only
                    // talks to, rather than runs, is drawn open.
                    (kind === "external" || kind === "group") &&
                      "border-dashed",
                  )}
                >
                  <NodeBody node={n} />
                </div>
              );
            })}
          </div>

          {/* Heads and labels come after the grid: both sit on a node's own
              edge, and the grid is opaque, so drawn before it they are half
              covered. */}
          {routed.map((e, i) => (
            <Arrow
              key={`h${i}`}
              x={e.head.x}
              y={e.head.y}
              side={e.head.side}
              colour={e.style.stroke}
            />
          ))}

          {pills.map((e, i) => (
            <span
              key={`p${i}`}
              className="ex-dia-pill pointer-events-none absolute rounded-full border px-2 py-[2px] text-[11px] leading-none font-medium whitespace-nowrap"
              style={{
                left: `${e.mid.x}%`,
                top: `${e.mid.y}%`,
                transform: "translate(-50%, -50%)",
                borderColor: e.style.stroke,
                color: e.style.ink,
              }}
            >
              {e.label}
            </span>
          ))}

          {marked.map((e) => (
            <span
              key={`m${e.tag}`}
              className="ex-dia-pill pointer-events-none absolute grid size-5 place-items-center rounded-full border font-mono text-[11px] leading-none"
              style={{
                left: `${e.mid.x}%`,
                top: `${e.mid.y}%`,
                // Centred on the line the marker straddles a cell boundary and
                // covers the first word of the node below it. Stepped one
                // radius to the side it sits beside the line, in the gutter.
                transform: e.mid.horizontal
                  ? "translate(-50%, -50%) translateY(-12px)"
                  : "translate(-50%, -50%) translateX(-12px)",
                borderColor: e.style.stroke,
                color: e.style.ink,
              }}
            >
              {e.tag}
            </span>
          ))}
        </div>
      </div>

      {/* Narrow: the honest rendering of a twelve-node topology on a phone is a
          numbered stack, not a squeezed diagram. */}
      <ol className="flex flex-col md:hidden">
        {reading.map((n, i) => {
          const tone = n.tone ?? "mute";
          const kind = n.kind ?? "process";
          return (
            <li key={n.id} className="flex gap-3">
              <div className="flex shrink-0 flex-col items-center">
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full border-[1.5px] font-mono text-[12px] tabular-nums"
                  style={{
                    borderColor: DIA_LINE[tone],
                    color: TONE[tone],
                    background: DIA_FILL[tone],
                  }}
                >
                  {i + 1}
                </span>
                {i < reading.length - 1 ? (
                  <span aria-hidden className="w-px flex-1 bg-line" />
                ) : null}
              </div>
              <div
                style={{
                  background: DIA_FILL[tone],
                  borderColor: DIA_LINE[tone],
                }}
                className={cn(
                  "mb-2 min-w-0 flex-1 rounded-[12px] border-[1.5px] px-3 py-2.5",
                  (kind === "external" || kind === "group") && "border-dashed",
                )}
              >
                <NodeBody node={n} />
                {KIND_NAME[kind] ? (
                  <span className="ex-source mt-1 block">
                    {KIND_NAME[kind]}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* The text equivalent: for a screen reader, and for the printed copy. */}
      <ol className="sr-only">
        {routed.map((e, i) => (
          <li key={i}>
            {byId.get(e.from)?.label} → {byId.get(e.to)?.label}
            {e.label ? ` (${e.label})` : ""}
          </li>
        ))}
      </ol>

      {legend && (kinds.length > 1 || marked.length > 0) ? (
        <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {marked.map((e) => (
            <li
              key={`k${e.tag}`}
              className="ex-caption flex items-center gap-1.5 leading-none"
            >
              <span
                className="grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[11px] leading-none"
                style={{ borderColor: e.style.stroke, color: e.style.ink }}
              >
                {e.tag}
              </span>
              {e.label}
            </li>
          ))}
          {kinds.length > 1 &&
            kinds.map((k) => (
              <li
                key={k}
                className="ex-caption flex items-center gap-2 leading-none"
              >
                <span
                  aria-hidden
                  className="inline-block h-0 w-6 shrink-0"
                  style={{
                    borderTopWidth: 2,
                    borderTopStyle: EDGE_STYLE[k].dash ? "dashed" : "solid",
                    borderTopColor: EDGE_STYLE[k].stroke,
                  }}
                />
                {EDGE_STYLE[k].name}
              </li>
            ))}
        </ul>
      ) : null}

      {caption ? <p className="ex-caption mt-3">{caption}</p> : null}
    </div>
  );
}

function NodeBody({ node }: { node: FlowNode }) {
  // `block`, not inherited stacking. The wide rendering puts these in a flex
  // column and the narrow one in a plain div, and as inline spans the second
  // one ran on from the first — "Government portalGraphQL or REST" on every
  // diagram at phone width.
  return (
    <>
      <span className="block text-[13px] leading-tight font-semibold text-balance text-ink">
        {node.label}
      </span>
      {node.sub ? (
        <span className="mt-0.5 block font-mono text-[12px] break-words text-ink-mute">
          {node.sub}
        </span>
      ) : null}
      {node.meta?.length ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {node.meta.map((m) => (
            <li key={m} className="ex-caption leading-tight">
              {m}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** A quarter-turn triangle in DOM, so the overlay's shear cannot reach it. */
function Arrow({
  x,
  y,
  side,
  colour,
}: {
  x: number;
  y: number;
  side: Side;
  colour: string;
}) {
  // The triangle is built from a top border, so it points DOWN unrotated.
  // `side` is the side of the TARGET the edge arrives on, so an edge landing on
  // a node's top must point down into it — not away from it.
  const rotate = { t: 0, r: 90, b: 180, l: 270 }[side];

  // Pixels, not percentages. The element is 0×0 with the triangle painted in
  // its borders, and a percentage translate resolves against the border box —
  // which is zero — so `translate(-50%, -50%)` moves it exactly nowhere. Every
  // arrowhead in the section was landing a few pixels inside the node it
  // pointed at, tip buried under the first line of the label.
  //
  // Unrotated, the apex sits 4px below the centre of rotation. CSS `rotate`
  // takes that offset to (−4,0), (0,−4) and (4,0) at a quarter, a half and
  // three quarters of a turn, so the shift that puts the apex exactly on the
  // anchor is one of four constants.
  const nudge = { t: [-5, -8], r: [-1, -4], b: [-5, 0], l: [-9, -4] }[side];
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(${nudge[0]}px, ${nudge[1]}px) rotate(${rotate}deg)`,
        width: 0,
        height: 0,
        borderLeft: "5px solid transparent",
        borderRight: "5px solid transparent",
        borderTop: `8px solid ${colour}`,
      }}
    />
  );
}

export type PipelineStep = {
  label: string;
  sub?: string;
  detail?: ReactNode;
  tone?: Tone;
  /** "learned", "rules", "lookup" — what kind of thing this stage is. */
  badge?: string;
};

/**
 * A linear chain, for the pipelines that genuinely are linear: the OCR search,
 * the retrieval path, the engine's S0 to S4.
 *
 * Drawn as a track with a numbered stop at each stage — horizontal on a laptop,
 * vertical on a phone — rather than as a row of detached boxes. The line is the
 * whole point: a reader should be able to see that these six things happen in
 * this order without being told, and a gap between two rounded rectangles does
 * not say that.
 *
 * No overlay, so nothing distorts at either width, and the rail is a 1px border
 * that prints.
 */
export function Pipeline({
  steps,
  feedback,
}: {
  steps: readonly PipelineStep[];
  /** The one back-edge that matters, described rather than drawn. */
  feedback?: string;
}) {
  const last = steps.length - 1;

  return (
    <div>
      <ol className="flex flex-col lg:flex-row lg:items-stretch">
        {steps.map((s, i) => {
          const tone = s.tone ?? "mute";
          return (
            <li
              key={s.label}
              className="flex min-w-0 flex-1 gap-3 lg:flex-col lg:gap-0"
            >
              {/* The rail. Vertical on a phone, horizontal on a laptop, one
                  element either way so the two never drift apart. */}
              <div className="flex shrink-0 flex-col items-center lg:w-full lg:flex-row lg:items-center lg:pr-2">
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-medium tabular-nums"
                  // `TONE`, not `DIA_LINE`: white on the bright border green
                  // is 3.22:1. The accent token is the one measured for type.
                  style={{
                    background: TONE[tone],
                    color: "var(--color-on-accent)",
                  }}
                >
                  {i + 1}
                </span>
                {i < last ? (
                  <>
                    <span
                      aria-hidden
                      className="w-px flex-1 bg-line lg:hidden"
                    />
                    <span
                      aria-hidden
                      className="hidden h-px flex-1 bg-line lg:block"
                    />
                  </>
                ) : null}
              </div>

              <div className="min-w-0 flex-1 pb-3 lg:pt-3 lg:pr-2 lg:pb-0">
                <div
                  className="h-full rounded-[12px] border-[1.5px] px-3 py-2.5 shadow-card"
                  style={{
                    background: DIA_FILL[tone],
                    borderColor: DIA_LINE[tone],
                  }}
                >
                  {s.badge ? (
                    <span
                      className="ex-source mb-1 inline-block rounded-full px-2 py-0.5"
                      style={{
                        background: WASH[tone],
                        color: TONE[tone],
                      }}
                    >
                      {s.badge}
                    </span>
                  ) : null}
                  <span className="block text-[13px] leading-tight font-semibold text-balance text-ink">
                    {s.label}
                  </span>
                  {s.sub ? (
                    <span className="mt-0.5 block font-mono text-[12px] text-ink-mute">
                      {s.sub}
                    </span>
                  ) : null}
                  {s.detail ? (
                    <p className="ex-caption mt-1.5 leading-tight">
                      {s.detail}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {feedback ? (
        <p className="ex-caption mt-4 border-l-2 border-clay pl-3">
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
