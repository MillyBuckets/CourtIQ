import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase";
import type {
  PlayerRow,
  PlayerSeasonStatsRow,
  PlayerAdvancedStatsRow,
} from "@/types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * Compute percentile rank: percentage of values strictly below the given value.
 * Returns 0-100.
 */
function percentileRank(value: number, allValues: number[]): number {
  const below = allValues.filter((v) => v < value).length;
  return allValues.length > 0
    ? Math.round((below / allValues.length) * 100)
    : 50;
}

/** Mean of a number array, or 0 if empty. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/** Determine current NBA season string from date. */
function currentSeason(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const year = now.getFullYear();
  // NBA season spans two calendar years; starts in October
  if (month >= 10) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const searchParams = request.nextUrl.searchParams;
  const season = searchParams.get("season") || currentSeason();

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

    // Step 2: Fetch Tier 1 IDs, this player's stats, and all Tier 1 stats in parallel
    const { data: tier1Data } = await supabase
      .from("players")
      .select("nba_player_id")
      .eq("tier", 1);

    const tier1Ids = ((tier1Data ?? []) as { nba_player_id: number }[]).map(
      (r) => r.nba_player_id
    );

    // Step 3: Fetch player stats + league-wide stats in parallel
    const playerSeasonPromise = supabase
      .from("player_season_stats")
      .select("*")
      .eq("nba_player_id", playerId)
      .eq("season", season)
      .limit(1)
      .single();

    const playerAdvancedPromise = supabase
      .from("player_advanced_stats")
      .select("*")
      .eq("nba_player_id", playerId)
      .eq("season", season)
      .limit(1)
      .single();

    const allSeasonPromise = supabase
      .from("player_season_stats")
      .select("nba_player_id, pts_pg, ast_pg, reb_pg, stl_pg, blk_pg")
      .eq("season", season)
      .in("nba_player_id", tier1Ids);

    const allAdvancedPromise = supabase
      .from("player_advanced_stats")
      .select("nba_player_id, ts_pct, usg_pct")
      .eq("season", season)
      .in("nba_player_id", tier1Ids);

    const [playerSeasonResult, playerAdvancedResult, allSeasonResult, allAdvancedResult] =
      await Promise.all([
        playerSeasonPromise,
        playerAdvancedPromise,
        allSeasonPromise,
        allAdvancedPromise,
      ]);

    const playerSeason = (playerSeasonResult.data ?? null) as PlayerSeasonStatsRow | null;
    const playerAdvanced = (playerAdvancedResult.data ?? null) as PlayerAdvancedStatsRow | null;

    // If the player has no stats for this season, return 404
    if (!playerSeason) {
      return NextResponse.json(
        { error: "No stats found for this player/season" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Step 4: Build arrays for percentile computation
    type BasicStatPick = Pick<
      PlayerSeasonStatsRow,
      "nba_player_id" | "pts_pg" | "ast_pg" | "reb_pg" | "stl_pg" | "blk_pg"
    >;
    type AdvancedStatPick = Pick<
      PlayerAdvancedStatsRow,
      "nba_player_id" | "ts_pct" | "usg_pct"
    >;

    const allBasic = (allSeasonResult.data ?? []) as BasicStatPick[];
    const allAdvanced = (allAdvancedResult.data ?? []) as AdvancedStatPick[];

    const scoringValues = allBasic.map((r) => r.pts_pg ?? 0);
    const playmakingValues = allBasic.map((r) => r.ast_pg ?? 0);
    const reboundingValues = allBasic.map((r) => r.reb_pg ?? 0);
    const defenseValues = allBasic.map(
      (r) => (r.stl_pg ?? 0) + (r.blk_pg ?? 0)
    );
    const efficiencyValues = allAdvanced
      .filter((r) => r.ts_pct != null)
      .map((r) => r.ts_pct!);
    const volumeValues = allAdvanced
      .filter((r) => r.usg_pct != null)
      .map((r) => r.usg_pct!);

    // Step 5: Compute this player's raw values
    const rawScoring = playerSeason.pts_pg ?? 0;
    const rawPlaymaking = playerSeason.ast_pg ?? 0;
    const rawRebounding = playerSeason.reb_pg ?? 0;
    const rawDefense = (playerSeason.stl_pg ?? 0) + (playerSeason.blk_pg ?? 0);
    const rawEfficiency = playerAdvanced?.ts_pct ?? 0;
    const rawVolume = playerAdvanced?.usg_pct ?? 0;

    // Step 6: Compute percentile ranks and league averages
    const dimensions = {
      scoring: {
        score: percentileRank(rawScoring, scoringValues),
        raw: rawScoring,
        label: "Scoring",
        leagueAvg: mean(scoringValues),
      },
      playmaking: {
        score: percentileRank(rawPlaymaking, playmakingValues),
        raw: rawPlaymaking,
        label: "Playmaking",
        leagueAvg: mean(playmakingValues),
      },
      rebounding: {
        score: percentileRank(rawRebounding, reboundingValues),
        raw: rawRebounding,
        label: "Rebounding",
        leagueAvg: mean(reboundingValues),
      },
      defense: {
        score: percentileRank(rawDefense, defenseValues),
        raw: Math.round(rawDefense * 10) / 10,
        label: "Defense",
        leagueAvg: mean(defenseValues),
      },
      efficiency: {
        score: percentileRank(rawEfficiency, efficiencyValues),
        raw: rawEfficiency,
        label: "Efficiency",
        leagueAvg: mean(efficiencyValues),
      },
      volume: {
        score: percentileRank(rawVolume, volumeValues),
        raw: rawVolume,
        label: "Volume",
        leagueAvg: mean(volumeValues),
      },
    };

    return NextResponse.json({ dimensions }, {
      headers: { ...corsHeaders, "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("Radar route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
