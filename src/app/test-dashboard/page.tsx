"use client";

import React, { useState } from "react";
import PlayerHeader from "@/components/layout/PlayerHeader";
import StatSummaryBar from "@/components/dashboard/StatSummaryBar";
import CourtCanvas from "@/components/court/CourtCanvas";
import PlayerRadarChart from "@/components/dashboard/PlayerRadarChart";
import FormTracker from "@/components/dashboard/FormTracker";
import AdvancedStatsTable from "@/components/dashboard/AdvancedStatsTable";
import { MOCK_SHOTS, MOCK_ZONE_SUMMARY } from "@/lib/mockShotData";
import type {
  PlayerProfileResponse,
  RadarResponse,
  GameLogResponse,
  WindowSelection,
} from "@/types";

// ============================================================
// Mock Data
// ============================================================

const mockPlayer: PlayerProfileResponse["player"] = {
  nbaPlayerId: 1629029,
  fullName: "Luka Doncic",
  slug: "luka-doncic",
  teamAbbr: "DAL",
  teamName: "Dallas Mavericks",
  position: "G-F",
  jerseyNumber: "77",
  height: "6-7",
  weight: 230,
  birthDate: "1999-02-28",
  country: "Slovenia",
  draftYear: 2018,
  draftRound: 1,
  draftNumber: 3,
  seasonExp: 6,
  headshotUrl: null,
};

const mockBasicStats: PlayerProfileResponse["currentSeason"]["basic"] = {
  gp: 45,
  gs: 45,
  minPg: 36.2,
  ptsPg: 27.4,
  rebPg: 8.1,
  astPg: 5.3,
  stlPg: 1.2,
  blkPg: 0.6,
  tovPg: 3.1,
  fgmPg: 10.2,
  fgaPg: 20.8,
  fgPct: 0.49,
  fg3mPg: 2.8,
  fg3aPg: 7.5,
  fg3Pct: 0.373,
  ftmPg: 4.2,
  ftaPg: 4.8,
  ftPct: 0.875,
  orebPg: 1.1,
  drebPg: 7.0,
  pfPg: 2.3,
  plusMinus: 5.2,
};

const mockRollingStats = {
  last5: {
    ptsPg: 31.2,
    rebPg: 9.4,
    astPg: 6.0,
    fgPct: 0.52,
    fg3Pct: 0.41,
    ftPct: 0.90,
  },
  last10: {
    ptsPg: 29.1,
    rebPg: 8.6,
    astPg: 5.8,
    fgPct: 0.505,
    fg3Pct: 0.39,
    ftPct: 0.88,
  },
  season: {
    ptsPg: 27.4,
    rebPg: 8.1,
    astPg: 5.3,
    fgPct: 0.49,
    fg3Pct: 0.373,
    ftPct: 0.875,
  },
};

const mockRadarData: RadarResponse = {
  dimensions: {
    scoring: { score: 92, raw: 27.4, label: "27.4 PPG", leagueAvg: 15.2 },
    playmaking: { score: 74, raw: 5.3, label: "5.3 APG", leagueAvg: 3.8 },
    rebounding: { score: 81, raw: 8.1, label: "8.1 RPG", leagueAvg: 5.4 },
    defense: { score: 55, raw: 1.8, label: "1.8 STL+BLK", leagueAvg: 1.6 },
    efficiency: { score: 88, raw: 0.612, label: "61.2% TS", leagueAvg: 0.57 },
    volume: { score: 85, raw: 30.2, label: "30.2 USG%", leagueAvg: 20.0 },
  },
};

function generateMockGames(): GameLogResponse["games"] {
  const games: GameLogResponse["games"] = [];
  const teams = ["LAL", "GSW", "BOS", "MIA", "PHI", "DAL", "DEN", "MIL"];
  const baseDate = new Date("2025-10-22");

  for (let i = 0; i < 45; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i * 2 + Math.floor(Math.random() * 2));
    const opp = teams[i % teams.length];
    const isWin = Math.random() > 0.4;
    const pts = Math.round(20 + Math.random() * 20);
    const reb = Math.round(4 + Math.random() * 10);
    const ast = Math.round(2 + Math.random() * 8);
    const fgm = Math.round(6 + Math.random() * 10);
    const fga = fgm + Math.round(4 + Math.random() * 8);

    games.push({
      gameDate: d.toISOString().split("T")[0],
      matchup: `PHX vs. ${opp}`,
      wl: isWin ? "W" : "L",
      min: Math.round(30 + Math.random() * 10),
      pts,
      reb,
      ast,
      stl: Math.round(Math.random() * 3),
      blk: Math.round(Math.random() * 2),
      tov: Math.round(1 + Math.random() * 4),
      fgm,
      fga,
      fgPct: fga > 0 ? Math.round((fgm / fga) * 1000) / 1000 : null,
      fg3m: Math.round(Math.random() * 5),
      fg3a: Math.round(3 + Math.random() * 6),
      fg3Pct: Math.round(300 + Math.random() * 200) / 1000,
      ftm: Math.round(2 + Math.random() * 6),
      fta: Math.round(3 + Math.random() * 6),
      ftPct: Math.round(700 + Math.random() * 250) / 1000,
      oreb: Math.round(Math.random() * 3),
      dreb: Math.round(3 + Math.random() * 7),
      pf: Math.round(1 + Math.random() * 4),
      plusMinus: isWin
        ? Math.round(Math.random() * 20)
        : -Math.round(Math.random() * 15),
    });
  }
  return games;
}

const mockGames = generateMockGames();

const mockAdvancedStats: PlayerProfileResponse["currentSeason"]["advanced"] = {
  per: 26.8,
  tsPct: 0.612,
  efgPct: 0.568,
  usgPct: 0.302,
  astPct: 0.285,
  trbPct: 0.142,
  tovPct: 0.118,
  ows: 5.2,
  dws: 2.8,
  ws: 8.0,
  ws48: 0.198,
  obpm: 6.2,
  dbpm: 0.8,
  bpm: 7.0,
  vorp: 4.5,
  ortg: 118.5,
  drtg: 109.2,
  netRtg: 9.3,
  pace: 100.8,
  threePar: 0.361,
  ftr: 0.231,
};

const mockPercentiles: PlayerProfileResponse["currentSeason"]["percentiles"] = {
  per: 92,
  ts: 88,
  usg: 85,
  ws: 90,
  bpm: 94,
};

// ============================================================
// Page — mirrors the real player page layout exactly
// ============================================================

export default function TestDashboardPage() {
  const [selectedSeason, setSelectedSeason] = useState("2025-26");
  const [activeWindow, setActiveWindow] = useState<WindowSelection>("season");

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      {/* Row 1: Player Header (full width) */}
      <PlayerHeader
        player={mockPlayer}
        currentSeason={selectedSeason}
        availableSeasons={["2025-26", "2024-25", "2023-24"]}
        activeWindow={activeWindow}
        onSeasonChange={setSelectedSeason}
        onWindowChange={setActiveWindow}
      />

      {/* Row 2: Stat Summary Bar (full width) */}
      <StatSummaryBar
        basicStats={mockBasicStats}
        rollingStats={mockRollingStats}
        activeWindow={activeWindow}
      />

      {/* Row 3: Two-column layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Left column: Court (~60%) */}
        <div className="lg:col-span-3">
          <div className="rounded-xl bg-card p-4">
            <CourtCanvas
              shots={MOCK_SHOTS}
              zoneSummary={MOCK_ZONE_SUMMARY}
              loading={false}
              playerName="Luka Doncic"
            />
          </div>
        </div>

        {/* Right column: Radar, Form Tracker, Advanced Stats (~40%) */}
        <div className="space-y-4 lg:col-span-2">
          <PlayerRadarChart radarData={mockRadarData} />

          <FormTracker
            games={mockGames}
            activeWindow={activeWindow}
          />

          <AdvancedStatsTable
            advancedStats={mockAdvancedStats}
            percentiles={mockPercentiles}
          />
        </div>
      </div>
    </div>
  );
}
