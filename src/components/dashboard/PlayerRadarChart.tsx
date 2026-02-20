"use client";

import React, { useState, useEffect } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { RadarResponse, RadarDimension } from "@/types";

// ============================================================
// Types
// ============================================================

interface PlayerRadarChartProps {
  radarData: RadarResponse;
}

/** Flattened for Recharts data array */
interface ChartDatum {
  axis: string;
  score: number;
  raw: number;
  label: string;
  leagueAvg: number;
}

// ============================================================
// Constants
// ============================================================

const DIMENSION_ORDER: (keyof RadarResponse["dimensions"])[] = [
  "scoring",
  "playmaking",
  "rebounding",
  "defense",
  "efficiency",
  "volume",
];

const AXIS_LABELS: Record<string, string> = {
  scoring: "Scoring",
  playmaking: "Playmaking",
  rebounding: "Rebounding",
  defense: "Defense",
  efficiency: "Efficiency",
  volume: "Volume",
};

const ACCENT = "#E94560";
const GRID_COLOR = "#334155";
const LABEL_COLOR = "#94A3B8";

// ============================================================
// Custom Tooltip
// ============================================================

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
}

function CustomRadarTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;

  return (
    <div
      style={{
        background: "#0F172A",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: "8px 12px",
        color: "#F8FAFC",
        fontSize: 12,
        lineHeight: 1.6,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {d.axis}: {d.score}th percentile
      </div>
      <div style={{ color: LABEL_COLOR }}>
        {d.label} (League Avg: {d.leagueAvg})
      </div>
    </div>
  );
}

// ============================================================
// Custom Axis Tick
// ============================================================

interface TickProps {
  payload: { value: string };
  x: number;
  y: number;
  cx: number;
  cy: number;
}

function renderAxisTick({ payload, x, y, cx, cy }: TickProps) {
  // Push label further from center
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const nudge = 14;
  const nx = dist > 0 ? x + (dx / dist) * nudge : x;
  const ny = dist > 0 ? y + (dy / dist) * nudge : y;

  return (
    <text
      x={nx}
      y={ny}
      textAnchor="middle"
      dominantBaseline="central"
      fill={LABEL_COLOR}
      fontSize={11}
      fontWeight={500}
    >
      {payload.value}
    </text>
  );
}

// ============================================================
// Custom Dot
// ============================================================

interface DotProps {
  cx: number;
  cy: number;
}

function renderDot({ cx, cy }: DotProps) {
  return (
    <circle cx={cx} cy={cy} r={3.5} fill={ACCENT} stroke="#0F172A" strokeWidth={1} />
  );
}

// ============================================================
// Component
// ============================================================

export default function PlayerRadarChart({
  radarData,
}: PlayerRadarChartProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const data: ChartDatum[] = DIMENSION_ORDER.map((key) => {
    const dim: RadarDimension = radarData.dimensions[key];
    return {
      axis: AXIS_LABELS[key],
      score: dim.score,
      raw: dim.raw,
      label: dim.label,
      leagueAvg: dim.leagueAvg,
    };
  });

  return (
    <div className="rounded-xl bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">
        Player DNA
      </h3>
      <div className="radar-animate mx-auto aspect-square max-w-[320px]">
        {mounted && <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            data={data}
            cx="50%"
            cy="50%"
            outerRadius="70%"
          >
            <PolarGrid stroke={GRID_COLOR} strokeOpacity={0.6} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <PolarAngleAxis
              dataKey="axis"
              tick={renderAxisTick as any}
              stroke="none"
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Radar
              dataKey="score"
              fill={ACCENT}
              fillOpacity={0.3}
              stroke={ACCENT}
              strokeWidth={2}
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              dot={renderDot as any}
            />
            <Tooltip
              content={<CustomRadarTooltip />}
              cursor={false}
            />
          </RadarChart>
        </ResponsiveContainer>}
      </div>
    </div>
  );
}
