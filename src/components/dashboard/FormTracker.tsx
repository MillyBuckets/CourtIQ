"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import type { GameLogResponse, WindowSelection } from "@/types";

// ============================================================
// Types
// ============================================================

type GameLog = GameLogResponse["games"][number];

interface FormTrackerProps {
  games: GameLog[];
  activeStat?: string;
  activeWindow: WindowSelection;
}

// ============================================================
// Stat selector options
// ============================================================

interface StatOption {
  value: string;
  label: string;
  gameKey: keyof GameLog;
  isPct: boolean;
}

const STAT_OPTIONS: StatOption[] = [
  { value: "pts", label: "PTS", gameKey: "pts", isPct: false },
  { value: "reb", label: "REB", gameKey: "reb", isPct: false },
  { value: "ast", label: "AST", gameKey: "ast", isPct: false },
  { value: "fgPct", label: "FG%", gameKey: "fgPct", isPct: true },
  { value: "fg3Pct", label: "3P%", gameKey: "fg3Pct", isPct: true },
  { value: "ftPct", label: "FT%", gameKey: "ftPct", isPct: true },
  { value: "plusMinus", label: "+/-", gameKey: "plusMinus", isPct: false },
];

// ============================================================
// Colors
// ============================================================

const ACCENT = "#E94560";
const WIN_COLOR = "#22C55E";
const LOSS_COLOR = "#EF4444";
const GRID_COLOR = "#334155";
const LABEL_COLOR = "#94A3B8";
const AVG_LINE_COLOR = "#F8FAFC";
const WINDOW_HIGHLIGHT = "rgba(233, 69, 96, 0.08)";

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatStatValue(val: number | null, isPct: boolean): string {
  if (val == null) return "—";
  if (isPct) return (val * 100).toFixed(1) + "%";
  return String(val);
}

// ============================================================
// Chart data builder
// ============================================================

interface ChartDatum {
  date: string;
  dateLabel: string;
  value: number | null;
  wl: string | null;
  matchup: string | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  fgPct: number | null;
  index: number;
}

function buildChartData(
  games: GameLog[],
  statOpt: StatOption
): ChartDatum[] {
  // Games come newest-first from the API; reverse for chronological
  const sorted = [...games].sort(
    (a, b) => a.gameDate.localeCompare(b.gameDate)
  );

  return sorted.map((g, i) => ({
    date: g.gameDate,
    dateLabel: formatDate(g.gameDate),
    value: g[statOpt.gameKey] as number | null,
    wl: g.wl,
    matchup: g.matchup,
    pts: g.pts,
    reb: g.reb,
    ast: g.ast,
    fgPct: g.fgPct,
    index: i,
  }));
}

function computeAverage(data: ChartDatum[]): number | null {
  const vals = data.map((d) => d.value).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ============================================================
// Custom Dot
// ============================================================

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: ChartDatum;
}

function CustomDot({ cx, cy, payload }: CustomDotProps) {
  if (cx == null || cy == null || !payload) return null;
  const color = payload.wl === "W" ? WIN_COLOR : payload.wl === "L" ? LOSS_COLOR : LABEL_COLOR;
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#0F172A" strokeWidth={1} />;
}

// ============================================================
// Custom Tooltip
// ============================================================

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
  isPct: boolean;
}

function CustomFormTooltip({ active, payload, isPct }: CustomTooltipProps) {
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
        maxWidth: 220,
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {formatDate(d.date)} — {d.matchup ?? "—"}
      </div>
      {d.wl && (
        <div style={{ color: d.wl === "W" ? WIN_COLOR : LOSS_COLOR }}>
          {d.wl === "W" ? "Win" : "Loss"}
        </div>
      )}
      <div style={{ color: LABEL_COLOR, marginTop: 4 }}>
        {d.pts ?? 0} PTS / {d.reb ?? 0} REB / {d.ast ?? 0} AST
        {d.fgPct != null && ` / ${(d.fgPct * 100).toFixed(1)}% FG`}
      </div>
    </div>
  );
}

// ============================================================
// Component
// ============================================================

export default function FormTracker({
  games,
  activeStat = "pts",
  activeWindow,
}: FormTrackerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [selectedStat, setSelectedStat] = useState(activeStat);

  const statOpt = useMemo(
    () => STAT_OPTIONS.find((s) => s.value === selectedStat) ?? STAT_OPTIONS[0],
    [selectedStat]
  );

  const chartData = useMemo(
    () => buildChartData(games, statOpt),
    [games, statOpt]
  );

  const seasonAvg = useMemo(() => computeAverage(chartData), [chartData]);

  // Window highlight range
  const windowSize =
    activeWindow === "last5" ? 5 : activeWindow === "last10" ? 10 : 0;
  const highlightStart =
    windowSize > 0 && chartData.length > 0
      ? Math.max(0, chartData.length - windowSize)
      : null;

  // Y-axis domain
  const yValues = chartData
    .map((d) => d.value)
    .filter((v): v is number => v != null);
  const yMin = yValues.length > 0 ? Math.min(...yValues) : 0;
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 10;
  const yPad = Math.max((yMax - yMin) * 0.15, 1);

  return (
    <div className="rounded-xl bg-card p-4">
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          Form Tracker
        </h3>
        <select
          value={selectedStat}
          onChange={(e) => setSelectedStat(e.target.value)}
          className="min-h-[44px] rounded-md border border-[#334155] bg-court-secondary px-2 py-1 text-xs text-text-primary outline-none transition-colors focus:border-court-accent sm:min-h-0"
        >
          {STAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Chart */}
      <div className="h-[220px] w-full">
        {mounted && <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 12, bottom: 4, left: -8 }}
          >
            <CartesianGrid
              stroke={GRID_COLOR}
              strokeOpacity={0.3}
              strokeDasharray="3 3"
              vertical={false}
            />

            {/* Window highlight */}
            {highlightStart != null && chartData.length > 0 && (
              <ReferenceArea
                x1={chartData[highlightStart].dateLabel}
                x2={chartData[chartData.length - 1].dateLabel}
                fill={WINDOW_HIGHLIGHT}
                fillOpacity={1}
                ifOverflow="extendDomain"
              />
            )}

            {/* Season average line */}
            {seasonAvg != null && (
              <ReferenceLine
                y={seasonAvg}
                stroke={AVG_LINE_COLOR}
                strokeDasharray="6 4"
                strokeOpacity={0.3}
                strokeWidth={1}
              />
            )}

            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 10, fill: LABEL_COLOR }}
              tickLine={false}
              axisLine={{ stroke: GRID_COLOR, strokeOpacity: 0.3 }}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis
              domain={[
                Math.floor(yMin - yPad),
                Math.ceil(yMax + yPad),
              ]}
              tick={{ fontSize: 10, fill: LABEL_COLOR }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v: number) =>
                statOpt.isPct ? `${(v * 100).toFixed(0)}%` : String(v)
              }
            />
            <Tooltip
              content={<CustomFormTooltip isPct={statOpt.isPct} />}
              cursor={{ stroke: GRID_COLOR, strokeDasharray: "3 3" }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={ACCENT}
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={{ r: 7, fill: ACCENT, stroke: "#0F172A", strokeWidth: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>}
      </div>
    </div>
  );
}
