"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { interpolateRgb } from "d3-interpolate";
import { courtGeometry, COURT_WIDTH, COURT_HEIGHT } from "./BasketballCourt";
import type { ZoneSummary } from "@/types";

// ============================================================
// Types
// ============================================================

interface ShotZoneOverlayProps {
  zoneSummary: ZoneSummary[];
}

interface TooltipState {
  x: number;
  y: number;
  zone: string;
  fgm: number;
  fga: number;
  fgPct: number;
  leagueAvg: number;
}

// ============================================================
// Court geometry destructured
// ============================================================

const {
  BASKET_X,
  BASKET_Y,
  BASELINE_Y,
  PAINT_LEFT,
  PAINT_RIGHT,
  FT_LINE_Y,
  RESTRICTED_RADIUS,
  THREE_ARC_RADIUS,
  THREE_CORNER_X,
  THREE_CORNER_START_Y,
  HALF_COURT_Y,
} = courtGeometry;

// ============================================================
// Color scale (same as ShotChartHeatMap)
// ============================================================

const COLOR_COLD = "#3B82F6";
const COLOR_NEUTRAL = "#F8FAFC";
const COLOR_HOT = "#EF4444";
const MAX_DIFF = 0.15; // ±15 pp = full saturation

// ============================================================
// Zone Path Generators
//
// All paths are in SVG coordinates where:
//   - Basket at (250, 420), baseline at y=472.5, half-court at y=2.5
//   - Y increases downward in SVG
// ============================================================

/** Generate points along a circle arc (for building closed paths). */
function arcPoints(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number,
  segments: number
): string[] {
  const pts: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const angleDeg =
      startAngleDeg + (i / segments) * (endAngleDeg - startAngleDeg);
    const angle = (angleDeg * Math.PI) / 180;
    const x = cx + r * Math.cos(angle);
    // In SVG, positive Y is down, so sin goes downward
    const y = cy + r * Math.sin(angle);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts;
}

/**
 * Generate points along the 3PT arc in SVG coordinates.
 * The arc is a circle centered at basket (250, 420) with radius 237.5.
 * In SVG coords (Y-down), angles are measured from positive-X axis clockwise.
 * The arc starts on the left at the corner junction and goes over the top
 * to the right corner junction.
 *
 * Left junction:  SVG (30, 330.5)   → angle ≈ -69.6° from center (or 290.4°)
 * Right junction: SVG (470, 330.5)  → angle ≈ -110.4° from center (or 249.6°)
 * Top of arc:     SVG (250, 182.5)  → angle = -90° (or 270°)
 *
 * We use nba_api-style angles: measured from positive-X, counter-clockwise.
 * cornerAngle ≈ 22.1° from positive-X.
 * Left junction is at angle (180 - 22.1) = 157.9° in nba_api coords.
 * Right junction is at angle 22.1° in nba_api coords.
 * Top is at 90°.
 *
 * Convert to SVG: svgX = cx + r*cos(nbaAngle), svgY = cy - r*sin(nbaAngle)
 */
function threePointArcPoints(segments: number = 60): string[] {
  const cornerAngle = Math.acos(THREE_CORNER_X / THREE_ARC_RADIUS);
  const startAngle = Math.PI - cornerAngle; // left, ~157.8 deg
  const endAngle = cornerAngle; // right, ~22.1 deg
  const pts: string[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle - (i / segments) * (startAngle - endAngle);
    const x = BASKET_X + THREE_ARC_RADIUS * Math.cos(angle);
    const y = BASKET_Y - THREE_ARC_RADIUS * Math.sin(angle);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts;
}

// Arc junction Y in SVG (where corner straight meets arc)
const ARC_JUNCTION_Y = BASKET_Y - THREE_CORNER_START_Y; // ≈ 330.5
const LEFT_CORNER_X = BASKET_X - THREE_CORNER_X; // 30
const RIGHT_CORNER_X = BASKET_X + THREE_CORNER_X; // 470

// ---- Zone Paths ----

/** Restricted Area: semicircle arc below the basket (curves upward in SVG). */
function restrictedAreaPath(): string {
  // Arc from left to right of restricted area, curving upward (toward half-court)
  const pts = arcPoints(BASKET_X, BASKET_Y, RESTRICTED_RADIUS, 180, 0, 30);
  return `M ${pts[0]} ${pts.slice(1).map((p) => `L ${p}`).join(" ")} Z`;
}

/**
 * In The Paint (Non-RA): paint rectangle minus restricted area.
 * Outer boundary: paint rect (PAINT_LEFT, FT_LINE_Y) to (PAINT_RIGHT, BASELINE_Y).
 * Inner cutout: restricted area semicircle.
 * We draw the outer rect CW, then the restricted area arc CCW to create the hole.
 */
function paintNonRAPath(): string {
  // Outer rectangle (clockwise)
  const outer = [
    `M ${PAINT_LEFT},${FT_LINE_Y}`,
    `L ${PAINT_RIGHT},${FT_LINE_Y}`,
    `L ${PAINT_RIGHT},${BASELINE_Y}`,
    `L ${PAINT_LEFT},${BASELINE_Y}`,
    `Z`,
  ];

  // Inner restricted area cutout (counter-clockwise = 0° to 180°)
  const innerPts = arcPoints(
    BASKET_X,
    BASKET_Y,
    RESTRICTED_RADIUS,
    0,
    180,
    30
  );
  const inner = [
    `M ${innerPts[0]}`,
    ...innerPts.slice(1).map((p) => `L ${p}`),
    `Z`,
  ];

  return outer.join(" ") + " " + inner.join(" ");
}

/**
 * Mid-Range: the region between the paint and the 3PT line.
 * Outer boundary: 3PT arc + corner lines.
 * Inner cutout: paint rectangle.
 *
 * We trace:
 * Outer (CW): left corner baseline → up left corner → arc across top → down right corner → baseline → close
 * Inner (CCW): paint rectangle reversed
 */
function midRangePath(): string {
  const arcPts = threePointArcPoints(60);

  // Outer: 3PT line path (CW)
  const outer = [
    `M ${LEFT_CORNER_X},${BASELINE_Y}`,
    `L ${arcPts[0]}`,
    ...arcPts.slice(1).map((p) => `L ${p}`),
    `L ${RIGHT_CORNER_X},${BASELINE_Y}`,
    `Z`,
  ];

  // Inner: paint rectangle (CCW to cut out)
  const inner = [
    `M ${PAINT_LEFT},${FT_LINE_Y}`,
    `L ${PAINT_LEFT},${BASELINE_Y}`,
    `L ${PAINT_RIGHT},${BASELINE_Y}`,
    `L ${PAINT_RIGHT},${FT_LINE_Y}`,
    `Z`,
  ];

  return outer.join(" ") + " " + inner.join(" ");
}

/**
 * Left Corner 3: region left of paint, below 3PT arc junction, to the sideline.
 * Bounded by: sideline (x=0), baseline (bottom), left corner line (x=30),
 * up to the arc junction Y, then across to the sideline.
 */
function leftCorner3Path(): string {
  return [
    `M 0,${ARC_JUNCTION_Y}`,
    `L ${LEFT_CORNER_X},${ARC_JUNCTION_Y}`,
    `L ${LEFT_CORNER_X},${BASELINE_Y}`,
    `L 0,${BASELINE_Y}`,
    `Z`,
  ].join(" ");
}

/** Right Corner 3: mirror of left corner. */
function rightCorner3Path(): string {
  return [
    `M ${RIGHT_CORNER_X},${ARC_JUNCTION_Y}`,
    `L ${COURT_WIDTH},${ARC_JUNCTION_Y}`,
    `L ${COURT_WIDTH},${BASELINE_Y}`,
    `L ${RIGHT_CORNER_X},${BASELINE_Y}`,
    `Z`,
  ].join(" ");
}

/**
 * Above the Break 3: region outside the 3PT arc, above the corner junction line,
 * bounded by the court outline.
 *
 * Trace: court top-left → top-right → down right sideline to arc junction →
 * left along junction to left corner line → along 3PT arc (reversed, right-to-left)
 * → left junction → up left sideline → close.
 *
 * Actually simpler: full court rect minus the inside-the-arc region minus corners.
 * But easiest as: outer court rect (CW) with inner 3PT+corner (CCW).
 *
 * We'll construct it as the court rectangle minus the 3PT enclosed region.
 */
function aboveTheBreak3Path(): string {
  const arcPts = threePointArcPoints(60);

  // Outer: court rectangle above the arc junction line (CW)
  // Goes from half-court down to junction level, full width
  const outer = [
    `M 0,${HALF_COURT_Y}`,
    `L ${COURT_WIDTH},${HALF_COURT_Y}`,
    `L ${COURT_WIDTH},${ARC_JUNCTION_Y}`,
    `L 0,${ARC_JUNCTION_Y}`,
    `Z`,
  ];

  // Inner: the arc from left to right (CCW = reverse order) creates the cutout
  // The arc points go left-to-right, so reversed = right-to-left (CCW)
  const reversedArc = [...arcPts].reverse();
  const inner = [
    `M ${reversedArc[0]}`,
    ...reversedArc.slice(1).map((p) => `L ${p}`),
    `Z`,
  ];

  return outer.join(" ") + " " + inner.join(" ");
}

// ============================================================
// Zone label positions (SVG coordinates for centering text)
// ============================================================

const ZONE_LABEL_POSITIONS: Record<string, { x: number; y: number }> = {
  "Restricted Area": { x: BASKET_X, y: BASKET_Y - 15 },
  "In The Paint (Non-RA)": { x: BASKET_X, y: (FT_LINE_Y + BASKET_Y) / 2 - 10 },
  "Mid-Range": { x: BASKET_X, y: FT_LINE_Y - 45 },
  "Left Corner 3": {
    x: LEFT_CORNER_X / 2,
    y: (ARC_JUNCTION_Y + BASELINE_Y) / 2,
  },
  "Right Corner 3": {
    x: (RIGHT_CORNER_X + COURT_WIDTH) / 2,
    y: (ARC_JUNCTION_Y + BASELINE_Y) / 2,
  },
  "Above the Break 3": { x: BASKET_X, y: (HALF_COURT_Y + ARC_JUNCTION_Y) / 2 - 30 },
};

// ============================================================
// Zone definitions: name → path generator
// ============================================================

const ZONE_DEFS: { name: string; path: () => string }[] = [
  { name: "Restricted Area", path: restrictedAreaPath },
  { name: "In The Paint (Non-RA)", path: paintNonRAPath },
  { name: "Mid-Range", path: midRangePath },
  { name: "Left Corner 3", path: leftCorner3Path },
  { name: "Right Corner 3", path: rightCorner3Path },
  { name: "Above the Break 3", path: aboveTheBreak3Path },
];

// ============================================================
// Component
// ============================================================

export default function ShotZoneOverlay({
  zoneSummary,
}: ShotZoneOverlayProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);

  // Color interpolators
  const coldToNeutral = useMemo(
    () => interpolateRgb(COLOR_COLD, COLOR_NEUTRAL),
    []
  );
  const neutralToHot = useMemo(
    () => interpolateRgb(COLOR_NEUTRAL, COLOR_HOT),
    []
  );

  const getZoneColor = useCallback(
    (fgPct: number, leagueAvg: number): string => {
      const diff = fgPct - leagueAvg;
      if (diff <= 0) {
        const t = Math.min(Math.abs(diff) / MAX_DIFF, 1);
        return coldToNeutral(1 - t);
      } else {
        const t = Math.min(diff / MAX_DIFF, 1);
        return neutralToHot(t);
      }
    },
    [coldToNeutral, neutralToHot]
  );

  // Build zone data: merge zone paths with stats from zoneSummary
  const zones = useMemo(() => {
    return ZONE_DEFS.map((def) => {
      const stats = zoneSummary.find((z) => z.zone === def.name);
      const fgm = stats?.fgm ?? 0;
      const fga = stats?.fga ?? 0;
      const fgPct = stats?.fgPct ?? 0;
      const leagueAvg = stats?.leagueAvg ?? 0.4;
      const color = fga > 0 ? getZoneColor(fgPct, leagueAvg) : "transparent";
      const labelPos = ZONE_LABEL_POSITIONS[def.name] ?? {
        x: BASKET_X,
        y: COURT_HEIGHT / 2,
      };

      return {
        name: def.name,
        pathD: def.path(),
        fgm,
        fga,
        fgPct,
        leagueAvg,
        color,
        labelPos,
      };
    });
  }, [zoneSummary, getZoneColor]);

  const handleMouseEnter = useCallback(
    (zone: (typeof zones)[number], event: React.MouseEvent) => {
      setHoveredZone(zone.name);
      if (zone.fga === 0) return;
      const svg = (event.target as SVGElement).closest("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / COURT_WIDTH;
      const scaleY = rect.height / COURT_HEIGHT;
      setTooltip({
        x: rect.left + zone.labelPos.x * scaleX,
        y: rect.top + zone.labelPos.y * scaleY - 40,
        zone: zone.name,
        fgm: zone.fgm,
        fga: zone.fga,
        fgPct: zone.fgPct,
        leagueAvg: zone.leagueAvg,
      });
    },
    [zones]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredZone(null);
    setTooltip(null);
  }, []);

  const handleTouchStart = useCallback(
    (zone: (typeof zones)[number], event: React.TouchEvent) => {
      event.preventDefault();
      setHoveredZone(zone.name);
      if (zone.fga === 0) return;
      const svg = (event.target as SVGElement).closest("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / COURT_WIDTH;
      const scaleY = rect.height / COURT_HEIGHT;
      setTooltip({
        x: rect.left + zone.labelPos.x * scaleX,
        y: rect.top + zone.labelPos.y * scaleY - 40,
        zone: zone.name,
        fgm: zone.fgm,
        fga: zone.fga,
        fgPct: zone.fgPct,
        leagueAvg: zone.leagueAvg,
      });
    },
    [zones]
  );

  // Dismiss tooltip on outside touch
  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => {
      setTooltip(null);
      setHoveredZone(null);
    };
    const timer = setTimeout(() => {
      document.addEventListener("touchstart", dismiss, { once: true });
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("touchstart", dismiss);
    };
  }, [tooltip]);

  if (zoneSummary.length === 0) {
    return (
      <text
        x={COURT_WIDTH / 2}
        y={COURT_HEIGHT / 2}
        textAnchor="middle"
        fill="#94A3B8"
        fontSize={14}
      >
        No zone data available
      </text>
    );
  }

  return (
    <>
      <g>
        {zones.map((zone) => (
          <g key={zone.name}>
            {/* Zone fill shape */}
            <path
              d={zone.pathD}
              fill={zone.color}
              fillOpacity={
                zone.fga === 0
                  ? 0
                  : hoveredZone === zone.name
                    ? 0.7
                    : 0.5
              }
              fillRule="evenodd"
              stroke="none"
              onMouseEnter={(e) => handleMouseEnter(zone, e)}
              onMouseLeave={handleMouseLeave}
              onTouchStart={(e) => handleTouchStart(zone, e)}
              style={{ cursor: zone.fga > 0 ? "pointer" : "default" }}
            />

            {/* Zone labels (only if there are attempts) */}
            {zone.fga > 0 && (
              <>
                <text
                  x={zone.labelPos.x}
                  y={zone.labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#F8FAFC"
                  fontSize={zone.name === "Restricted Area" ? 11 : 13}
                  fontWeight={700}
                  style={{ pointerEvents: "none" }}
                >
                  {(zone.fgPct * 100).toFixed(1)}%
                </text>
                <text
                  x={zone.labelPos.x}
                  y={zone.labelPos.y + (zone.name === "Restricted Area" ? 13 : 16)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#94A3B8"
                  fontSize={zone.name === "Restricted Area" ? 9 : 10}
                  style={{ pointerEvents: "none" }}
                >
                  {zone.fgm}/{zone.fga}
                </text>
              </>
            )}
          </g>
        ))}
      </g>

      {/* Tooltip */}
      {tooltip && (
        <foreignObject x={0} y={0} width={COURT_WIDTH} height={COURT_HEIGHT}>
          <div
            style={{
              position: "fixed",
              left: Math.max(8, Math.min(tooltip.x, typeof window !== "undefined" ? window.innerWidth - 8 : tooltip.x)),
              top: Math.max(8, tooltip.y),
              transform: `translate(${
                tooltip.x < 100 ? "0%" : (typeof window !== "undefined" && tooltip.x > window.innerWidth - 100) ? "-100%" : "-50%"
              }, -100%)`,
              pointerEvents: "none",
              zIndex: 50,
              background: "#0F172A",
              border: "1px solid #334155",
              borderRadius: 8,
              padding: "8px 12px",
              color: "#F8FAFC",
              fontSize: 12,
              lineHeight: 1.5,
              maxWidth: "calc(100vw - 16px)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ fontWeight: 600 }}>{tooltip.zone}</div>
            <div>
              FG%: {(tooltip.fgPct * 100).toFixed(1)}% ({tooltip.fgm}/
              {tooltip.fga})
            </div>
            <div
              style={{
                color:
                  tooltip.fgPct >= tooltip.leagueAvg ? "#4ADE80" : "#F87171",
              }}
            >
              vs League Avg:{" "}
              {tooltip.fgPct >= tooltip.leagueAvg ? "+" : ""}
              {((tooltip.fgPct - tooltip.leagueAvg) * 100).toFixed(1)}%
            </div>
          </div>
        </foreignObject>
      )}
    </>
  );
}
