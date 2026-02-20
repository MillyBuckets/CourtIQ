"use client";

import React from "react";

// ============================================================
// Court Dimensions (in nba_api units: 1 unit = 0.1 feet)
// Origin (0, 0) = basket center in nba_api coordinates
//
// Orientation: baseline at BOTTOM of SVG, half-court at TOP.
// Basket is near the bottom, court extends upward.
// ============================================================

/** Transform nba_api shot coordinates to SVG coordinates. */
export function toSvgX(locX: number): number {
  return locX + 250;
}

export function toSvgY(locY: number): number {
  return 420 - locY;
}

/** Court SVG viewBox dimensions. */
export const COURT_WIDTH = 500;
export const COURT_HEIGHT = 470;

// Basket position in SVG coords
const BASKET_X = 250;
const BASKET_Y = 420; // toSvgY(0)

// Baseline at bottom of court (below basket)
const BASELINE_Y = BASKET_Y + 52.5; // 472.5

// Backboard: between basket and baseline
const BACKBOARD_Y = BASKET_Y + 15;
const BACKBOARD_HALF_WIDTH = 30;

// Hoop
const HOOP_RADIUS = 7.5;

// Restricted area arc: 4ft radius = 40 units
const RESTRICTED_RADIUS = 40;

// Paint: 16ft wide = 160 units, centered
const PAINT_HALF_WIDTH = 80;
const PAINT_LEFT = BASKET_X - PAINT_HALF_WIDTH; // 170
const PAINT_RIGHT = BASKET_X + PAINT_HALF_WIDTH; // 330

// Free throw line: ~142 units above basket in nba_api coords
const FT_DISTANCE = 142;
const FT_LINE_Y = BASKET_Y - FT_DISTANCE; // 278

// Free throw circle: 6ft radius = 60 units
const FT_CIRCLE_RADIUS = 60;

// Three-point line
const THREE_ARC_RADIUS = 237.5;
const THREE_CORNER_X = 220;
const THREE_CORNER_START_Y = Math.sqrt(
  THREE_ARC_RADIUS ** 2 - THREE_CORNER_X ** 2
); // ≈ 89.5

// Half-court line at top
const HALF_COURT_Y = BASELINE_Y - 470; // 2.5

// Center court circle
const CENTER_CIRCLE_RADIUS = 60;

/** Exported geometry for child overlays (ShotZoneOverlay, etc.) */
export const courtGeometry = {
  BASKET_X,
  BASKET_Y,
  BASELINE_Y,
  PAINT_LEFT,
  PAINT_RIGHT,
  PAINT_HALF_WIDTH,
  FT_LINE_Y,
  FT_CIRCLE_RADIUS,
  RESTRICTED_RADIUS,
  THREE_ARC_RADIUS,
  THREE_CORNER_X,
  THREE_CORNER_START_Y,
  HALF_COURT_Y,
} as const;

// ============================================================
// Styling
// ============================================================

const LINE_COLOR = "#334155";
const LINE_WIDTH = 1.5;
const PAINT_FILL = "rgba(30, 41, 59, 0.2)";

// ============================================================
// SVG Path Helpers
// ============================================================

function arcPath(
  rx: number,
  ry: number,
  endX: number,
  endY: number,
  largeArc: 0 | 1 = 0,
  sweep: 0 | 1 = 1
): string {
  return `A ${rx} ${ry} 0 ${largeArc} ${sweep} ${endX} ${endY}`;
}

// ============================================================
// Three-Point Line Path
// ============================================================

function threePointPath(): string {
  const leftCornerX = BASKET_X - THREE_CORNER_X; // 30
  const rightCornerX = BASKET_X + THREE_CORNER_X; // 470

  // Compute the arc as explicit points from the circle centered at basket.
  // Angle where corner meets arc: acos(220 / 237.5)
  const cornerAngle = Math.acos(THREE_CORNER_X / THREE_ARC_RADIUS);
  // Arc goes from (PI - cornerAngle) on the left to (cornerAngle) on the right,
  // sweeping through PI/2 (top of arc, directly above basket).
  // Angles measured from positive X axis; PI/2 points upward in nba_api coords
  // (which is negative Y in SVG since Y is flipped).
  const startAngle = Math.PI - cornerAngle; // left side, ~157.8 deg
  const endAngle = cornerAngle; // right side, ~22.1 deg
  const segments = 60;
  const arcPoints: string[] = [];

  for (let i = 0; i <= segments; i++) {
    // Sweep from startAngle down to endAngle (left to right across the top)
    const angle = startAngle - (i / segments) * (startAngle - endAngle);
    const x = BASKET_X + THREE_ARC_RADIUS * Math.cos(angle);
    const y = BASKET_Y - THREE_ARC_RADIUS * Math.sin(angle);
    arcPoints.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return [
    // Left corner: baseline up to arc start
    `M ${leftCornerX} ${BASELINE_Y}`,
    `L ${arcPoints[0]}`,
    // Arc across the top
    ...arcPoints.slice(1).map((p) => `L ${p}`),
    // Right corner: arc end down to baseline
    `L ${rightCornerX} ${BASELINE_Y}`,
  ].join(" ");
}

// ============================================================
// Component
// ============================================================

interface BasketballCourtProps {
  width?: string | number;
  children?: React.ReactNode;
  className?: string;
}

export default function BasketballCourt({
  width = "100%",
  children,
  className,
}: BasketballCourtProps) {
  return (
    <svg
      viewBox={`0 0 ${COURT_WIDTH} ${COURT_HEIGHT}`}
      width={width}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ display: "block" }}
    >
      {/* ---- Court Outline ---- */}
      <rect
        x={0}
        y={HALF_COURT_Y}
        width={COURT_WIDTH}
        height={BASELINE_Y - HALF_COURT_Y}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      {/* ---- Paint / Key ---- */}
      <rect
        x={PAINT_LEFT}
        y={FT_LINE_Y}
        width={PAINT_HALF_WIDTH * 2}
        height={BASELINE_Y - FT_LINE_Y}
        fill={PAINT_FILL}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      {/* ---- Free Throw Circle (top half — solid, curves away from basket) ---- */}
      <path
        d={[
          `M ${PAINT_LEFT} ${FT_LINE_Y}`,
          arcPath(FT_CIRCLE_RADIUS, FT_CIRCLE_RADIUS, PAINT_RIGHT, FT_LINE_Y, 0, 0),
        ].join(" ")}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      {/* ---- Free Throw Circle (bottom half — dashed, curves toward basket) ---- */}
      <path
        d={[
          `M ${PAINT_LEFT} ${FT_LINE_Y}`,
          arcPath(FT_CIRCLE_RADIUS, FT_CIRCLE_RADIUS, PAINT_RIGHT, FT_LINE_Y, 0, 1),
        ].join(" ")}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
        strokeDasharray="10 10"
      />

      {/* ---- Restricted Area Arc (curves upward, in front of basket) ---- */}
      <path
        d={[
          `M ${BASKET_X - RESTRICTED_RADIUS} ${BASKET_Y}`,
          arcPath(
            RESTRICTED_RADIUS,
            RESTRICTED_RADIUS,
            BASKET_X + RESTRICTED_RADIUS,
            BASKET_Y,
            0,
            0
          ),
        ].join(" ")}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      {/* ---- Three-Point Line ---- */}
      <path
        d={threePointPath()}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      {/* ---- Backboard ---- */}
      <line
        x1={BASKET_X - BACKBOARD_HALF_WIDTH}
        y1={BACKBOARD_Y}
        x2={BASKET_X + BACKBOARD_HALF_WIDTH}
        y2={BACKBOARD_Y}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH + 0.5}
      />

      {/* ---- Basket (Hoop) ---- */}
      <circle
        cx={BASKET_X}
        cy={BASKET_Y}
        r={HOOP_RADIUS}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      {/* ---- Half-Court Line ---- */}
      <line
        x1={0}
        y1={HALF_COURT_Y}
        x2={COURT_WIDTH}
        y2={HALF_COURT_Y}
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      {/* ---- Center Court Arc (curves downward into court) ---- */}
      <path
        d={[
          `M ${BASKET_X - CENTER_CIRCLE_RADIUS} ${HALF_COURT_Y}`,
          arcPath(
            CENTER_CIRCLE_RADIUS,
            CENTER_CIRCLE_RADIUS,
            BASKET_X + CENTER_CIRCLE_RADIUS,
            HALF_COURT_Y,
            0,
            1
          ),
        ].join(" ")}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={LINE_WIDTH}
      />

      {/* ---- Child overlay (heat map, shot dots, etc.) ---- */}
      {children}
    </svg>
  );
}
