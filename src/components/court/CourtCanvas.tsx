"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import BasketballCourt from "./BasketballCourt";
import ShotChartHeatMap from "./ShotChartHeatMap";
import ShotZoneOverlay from "./ShotZoneOverlay";
import type { ShotChartShot } from "./ShotChartHeatMap";
import type { ZoneSummary, CourtMode, ShotFilter } from "@/types";

// ============================================================
// Types
// ============================================================

interface CourtCanvasProps {
  shots: ShotChartShot[];
  zoneSummary: ZoneSummary[];
  loading: boolean;
  playerName: string;
}

// ============================================================
// Options
// ============================================================

const MODE_OPTIONS: { value: CourtMode; label: string }[] = [
  { value: "heatmap", label: "Heat Map" },
  { value: "zones", label: "Shot Zones" },
];

const FILTER_OPTIONS: { value: ShotFilter; label: string }[] = [
  { value: "all", label: "All Shots" },
  { value: "2PT", label: "2PT" },
  { value: "3PT", label: "3PT" },
];

// ============================================================
// Filter logic
// ============================================================

const THREE_PT_ZONES = new Set([
  "Left Corner 3",
  "Right Corner 3",
  "Above the Break 3",
]);

function filterShots(
  shots: ShotChartShot[],
  filter: ShotFilter
): ShotChartShot[] {
  if (filter === "all") return shots;
  const shotTypeValue = filter === "2PT" ? "2PT Field Goal" : "3PT Field Goal";
  return shots.filter((s) => s.shotType === shotTypeValue);
}

function filterZones(zones: ZoneSummary[], filter: ShotFilter): ZoneSummary[] {
  if (filter === "all") return zones;
  if (filter === "3PT") {
    return zones.filter((z) => THREE_PT_ZONES.has(z.zone));
  }
  return zones.filter((z) => !THREE_PT_ZONES.has(z.zone));
}

// ============================================================
// Component
// ============================================================

export default function CourtCanvas({
  shots,
  zoneSummary,
  loading,
  playerName,
}: CourtCanvasProps) {
  const [mode, setMode] = useState<CourtMode>("heatmap");
  const [filter, setFilter] = useState<ShotFilter>("all");
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const pendingMode = useRef<CourtMode | null>(null);

  // Fade-out → swap → fade-in when mode changes
  const handleModeSwitch = (newMode: CourtMode) => {
    if (newMode === mode) return;
    pendingMode.current = newMode;
    setOverlayOpacity(0); // fade out
  };

  // After fade-out completes, swap mode and fade back in
  const handleTransitionEnd = () => {
    if (pendingMode.current !== null) {
      setMode(pendingMode.current);
      pendingMode.current = null;
      // Allow a frame for React to render the new overlay, then fade in
      requestAnimationFrame(() => setOverlayOpacity(1));
    }
  };

  const filteredShots = useMemo(
    () => filterShots(shots, filter),
    [shots, filter]
  );

  const filteredZones = useMemo(
    () => filterZones(zoneSummary, filter),
    [zoneSummary, filter]
  );

  return (
    <div className="flex flex-col items-center gap-4">
      {/* ---- Controls ---- */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* Mode switcher */}
        <div className="flex rounded-full bg-court-secondary p-1">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleModeSwitch(opt.value)}
              className={`rounded-full px-4 py-3 text-sm font-medium transition-colors sm:py-1.5 ${
                mode === opt.value
                  ? "bg-court-accent text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Filter buttons */}
        <div className="flex rounded-full bg-court-secondary p-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`rounded-full px-3 py-3 text-xs font-medium transition-colors sm:py-1 ${
                filter === opt.value
                  ? "bg-court-accent-alt text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Court ---- */}
      <div
        className="relative w-full"
        role="img"
        aria-label={`Shot chart for ${playerName}`}
      >
        <BasketballCourt>
          {loading ? (
            <rect
              x={0}
              y={0}
              width={500}
              height={470}
              fill="#1A1A2E"
              fillOpacity={0.6}
              className="animate-pulse"
            />
          ) : (
            <g
              style={{ transition: "opacity 200ms ease" }}
              opacity={overlayOpacity}
              onTransitionEnd={handleTransitionEnd}
            >
              {mode === "heatmap" ? (
                <ShotChartHeatMap
                  shots={filteredShots}
                  zoneSummary={filteredZones}
                />
              ) : (
                <ShotZoneOverlay zoneSummary={filteredZones} />
              )}
            </g>
          )}
        </BasketballCourt>
      </div>
    </div>
  );
}
