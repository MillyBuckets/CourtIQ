"use client";

import React, { useEffect, useRef, useState } from "react";
import type {
  PlayerProfileResponse,
  RollingAverage,
  WindowSelection,
} from "@/types";

// ============================================================
// Types
// ============================================================

type BasicStats = PlayerProfileResponse["currentSeason"]["basic"];

interface StatSummaryBarProps {
  basicStats: BasicStats;
  rollingStats: {
    last5: RollingAverage;
    last10: RollingAverage;
    season: RollingAverage;
  };
  activeWindow: WindowSelection;
}

// ============================================================
// Stat definitions
// ============================================================

interface StatDef {
  label: string;
  /** Key into BasicStats for the season value */
  basicKey: keyof BasicStats;
  /** Key into RollingAverage for rolling comparison */
  rollingKey: keyof RollingAverage;
  /** If true, display as percentage (multiply by 100, add %) */
  isPct: boolean;
  decimals: number;
}

const STATS: StatDef[] = [
  { label: "PPG", basicKey: "ptsPg", rollingKey: "ptsPg", isPct: false, decimals: 1 },
  { label: "RPG", basicKey: "rebPg", rollingKey: "rebPg", isPct: false, decimals: 1 },
  { label: "APG", basicKey: "astPg", rollingKey: "astPg", isPct: false, decimals: 1 },
  { label: "FG%", basicKey: "fgPct", rollingKey: "fgPct", isPct: true, decimals: 1 },
  { label: "3P%", basicKey: "fg3Pct", rollingKey: "fg3Pct", isPct: true, decimals: 1 },
  { label: "FT%", basicKey: "ftPct", rollingKey: "ftPct", isPct: true, decimals: 1 },
];

// ============================================================
// Helpers
// ============================================================

function formatValue(value: number | null, isPct: boolean, decimals: number): string {
  if (value == null) return "—";
  if (isPct) return (value * 100).toFixed(decimals);
  return value.toFixed(decimals);
}

type Trend = "up" | "down" | "neutral";

function getTrend(
  rollingValue: number,
  seasonValue: number,
  isPct: boolean
): Trend {
  // Threshold: 2% relative for counting stats, 2 percentage points for pct stats
  const diff = rollingValue - seasonValue;
  const threshold = isPct ? 0.02 : seasonValue * 0.02;
  if (diff > threshold) return "up";
  if (diff < -threshold) return "down";
  return "neutral";
}

// ============================================================
// Trend Indicator
// ============================================================

function TrendIndicator({ trend }: { trend: Trend }) {
  if (trend === "up") {
    return (
      <svg width={10} height={10} viewBox="0 0 10 10" className="inline-block ml-1">
        <path d="M5 1 L9 7 L1 7 Z" fill="#22C55E" />
      </svg>
    );
  }
  if (trend === "down") {
    return (
      <svg width={10} height={10} viewBox="0 0 10 10" className="inline-block ml-1">
        <path d="M5 9 L9 3 L1 3 Z" fill="#EF4444" />
      </svg>
    );
  }
  return (
    <span className="ml-1 inline-block text-[10px] leading-none text-trend-neutral">
      —
    </span>
  );
}

// ============================================================
// Flash wrapper — briefly highlights text in accent color on change
// ============================================================

function FlashValue({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const [flash, setFlash] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 300);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span
      style={{
        color: flash ? "#E94560" : undefined,
        transition: "color 300ms ease",
      }}
    >
      {children}
    </span>
  );
}

// ============================================================
// Component
// ============================================================

export default function StatSummaryBar({
  basicStats,
  rollingStats,
  activeWindow,
}: StatSummaryBarProps) {
  const showTrend = activeWindow === "last5" || activeWindow === "last10";
  const activeRolling = rollingStats[activeWindow];

  return (
    <div className="rounded-xl bg-card px-4 py-3">
      <div className="grid grid-cols-3 gap-y-4 sm:grid-cols-6 sm:gap-y-0">
        {STATS.map((stat) => {
          const seasonVal = basicStats[stat.basicKey];
          const displayVal = showTrend
            ? activeRolling[stat.rollingKey]
            : seasonVal;
          const trend =
            showTrend && seasonVal != null
              ? getTrend(
                  activeRolling[stat.rollingKey],
                  seasonVal,
                  stat.isPct
                )
              : null;

          const formatted = formatValue(displayVal, stat.isPct, stat.decimals);

          return (
            <div key={stat.label} className="flex flex-col items-center">
              <span className="text-xs text-text-secondary">
                {stat.label}
              </span>
              <FlashValue value={formatted}>
                <span className="font-mono text-lg font-bold text-text-stat">
                  {formatted}
                  {stat.isPct && displayVal != null && (
                    <span className="text-sm font-normal text-text-secondary">%</span>
                  )}
                  {trend && <TrendIndicator trend={trend} />}
                </span>
              </FlashValue>
            </div>
          );
        })}
      </div>
    </div>
  );
}
