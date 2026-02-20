/**
 * Mock shot data for visual testing of CourtCanvas.
 * Generates ~600 realistic shots distributed across NBA shooting zones.
 * DELETE THIS FILE before production.
 */

import type { ShotChartResponse, ZoneSummary } from "@/types";

type Shot = ShotChartResponse["shots"][number];

// Seeded pseudo-random for deterministic output
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

const rand = seededRandom(42);

function randBetween(min: number, max: number): number {
  return min + rand() * (max - min);
}

function randomShot(
  locX: number,
  locY: number,
  zone: string,
  shotType: string,
  fgPct: number
): Shot {
  return {
    locX: Math.round(locX),
    locY: Math.round(locY),
    shotMade: rand() < fgPct,
    shotType,
    shotZoneBasic: zone,
    shotDistance: Math.round(Math.sqrt(locX ** 2 + locY ** 2) / 10),
    actionType: "Jump Shot",
    period: Math.ceil(rand() * 4),
    gameDate: "2026-01-15",
  };
}

function generateShots(): Shot[] {
  const shots: Shot[] = [];

  // Restricted Area: within 40 units of basket (0,0), ~120 shots, ~65% FG
  for (let i = 0; i < 120; i++) {
    const angle = rand() * Math.PI; // semicircle in front of basket
    const r = rand() * 38;
    shots.push(
      randomShot(
        Math.cos(angle) * r,
        Math.sin(angle) * r,
        "Restricted Area",
        "2PT Field Goal",
        0.65
      )
    );
  }

  // In The Paint (Non-RA): inside paint but outside restricted area, ~80 shots, ~40% FG
  for (let i = 0; i < 80; i++) {
    const x = randBetween(-75, 75);
    const y = randBetween(45, 140);
    shots.push(
      randomShot(x, y, "In The Paint (Non-RA)", "2PT Field Goal", 0.40)
    );
  }

  // Mid-Range: between paint edge and 3PT line, ~100 shots, ~42% FG
  for (let i = 0; i < 100; i++) {
    const angle = randBetween(0.15, Math.PI - 0.15);
    const r = randBetween(100, 230);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    // Only include if outside paint and inside 3PT
    if (Math.abs(x) > 85 || y > 145) {
      shots.push(randomShot(x, y, "Mid-Range", "2PT Field Goal", 0.42));
    }
  }

  // Left Corner 3: x in [-220, -210], y in [0, 85], ~50 shots, ~39% FG
  for (let i = 0; i < 50; i++) {
    const x = randBetween(-220, -200);
    const y = randBetween(5, 80);
    shots.push(
      randomShot(x, y, "Left Corner 3", "3PT Field Goal", 0.39)
    );
  }

  // Right Corner 3: mirror, ~50 shots, ~41% FG
  for (let i = 0; i < 50; i++) {
    const x = randBetween(200, 220);
    const y = randBetween(5, 80);
    shots.push(
      randomShot(x, y, "Right Corner 3", "3PT Field Goal", 0.41)
    );
  }

  // Above the Break 3: along the arc, ~200 shots, ~36% FG
  for (let i = 0; i < 200; i++) {
    const angle = randBetween(0.4, Math.PI - 0.4);
    const r = randBetween(237, 260);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    shots.push(
      randomShot(x, y, "Above the Break 3", "3PT Field Goal", 0.36)
    );
  }

  return shots;
}

export const MOCK_SHOTS: Shot[] = generateShots();

// Compute zone summary from generated shots
function computeZoneSummary(shots: Shot[]): ZoneSummary[] {
  const leagueAvgs: Record<string, number> = {
    "Restricted Area": 0.63,
    "In The Paint (Non-RA)": 0.4,
    "Mid-Range": 0.42,
    "Left Corner 3": 0.39,
    "Right Corner 3": 0.39,
    "Above the Break 3": 0.36,
  };

  const agg: Record<string, { fgm: number; fga: number }> = {};
  for (const shot of shots) {
    const zone = shot.shotZoneBasic ?? "Unknown";
    if (!agg[zone]) agg[zone] = { fgm: 0, fga: 0 };
    agg[zone].fga += 1;
    if (shot.shotMade) agg[zone].fgm += 1;
  }

  return Object.entries(agg).map(([zone, { fgm, fga }]) => ({
    zone,
    fgm,
    fga,
    fgPct: fga > 0 ? Math.round((fgm / fga) * 1000) / 1000 : 0,
    leagueAvg: leagueAvgs[zone] ?? 0.4,
  }));
}

export const MOCK_ZONE_SUMMARY: ZoneSummary[] = computeZoneSummary(MOCK_SHOTS);
