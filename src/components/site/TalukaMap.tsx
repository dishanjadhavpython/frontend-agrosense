"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { title } from "@/lib/format";
import type { AtlasResponse, AtlasTaluka } from "@/lib/recommendTypes";

/**
 * Maharashtra, drawn from the feature store itself — one dot per taluka at
 * its real coordinates, shaded by aridity. Nothing here is a stock outline;
 * the shape of the state emerges from where the 351 surveyed talukas are.
 *
 * A faithful port of the recommend engine's own built-in console
 * (`ml engine for Recommendation/src/serve/static/app.js`'s `drawAtlas`),
 * rebuilt as a React/SVG component on this site's own design tokens rather
 * than reused as a static asset — the console's map is the reference for the
 * geometry, not for the visual language.
 */

/** Maharashtra spans ~7.8deg of longitude and ~6.1deg of latitude; after the
 *  cos(lat) correction that's 7.4 x 6.1, so the frame is wider than tall. */
const ATLAS = { w: 620, h: 500, pad: 26 };

/** The plate image is a plain equirectangular map whose aspect (1.208)
 *  matches Maharashtra's true lat-corrected aspect (1.214) closely enough to
 *  georeference directly. STATE is the real extent of the state; INSET is
 *  where the outline sits inside the image, which carries whitespace on
 *  every side. Both are needed or the dots float off the coast. */
const STATE = { lon: [72.65, 80.9] as const, lat: [15.6, 22.03] as const };
const INSET = { x0: 0.055, x1: 0.97, y0: 0.04, y1: 0.96 };

function projector() {
  const [lat0, lat1] = STATE.lat;
  const [lon0, lon1] = STATE.lon;
  // longitude degrees shrink with latitude; without the correction the state
  // comes out visibly too wide
  const k = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
  const spanX = (lon1 - lon0) * k;
  const spanY = lat1 - lat0;
  const scale = Math.min(
    (ATLAS.w - ATLAS.pad * 2) / spanX,
    (ATLAS.h - ATLAS.pad * 2) / spanY,
  );
  const offX = (ATLAS.w - spanX * scale) / 2;
  const offY = (ATLAS.h - spanY * scale) / 2;
  return (lon: number, lat: number): [number, number] => [
    offX + (lon - lon0) * k * scale,
    ATLAS.h - offY - (lat - lat0) * scale,
  ];
}

/** arid -> wet: vermilion, sand, cream. */
const ARID_STOPS: [number, number, number][] = [
  [227, 83, 54],
  [244, 164, 96],
  [245, 245, 220],
];
function aridColour(a: number, lo: number, hi: number): string {
  const t = Math.max(0, Math.min(1, (a - lo) / (hi - lo || 1))) * (ARID_STOPS.length - 1);
  const i = Math.min(Math.floor(t), ARID_STOPS.length - 2);
  const f = t - i;
  const c = ARID_STOPS[i].map((v, j) => Math.round(v + (ARID_STOPS[i + 1][j] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

type Point = AtlasTaluka & { px: number; py: number };

/** Nearest taluka in a compass direction, weighted so the walk stays on-axis. */
function nearestIn(points: Point[], from: Point, dx: number, dy: number): Point | null {
  let best: Point | null = null;
  let bestCost = Infinity;
  for (const p of points) {
    if (p === from) continue;
    const vx = p.px - from.px;
    const vy = p.py - from.py;
    const along = vx * dx + vy * dy;
    if (along <= 2) continue; // wrong side
    const off = Math.abs(vx * dy - vy * dx); // perpendicular drift
    const cost = along + off * 2.5;
    if (cost < bestCost) {
      bestCost = cost;
      best = p;
    }
  }
  return best;
}

export function TalukaMap({
  atlas,
  value,
  onChange,
  mr,
  className,
}: {
  atlas: AtlasResponse;
  value: { district: string; taluka: string } | null;
  onChange: (row: { District: string; Taluka: string }) => void;
  mr: boolean;
  className?: string;
}) {
  const project = useMemo(() => projector(), []);

  const points = useMemo<Point[]>(
    () =>
      atlas.talukas.map((k) => {
        const [px, py] = project(k.x, k.y);
        return { ...k, px, py };
      }),
    [atlas.talukas, project],
  );

  // Shaded by rank, not by raw value. The aridity index runs 0.31-2.45, but
  // the top of that range is a handful of Konkan talukas; on a linear scale
  // they took the whole wet half of the ramp and every inland taluka landed
  // in the same vermilion, so the Marathwada drought belt and the wetter east
  // of Vidarbha looked identical. By rank, each stretch of the ramp holds the
  // same number of talukas and the inland gradient becomes visible. The order
  // is unchanged, so the legend (arid -> wet, no numbers) still reads true.
  const rankOf = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.a - b.a);
    const last = Math.max(sorted.length - 1, 1);
    return new Map(sorted.map((p, i) => [p, i / last]));
  }, [points]);
  const maskId = useId();

  const plate = useMemo(() => {
    const [ax, ay] = project(STATE.lon[0], STATE.lat[1]); // north-west
    const [bx, by] = project(STATE.lon[1], STATE.lat[0]); // south-east
    const outlineW = bx - ax;
    const outlineH = by - ay;
    const imgW = outlineW / (INSET.x1 - INSET.x0);
    const imgH = outlineH / (INSET.y1 - INSET.y0);
    return { x: ax - INSET.x0 * imgW, y: ay - INSET.y0 * imgH, w: imgW, h: imgH };
  }, [project]);

  const selected = value
    ? points.find((p) => p.d === value.district.toUpperCase() && p.t === value.taluka.toUpperCase())
    : undefined;

  const [hover, setHover] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const readout = hover
    ? `${title(hover.t)} · ${title(hover.d)}`
    : cursor
      ? `${title(cursor.t)} · ${title(cursor.d)} · ${cursor.r} mm/yr`
      : selected
        ? `${selected.r} mm/yr · ${selected.w} mm root-zone water · ${selected.l} day growing period`
        : mr
          ? "३५१ तालुके · अनावृष्टीनुसार रंगवलेले"
          : "351 talukas · shaded by aridity";

  const pick = (p: Point) => {
    setCursor(p);
    onChange({ District: p.d, Taluka: p.t });
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (e.key === "Enter" || e.key === " ") {
      if (cursor) {
        e.preventDefault();
        pick(cursor);
      }
      return;
    }
    const dir = dirs[e.key];
    if (!dir) return;
    e.preventDefault();
    const from = cursor ?? selected ?? points[0];
    const next = nearestIn(points, from, dir[0], dir[1]) ?? from;
    setCursor(next);
  };

  return (
    <div className={cn("select-none", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${ATLAS.w} ${ATLAS.h}`}
        className="w-full rounded-[var(--radius-card)] outline-none"
        role="group"
        aria-label={mr ? "महाराष्ट्राचा तालुका नकाशा" : "Maharashtra taluka map"}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(null)}
      >
        {/* The plate PNG is only its boundary lines, in beige, on a
            transparent ground — beige on paper, which is all but invisible.
            Used as a mask instead, so the lines take a design token: they read
            on the light ground and follow the dark theme rather than glowing. */}
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <image
              href="/img/recommend/maharashtra.png"
              x={plate.x}
              y={plate.y}
              width={plate.w}
              height={plate.h}
              preserveAspectRatio="none"
            />
          </mask>
        </defs>
        <rect
          x={plate.x}
          y={plate.y}
          width={plate.w}
          height={plate.h}
          fill="var(--color-ink-mute)"
          opacity={0.55}
          mask={`url(#${maskId})`}
          aria-hidden
        />

        {points.map((p) => {
          const isSelected = selected === p;
          const isCursor = cursor === p && !isSelected;
          return (
            <circle
              key={`${p.d}-${p.t}`}
              cx={p.px}
              cy={p.py}
              r={isSelected ? 5.2 : isCursor ? 4.4 : 3.6}
              fill={aridColour(rankOf.get(p) ?? 0, 0, 1)}
              stroke={isSelected || isCursor ? "var(--color-ink)" : "none"}
              strokeWidth={isSelected ? 1.5 : isCursor ? 1 : 0}
              className="cursor-pointer transition-[r] duration-150"
              onClick={() => pick(p)}
              onMouseEnter={() => setHover(p)}
              onFocus={() => setCursor(p)}
            >
              <title>
                {title(p.t)}, {title(p.d)} — {p.r} mm/yr
              </title>
            </circle>
          );
        })}

        {cursor ? (
          <circle
            cx={cursor.px}
            cy={cursor.py}
            r={9}
            fill="none"
            stroke="var(--color-leaf-4)"
            strokeWidth={2}
            className="pointer-events-none"
          />
        ) : null}

        {selected ? (
          <>
            <circle
              cx={selected.px}
              cy={selected.py}
              r={6}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth={1.5}
              className="pointer-events-none"
            />
            <text
              x={selected.px + (selected.px > ATLAS.w * 0.62 ? -10 : 10)}
              y={selected.py - 10}
              textAnchor={selected.px > ATLAS.w * 0.62 ? "end" : "start"}
              className="pointer-events-none text-[13px] font-semibold"
              fill="var(--color-ink)"
            >
              {title(selected.t)}
            </text>
          </>
        ) : null}
      </svg>

      <p aria-live="polite" className="mt-2 text-center font-mono text-[12px] text-ink-mute">
        {readout}
      </p>

      <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-ink-mute">
        <span>{mr ? "रुक्ष" : "arid"}</span>
        <span
          className="h-2 w-24 rounded-full"
          style={{ background: `linear-gradient(90deg, ${aridColour(0, 0, 1)}, ${aridColour(0.5, 0, 1)}, ${aridColour(1, 0, 1)})` }}
          aria-hidden
        />
        <span>{mr ? "ओलसर" : "wet"}</span>
      </div>
    </div>
  );
}
