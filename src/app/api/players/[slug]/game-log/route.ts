import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase";
import type { PlayerRow, GameLogRow } from "@/types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * Compute rolling averages from a slice of game log rows.
 * Shooting percentages are calculated from totals (sum FGM / sum FGA),
 * NOT averaged per-game percentages — this is the correct method.
 */
function computeRolling(games: GameLogRow[]) {
  if (games.length === 0) {
    return { ptsPg: 0, rebPg: 0, astPg: 0, fgPct: 0, fg3Pct: 0, ftPct: 0 };
  }

  let pts = 0;
  let reb = 0;
  let ast = 0;
  let fgm = 0;
  let fga = 0;
  let fg3m = 0;
  let fg3a = 0;
  let ftm = 0;
  let fta = 0;

  for (const g of games) {
    pts += g.pts ?? 0;
    reb += g.reb ?? 0;
    ast += g.ast ?? 0;
    fgm += g.fgm ?? 0;
    fga += g.fga ?? 0;
    fg3m += g.fg3m ?? 0;
    fg3a += g.fg3a ?? 0;
    ftm += g.ftm ?? 0;
    fta += g.fta ?? 0;
  }

  const n = games.length;
  return {
    ptsPg: round(pts / n, 1),
    rebPg: round(reb / n, 1),
    astPg: round(ast / n, 1),
    fgPct: fga > 0 ? round(fgm / fga, 3) : 0,
    fg3Pct: fg3a > 0 ? round(fg3m / fg3a, 3) : 0,
    ftPct: fta > 0 ? round(ftm / fta, 3) : 0,
  };
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const searchParams = request.nextUrl.searchParams;

  const season = searchParams.get("season");
  const limitParam = searchParams.get("limit");

  if (!season) {
    return NextResponse.json(
      { error: "Query parameter 'season' is required" },
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

    // Step 2: Fetch all game logs for this season (ordered most recent first)
    let query = supabase
      .from("game_logs")
      .select("*")
      .eq("nba_player_id", playerId)
      .eq("season", season)
      .order("game_date", { ascending: false });

    if (limitParam) {
      const limit = parseInt(limitParam, 10);
      if (!isNaN(limit) && limit > 0) {
        query = query.limit(limit);
      }
    }

    const { data: gameData, error: gameError } = await query;

    if (gameError) {
      console.error("Supabase game log query error:", gameError);
      return NextResponse.json(
        { error: "Database query failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    const allGames = (gameData ?? []) as GameLogRow[];

    // Step 3: Build individual game entries (camelCase, full box score)
    const games = allGames.map((g) => ({
      gameDate: g.game_date,
      matchup: g.matchup,
      wl: g.wl,
      min: g.min,
      pts: g.pts,
      reb: g.reb,
      ast: g.ast,
      stl: g.stl,
      blk: g.blk,
      tov: g.tov,
      fgm: g.fgm,
      fga: g.fga,
      fgPct: g.fg_pct,
      fg3m: g.fg3m,
      fg3a: g.fg3a,
      fg3Pct: g.fg3_pct,
      ftm: g.ftm,
      fta: g.fta,
      ftPct: g.ft_pct,
      oreb: g.oreb,
      dreb: g.dreb,
      pf: g.pf,
      plusMinus: g.plus_minus,
    }));

    // Step 4: Compute rolling averages
    // allGames is already sorted most-recent-first, so slice from the front.
    // If fewer than 5 or 10 games exist, average whatever is available.
    const last5 = computeRolling(allGames.slice(0, Math.min(5, allGames.length)));
    const last10 = computeRolling(allGames.slice(0, Math.min(10, allGames.length)));
    const seasonAvg = computeRolling(allGames);

    return NextResponse.json(
      {
        games,
        rolling: {
          last5,
          last10,
          season: seasonAvg,
        },
      },
      { headers: { ...corsHeaders, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } }
    );
  } catch (err) {
    console.error("Game log route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
