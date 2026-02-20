import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase";
import type { PlayerRow, ShotChartRow, GameLogRow } from "@/types";

// NOTE: This endpoint returns the most data of any route — the shots array
// can contain 500–1,000+ items for a full season. The frontend hex-bin
// renderer handles this volume; we intentionally return all shots so
// D3 can bin them client-side.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// League-average FG% by zone for the 2025-26 season (hardcoded for MVP).
// These are reasonable approximations based on historical NBA data.
// TODO: Compute from actual league-wide shot_chart_data post-MVP.
const LEAGUE_AVG_BY_ZONE: Record<string, number> = {
  "Restricted Area": 0.63,
  "In The Paint (Non-RA)": 0.4,
  "Mid-Range": 0.42,
  "Left Corner 3": 0.39,
  "Right Corner 3": 0.39,
  "Above the Break 3": 0.36,
  "Backcourt": 0.02,
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const searchParams = request.nextUrl.searchParams;

  const season = searchParams.get("season");
  const lastNParam = searchParams.get("last_n");
  const shotTypeParam = searchParams.get("shot_type");

  // season is required
  if (!season) {
    return NextResponse.json(
      { error: "Query parameter 'season' is required" },
      { status: 400, headers: corsHeaders }
    );
  }

  // Validate last_n if provided
  let lastN: number | null = null;
  if (lastNParam) {
    lastN = parseInt(lastNParam, 10);
    if (lastN !== 5 && lastN !== 10) {
      return NextResponse.json(
        { error: "last_n must be 5 or 10" },
        { status: 400, headers: corsHeaders }
      );
    }
  }

  // Validate shot_type if provided
  if (shotTypeParam && shotTypeParam !== "2PT" && shotTypeParam !== "3PT") {
    return NextResponse.json(
      { error: "shot_type must be '2PT' or '3PT'" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // Step 1: Look up the player by slug
    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("*")
      .eq("slug", slug)
      .limit(1)
      .single();

    if (playerError || !playerData) {
      return NextResponse.json(
        { error: "Player not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const player = playerData as PlayerRow;
    const playerId = player.nba_player_id;

    // Step 2: If last_n is requested, get the N most recent game dates
    let recentGameDates: string[] | null = null;
    if (lastN) {
      const { data: gameData } = await supabase
        .from("game_logs")
        .select("game_date")
        .eq("nba_player_id", playerId)
        .eq("season", season)
        .order("game_date", { ascending: false })
        .limit(lastN);

      const games = (gameData ?? []) as Pick<GameLogRow, "game_date">[];
      recentGameDates = games.map((g) => g.game_date);

      if (recentGameDates.length === 0) {
        // No games found — return empty result
        return NextResponse.json(
          {
            shots: [],
            zoneSummary: [],
            totalShots: 0,
            overallFgPct: 0,
          },
          { headers: corsHeaders }
        );
      }
    }

    // Step 3: Query shot_chart_data with filters
    let query = supabase
      .from("shot_chart_data")
      .select("*")
      .eq("nba_player_id", playerId)
      .eq("season", season);

    // Filter to recent game dates if last_n was requested
    if (recentGameDates) {
      query = query.in("game_date", recentGameDates);
    }

    // Filter by shot type (the DB stores "2PT Field Goal" / "3PT Field Goal")
    if (shotTypeParam === "2PT") {
      query = query.eq("shot_type", "2PT Field Goal");
    } else if (shotTypeParam === "3PT") {
      query = query.eq("shot_type", "3PT Field Goal");
    }

    const { data: shotData, error: shotError } = await query;

    if (shotError) {
      console.error("Supabase shot chart query error:", shotError);
      return NextResponse.json(
        { error: "Database query failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    const rows = (shotData ?? []) as ShotChartRow[];

    // Step 4: Build individual shots array (camelCase for frontend)
    const shots = rows.map((row) => ({
      locX: row.loc_x,
      locY: row.loc_y,
      shotMade: row.shot_made,
      shotType: row.shot_type,
      shotZoneBasic: row.shot_zone_basic,
      shotDistance: row.shot_distance,
      actionType: row.action_type,
      period: row.period,
      gameDate: row.game_date,
    }));

    // Step 5: Aggregate zone summaries
    const zoneAgg: Record<string, { fgm: number; fga: number }> = {};
    let totalMade = 0;

    for (const row of rows) {
      const zone = row.shot_zone_basic ?? "Unknown";
      if (!zoneAgg[zone]) {
        zoneAgg[zone] = { fgm: 0, fga: 0 };
      }
      zoneAgg[zone].fga += 1;
      if (row.shot_made) {
        zoneAgg[zone].fgm += 1;
        totalMade += 1;
      }
    }

    const zoneSummary = Object.entries(zoneAgg).map(([zone, { fgm, fga }]) => ({
      zone,
      fgm,
      fga,
      fgPct: fga > 0 ? Math.round((fgm / fga) * 1000) / 1000 : 0,
      leagueAvg: LEAGUE_AVG_BY_ZONE[zone] ?? 0.4,
    }));

    const totalShots = rows.length;
    const overallFgPct =
      totalShots > 0 ? Math.round((totalMade / totalShots) * 1000) / 1000 : 0;

    return NextResponse.json(
      {
        shots,
        zoneSummary,
        totalShots,
        overallFgPct,
      },
      { headers: { ...corsHeaders, "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300" } }
    );
  } catch (err) {
    console.error("Shot chart route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
