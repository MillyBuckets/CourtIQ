"use client";

import React, { useState, useRef, useEffect } from "react";
import type { PlayerProfileResponse } from "@/types";

// ============================================================
// Types
// ============================================================

type AdvancedStats = PlayerProfileResponse["currentSeason"]["advanced"];
type Percentiles = PlayerProfileResponse["currentSeason"]["percentiles"];

interface AdvancedStatsTableProps {
  advancedStats: AdvancedStats;
  percentiles: Percentiles;
}

// ============================================================
// Stat definitions with plain-English explanations (PRD §6 Tier 2)
// ============================================================

interface StatDef {
  key: keyof AdvancedStats;
  label: string;
  explanation: string;
  isPct: boolean;
  decimals: number;
  /** Key into Percentiles, if this stat has percentile data */
  pctileKey?: keyof Percentiles;
}

interface StatGroup {
  title: string;
  stats: StatDef[];
}

const STAT_GROUPS: StatGroup[] = [
  {
    title: "Scoring Efficiency",
    stats: [
      {
        key: "tsPct",
        label: "TS%",
        explanation:
          "The most accurate measure of shooting efficiency — accounts for 2-pointers, 3-pointers, AND free throws. League average is ~57%.",
        isPct: true,
        decimals: 1,
        pctileKey: "ts",
      },
      {
        key: "efgPct",
        label: "eFG%",
        explanation:
          "Adjusts field goal percentage to account for the extra value of 3-pointers. A player who shoots 40% on threes is more valuable than one who shoots 40% on twos.",
        isPct: true,
        decimals: 1,
      },
      {
        key: "ortg",
        label: "ORtg",
        explanation:
          "Offensive Rating — estimates points produced per 100 possessions. League average is ~112. Higher is better.",
        isPct: false,
        decimals: 1,
      },
    ],
  },
  {
    title: "Usage & Playmaking",
    stats: [
      {
        key: "usgPct",
        label: "USG%",
        explanation:
          "Usage Rate — what percentage of team plays a player uses while on the court. 20% is average. Above 30% means the offense runs through this player.",
        isPct: true,
        decimals: 1,
        pctileKey: "usg",
      },
      {
        key: "astPct",
        label: "AST%",
        explanation:
          "Assist Percentage — the percentage of teammate field goals a player assisted while on court. Elite playmakers are 35%+.",
        isPct: true,
        decimals: 1,
      },
      {
        key: "tovPct",
        label: "TOV%",
        explanation:
          "Turnover Percentage — turnovers per 100 plays. Lower is better. League average is around 13%.",
        isPct: true,
        decimals: 1,
      },
    ],
  },
  {
    title: "Rebounding",
    stats: [
      {
        key: "trbPct",
        label: "TRB%",
        explanation:
          "Total Rebound Percentage — the percentage of available rebounds grabbed while on court. 10% is average, 20%+ is elite.",
        isPct: true,
        decimals: 1,
      },
    ],
  },
  {
    title: "Defense",
    stats: [
      {
        key: "drtg",
        label: "DRtg",
        explanation:
          "Defensive Rating — estimates points allowed per 100 possessions. Lower is better. League average is ~112.",
        isPct: false,
        decimals: 1,
      },
      {
        key: "dbpm",
        label: "DBPM",
        explanation:
          "Defensive Box Plus/Minus — estimates defensive contribution relative to league average per 100 possessions. 0 is average, +2 is great.",
        isPct: false,
        decimals: 1,
      },
    ],
  },
  {
    title: "Impact",
    stats: [
      {
        key: "per",
        label: "PER",
        explanation:
          "A single number that tries to capture a player's total contribution. League average is 15. Above 20 is great. Above 25 is MVP-level.",
        isPct: false,
        decimals: 1,
        pctileKey: "per",
      },
      {
        key: "bpm",
        label: "BPM",
        explanation:
          "Box Plus/Minus — estimates total contribution relative to league average per 100 possessions. 0 is average, +5 is All-Star, +10 is MVP.",
        isPct: false,
        decimals: 1,
        pctileKey: "bpm",
      },
      {
        key: "obpm",
        label: "OBPM",
        explanation:
          "Offensive Box Plus/Minus — offensive contribution above league average per 100 possessions. 0 is average.",
        isPct: false,
        decimals: 1,
      },
      {
        key: "ws",
        label: "WS",
        explanation:
          "Win Shares — an estimate of the number of wins a player produces for their team. 5+ is All-Star caliber for a full season.",
        isPct: false,
        decimals: 1,
        pctileKey: "ws",
      },
      {
        key: "ws48",
        label: "WS/48",
        explanation:
          "Win Shares per 48 minutes — win shares adjusted for playing time. League average is ~0.100. Above 0.200 is elite.",
        isPct: false,
        decimals: 3,
      },
      {
        key: "vorp",
        label: "VORP",
        explanation:
          "Value Over Replacement Player — estimates total value above a replacement-level player over the season. 1.0 is solid, 5.0+ is All-NBA.",
        isPct: false,
        decimals: 1,
      },
      {
        key: "netRtg",
        label: "Net Rtg",
        explanation:
          "Net Rating — the difference between Offensive Rating and Defensive Rating (ORtg - DRtg). Positive means the team outscores opponents with this player on court.",
        isPct: false,
        decimals: 1,
      },
    ],
  },
  {
    title: "Shot Profile",
    stats: [
      {
        key: "threePar",
        label: "3PAr",
        explanation:
          "Three-Point Attempt Rate — the percentage of field goal attempts that are 3-pointers. Shows how much a player relies on the three-point shot.",
        isPct: true,
        decimals: 1,
      },
      {
        key: "ftr",
        label: "FTr",
        explanation:
          "Free Throw Rate — free throw attempts per field goal attempt. Higher means the player draws more fouls and gets to the line often.",
        isPct: true,
        decimals: 1,
      },
      {
        key: "pace",
        label: "Pace",
        explanation:
          "Pace Factor — an estimate of possessions per 48 minutes. Higher pace means a faster-playing team. League average is ~100.",
        isPct: false,
        decimals: 1,
      },
    ],
  },
];

// ============================================================
// Helpers
// ============================================================

function formatValue(
  val: number | null,
  isPct: boolean,
  decimals: number
): string {
  if (val == null) return "—";
  if (isPct) return (val * 100).toFixed(decimals) + "%";
  return val.toFixed(decimals);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============================================================
// Info Tooltip (hover/click)
// ============================================================

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="relative -m-2 ml-0 inline-flex h-8 w-8 items-center justify-center sm:-m-0 sm:ml-1 sm:h-3.5 sm:w-3.5"
        aria-label="Stat explanation"
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-text-secondary/40 text-[9px] leading-none text-text-secondary transition-colors hover:border-text-secondary hover:text-text-primary">
          ?
        </span>
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-48 max-w-[calc(100vw-2rem)] rounded-lg border border-[#334155] bg-[#0F172A] px-3 py-2 text-xs leading-relaxed text-text-primary shadow-lg sm:left-1/2 sm:w-56 sm:-translate-x-1/2">
          {text}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#0F172A]" />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Percentile Bar
// ============================================================

function PercentileBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-[#1E293B]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            background: `linear-gradient(90deg, #0F3460, #E94560)`,
          }}
        />
      </div>
      <span className="min-w-[32px] text-right font-mono text-[11px] text-text-secondary">
        {ordinal(Math.round(value))}
      </span>
    </div>
  );
}

// ============================================================
// Component
// ============================================================

export default function AdvancedStatsTable({
  advancedStats,
  percentiles,
}: AdvancedStatsTableProps) {
  return (
    <div className="rounded-xl bg-card p-4">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">
        Advanced Statistics
      </h3>

      <div className="space-y-5">
        {STAT_GROUPS.map((group) => (
          <div key={group.title}>
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
              {group.title}
            </h4>
            <div className="divide-y divide-[#334155]/30">
              {group.stats.map((stat) => {
                const value = advancedStats[stat.key];
                const pctile = stat.pctileKey
                  ? percentiles[stat.pctileKey]
                  : null;

                return (
                  <div
                    key={stat.key}
                    className="flex items-center justify-between py-1.5"
                  >
                    {/* Label + info tooltip */}
                    <div className="flex items-center text-xs text-text-secondary">
                      {stat.label}
                      <InfoTooltip text={stat.explanation} />
                    </div>

                    {/* Value + percentile */}
                    <div className="flex items-center gap-2 sm:gap-4">
                      <span className="min-w-[48px] text-right font-mono text-sm font-bold text-text-stat">
                        {formatValue(value, stat.isPct, stat.decimals)}
                      </span>
                      {pctile != null ? (
                        <PercentileBar value={pctile} />
                      ) : (
                        <div className="w-[108px]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
