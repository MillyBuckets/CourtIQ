import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase";
import type { PlayerRow, PlayerSeasonStatsRow } from "@/types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** Valid stat columns that can be queried. */
const VALID_STATS: Record<string, keyof PlayerSeasonStatsRow> = {
  pts: "pts_pg",
  ast: "ast_pg",
  reb: "reb_pg",
  fg3m: "fg3m_pg",
  stl: "stl_pg",
  blk: "blk_pg",
};

/** Determine current NBA season string from date. */
function currentSeason(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 10) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const stat = searchParams.get("stat") || "pts";
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 50) : 10;

  // Validate stat parameter
  if (!VALID_STATS[stat]) {
    return NextResponse.json(
      {
        error: `Invalid stat '${stat}'. Valid options: ${Object.keys(VALID_STATS).join(", ")}`,
      },
      { status: 400, headers: corsHeaders }
    );
  }

  const dbColumn = VALID_STATS[stat];
  const season = currentSeason();

  try {
    // Fetch top players for this stat, joined with player info.
    // Supabase doesn't support cross-table joins via the JS client without
    // foreign key relationships, so we do two queries: get top stat rows,
    // then look up the player details.
    const { data: statData, error: statError } = await supabase
      .from("player_season_stats")
      .select("nba_player_id, " + dbColumn)
      .eq("season", season)
      .not(dbColumn, "is", null)
      .order(dbColumn, { ascending: false })
      .limit(limit);

    if (statError) {
      console.error("Supabase leaders stat query error:", statError);
      return NextResponse.json(
        { error: "Database query failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    const statRows = (statData ?? []) as Pick<PlayerSeasonStatsRow, "nba_player_id" | typeof dbColumn>[];

    // No data yet — return empty leaders, not an error
    if (statRows.length === 0) {
      return NextResponse.json(
        { stat, leaders: [] },
        { headers: corsHeaders }
      );
    }

    // Fetch player details for the leader IDs
    const playerIds = statRows.map((r) => r.nba_player_id);
    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("nba_player_id, full_name, slug, team_abbr, position, headshot_url")
      .in("nba_player_id", playerIds);

    if (playerError) {
      console.error("Supabase leaders player query error:", playerError);
      return NextResponse.json(
        { error: "Database query failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Build a lookup map for player info
    type PlayerPick = Pick<
      PlayerRow,
      "nba_player_id" | "full_name" | "slug" | "team_abbr" | "position" | "headshot_url"
    >;
    const playerMap = new Map<number, PlayerPick>();
    for (const p of (playerData ?? []) as PlayerPick[]) {
      playerMap.set(p.nba_player_id, p);
    }

    // Combine stat values with player info, preserving the stat-ordered ranking
    const leaders = statRows
      .map((row) => {
        const player = playerMap.get(row.nba_player_id);
        if (!player) return null;

        const value = (row as Record<string, unknown>)[dbColumn];
        return {
          nbaPlayerId: player.nba_player_id,
          fullName: player.full_name,
          slug: player.slug,
          teamAbbr: player.team_abbr,
          position: player.position,
          headshotUrl: player.headshot_url,
          value: typeof value === "number" ? value : 0,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ stat, leaders }, {
      headers: { ...corsHeaders, "Cache-Control": "public, s-maxage=600, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("Leaders route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
