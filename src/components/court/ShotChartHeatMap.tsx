"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { hexbin as d3Hexbin } from "d3-hexbin";
import { scaleLinear } from "d3-scale";
import { interpolateRgb } from "d3-interpolate";
import { toSvgX, toSvgY, COURT_WIDTH, COURT_HEIGHT } from "./BasketballCourt";
import type { ShotChartResponse, ZoneSummary } from "@/types";

// ============================================================
// Types
// ============================================================

/** Individual shot from ShotChartResponse.shots */
export type ShotChartShot = ShotChartResponse["shots"][number];

interface ShotChartHeatMapProps {
  shots: ShotChartShot[];
  zoneSummary: ZoneSummary[];
}

interface TooltipState {
  x: number;
  y: number;
  fgm: number;
  fga: number;
  fgPct: number;
  zone: string;
  leagueAvg: number;
}

// ============================================================
// Constants
// ============================================================

const HEX_RADIUS = 10;
const MIN_SHOTS_TO_RENDER = 1;

// Color scale anchors
const COLOR_COLD = "#3B82F6"; // blue — below league avg
const COLOR_NEUTRAL = "#F8FAFC"; // white — at league avg
const COLOR_HOT = "#EF4444"; // red — above league avg

// nba_api zone names from the shots route
const ZONE_LEAGUE_AVG_FALLBACK = 0.4;

// Shot zone mapping: determine which zone a shot coordinate falls in.
// Based on nba_api shot_zone_basic values.
// The shot data already has shotZoneBasic, so we use that directly.

// ============================================================
// Helpers
// ============================================================

function isValidShot(shot: ShotChartShot): boolean {
  if (typeof shot.locX !== "number" || typeof shot.locY !== "number") {
    return false;
  }
  if (Number.isNaN(shot.locX) || Number.isNaN(shot.locY)) return false;
  // Exclude shots beyond half court (locY > ~418 in nba_api coords)
  if (shot.locY > 418) return false;
  return true;
}

function getLeagueAvgForZone(
  zone: string | null,
  zoneSummary: ZoneSummary[]
): number {
  if (!zone) return ZONE_LEAGUE_AVG_FALLBACK;
  const match = zoneSummary.find((z) => z.zone === zone);
  return match ? match.leagueAvg : ZONE_LEAGUE_AVG_FALLBACK;
}

// ============================================================
// Component
// ============================================================

export default function ShotChartHeatMap({
  shots,
  zoneSummary,
}: ShotChartHeatMapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Filter valid shots and convert to SVG coordinates
  const validShots = useMemo(
    () => shots.filter(isValidShot),
    [shots]
  );

  // Build hexbin layout and compute bins
  const { bins, hexPath, opacityScale } = useMemo(() => {
    const hexbinLayout = d3Hexbin<ShotChartShot>()
      .x((d) => toSvgX(d.locX))
      .y((d) => toSvgY(d.locY))
      .radius(HEX_RADIUS)
      .extent([
        [0, 0],
        [COURT_WIDTH, COURT_HEIGHT],
      ]);

    const binsResult = hexbinLayout(validShots);
    const path = hexbinLayout.hexagon();

    // Find max bin count for opacity scaling
    const maxCount = binsResult.reduce(
      (max, bin) => Math.max(max, bin.length),
      0
    );

    const opacity = scaleLinear()
      .domain([1, Math.max(maxCount * 0.4, 3), Math.max(maxCount, 10)])
      .range([0.3, 0.7, 1.0] as Iterable<number>)
      .clamp(true);

    return { bins: binsResult, hexPath: path, opacityScale: opacity };
  }, [validShots]);

  // Color interpolators
  const coldToNeutral = useMemo(
    () => interpolateRgb(COLOR_COLD, COLOR_NEUTRAL),
    []
  );
  const neutralToHot = useMemo(
    () => interpolateRgb(COLOR_NEUTRAL, COLOR_HOT),
    []
  );

  const getHexColor = useCallback(
    (fgPct: number, leagueAvg: number): string => {
      // diff: negative = below avg, 0 = at avg, positive = above avg
      const diff = fgPct - leagueAvg;
      // Map diff to 0-1 range; ±0.15 (15 percentage points) = full color
      const maxDiff = 0.15;
      if (diff <= 0) {
        const t = Math.min(Math.abs(diff) / maxDiff, 1);
        return coldToNeutral(1 - t); // 1 = neutral, 0 = cold
      } else {
        const t = Math.min(diff / maxDiff, 1);
        return neutralToHot(t); // 0 = neutral, 1 = hot
      }
    },
    [coldToNeutral, neutralToHot]
  );

  // Compute stats for each bin
  const binData = useMemo(() => {
    return bins
      .filter((bin) => bin.length >= MIN_SHOTS_TO_RENDER)
      .map((bin) => {
        const fga = bin.length;
        const fgm = bin.filter((shot) => shot.shotMade).length;
        const fgPct = fga > 0 ? fgm / fga : 0;

        // Determine the dominant zone in this bin
        const zoneCounts: Record<string, number> = {};
        for (const shot of bin) {
          const z = shot.shotZoneBasic ?? "Unknown";
          zoneCounts[z] = (zoneCounts[z] || 0) + 1;
        }
        const zone = Object.entries(zoneCounts).sort(
          (a, b) => b[1] - a[1]
        )[0][0];

        const leagueAvg = getLeagueAvgForZone(zone, zoneSummary);
        const color = getHexColor(fgPct, leagueAvg);
        const opacity = opacityScale(fga);

        return {
          x: bin.x,
          y: bin.y,
          fga,
          fgm,
          fgPct,
          zone,
          leagueAvg,
          color,
          opacity,
        };
      });
  }, [bins, zoneSummary, getHexColor, opacityScale]);

  const handleMouseEnter = useCallback(
    (bin: (typeof binData)[number], event: React.MouseEvent) => {
      // Get the position relative to the SVG's parent container
      const svg = (event.target as SVGElement).closest("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      // Convert SVG coordinates to pixel coordinates
      const scaleX = rect.width / COURT_WIDTH;
      const scaleY = rect.height / COURT_HEIGHT;
      setTooltip({
        x: rect.left + bin.x * scaleX,
        y: rect.top + bin.y * scaleY - 10,
        fgm: bin.fgm,
        fga: bin.fga,
        fgPct: bin.fgPct,
        zone: bin.zone,
        leagueAvg: bin.leagueAvg,
      });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleTouchStart = useCallback(
    (bin: (typeof binData)[number], event: React.TouchEvent) => {
      event.preventDefault();
      const svg = (event.target as SVGElement).closest("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / COURT_WIDTH;
      const scaleY = rect.height / COURT_HEIGHT;
      setTooltip({
        x: rect.left + bin.x * scaleX,
        y: rect.top + bin.y * scaleY - 10,
        fgm: bin.fgm,
        fga: bin.fga,
        fgPct: bin.fgPct,
        zone: bin.zone,
        leagueAvg: bin.leagueAvg,
      });
    },
    []
  );

  // Dismiss tooltip on outside touch
  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => setTooltip(null);
    const timer = setTimeout(() => {
      document.addEventListener("touchstart", dismiss, { once: true });
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("touchstart", dismiss);
    };
  }, [tooltip]);

  // Empty state
  if (shots.length === 0) {
    return (
      <text
        x={COURT_WIDTH / 2}
        y={COURT_HEIGHT / 2}
        textAnchor="middle"
        fill="#94A3B8"
        fontSize={14}
      >
        No shot data available
      </text>
    );
  }

  return (
    <>
      <g>
        {binData.map((bin, i) => (
          <path
            key={i}
            d={hexPath}
            transform={`translate(${bin.x},${bin.y})`}
            fill={bin.color}
            fillOpacity={bin.opacity}
            stroke={bin.color}
            strokeOpacity={bin.opacity * 0.5}
            strokeWidth={0.5}
            onMouseEnter={(e) => handleMouseEnter(bin, e)}
            onMouseLeave={handleMouseLeave}
            onTouchStart={(e) => handleTouchStart(bin, e)}
            style={{ cursor: "crosshair" }}
          />
        ))}
      </g>

      {/* Tooltip rendered outside SVG via portal-like fixed positioning */}
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
            <div style={{ fontWeight: 600 }}>
              FG%: {(tooltip.fgPct * 100).toFixed(1)}% ({tooltip.fgm}/
              {tooltip.fga} attempts)
            </div>
            <div style={{ color: "#94A3B8" }}>Zone: {tooltip.zone}</div>
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
