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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    // Step 1: Look up the player by slug
    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("*")
      .eq("slug", slug)
      .limit(1)
      .single();

    if (playerError || !playerData) {
      if (playerError?.code === "PGRST116") {
        // "JSON object requested, multiple (or no) rows returned"
        return NextResponse.json(
          { error: "Player not found" },
          { status: 404, headers: corsHeaders }
        );
      }
      return NextResponse.json(
        { error: "Player not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const player = playerData as PlayerRow;
    const playerId = player.nba_player_id;

    // Step 2: Fetch season stats, advanced stats, and available seasons in parallel
    const [seasonResult, advancedResult, seasonsResult] = await Promise.all([
      // Most recent season's basic stats
      supabase
        .from("player_season_stats")
        .select("*")
        .eq("nba_player_id", playerId)
        .order("season", { ascending: false })
        .limit(1)
        .single(),

      // Most recent season's advanced stats
      supabase
        .from("player_advanced_stats")
        .select("*")
        .eq("nba_player_id", playerId)
        .order("season", { ascending: false })
        .limit(1)
        .single(),

      // All available seasons (for the season selector dropdown)
      supabase
        .from("player_season_stats")
        .select("season")
        .eq("nba_player_id", playerId)
        .order("season", { ascending: false }),
    ]);

    const seasonStats = (seasonResult.data ?? null) as PlayerSeasonStatsRow | null;
    const advancedStats = (advancedResult.data ?? null) as PlayerAdvancedStatsRow | null;
    const availableSeasons = (
      (seasonsResult.data ?? []) as { season: string }[]
    ).map((r) => r.season);

    // Determine which season we're reporting on
    const currentSeasonLabel =
      seasonStats?.season ?? advancedStats?.season ?? availableSeasons[0] ?? "";

    // Determine last_updated from whichever stat was updated most recently
    const lastUpdated =
      advancedStats?.last_updated ??
      seasonStats?.last_updated ??
      player.last_fetched ??
      new Date().toISOString();

    // Step 3: Build camelCase response
    const response = {
      player: {
        nbaPlayerId: player.nba_player_id,
        fullName: player.full_name,
        slug: player.slug,
        teamAbbr: player.team_abbr,
        teamName: player.team_name,
        position: player.position,
        jerseyNumber: player.jersey_number,
        height: player.height,
        weight: player.weight,
        birthDate: player.birth_date,
        country: player.country,
        draftYear: player.draft_year,
        draftRound: player.draft_round,
        draftNumber: player.draft_number,
        seasonExp: player.season_exp,
        headshotUrl: player.headshot_url,
      },
      currentSeason: {
        season: currentSeasonLabel,
        basic: {
          gp: seasonStats?.gp ?? null,
          gs: seasonStats?.gs ?? null,
          minPg: seasonStats?.min_pg ?? null,
          ptsPg: seasonStats?.pts_pg ?? null,
          rebPg: seasonStats?.reb_pg ?? null,
          astPg: seasonStats?.ast_pg ?? null,
          stlPg: seasonStats?.stl_pg ?? null,
          blkPg: seasonStats?.blk_pg ?? null,
          tovPg: seasonStats?.tov_pg ?? null,
          fgmPg: seasonStats?.fgm_pg ?? null,
          fgaPg: seasonStats?.fga_pg ?? null,
          fgPct: seasonStats?.fg_pct ?? null,
          fg3mPg: seasonStats?.fg3m_pg ?? null,
          fg3aPg: seasonStats?.fg3a_pg ?? null,
          fg3Pct: seasonStats?.fg3_pct ?? null,
          ftmPg: seasonStats?.ftm_pg ?? null,
          ftaPg: seasonStats?.fta_pg ?? null,
          ftPct: seasonStats?.ft_pct ?? null,
          orebPg: seasonStats?.oreb_pg ?? null,
          drebPg: seasonStats?.dreb_pg ?? null,
          pfPg: seasonStats?.pf_pg ?? null,
          plusMinus: seasonStats?.plus_minus ?? null,
        },
        advanced: {
          per: advancedStats?.per ?? null,
          tsPct: advancedStats?.ts_pct ?? null,
          efgPct: advancedStats?.efg_pct ?? null,
          usgPct: advancedStats?.usg_pct ?? null,
          astPct: advancedStats?.ast_pct ?? null,
          trbPct: advancedStats?.trb_pct ?? null,
          tovPct: advancedStats?.tov_pct ?? null,
          ows: advancedStats?.ows ?? null,
          dws: advancedStats?.dws ?? null,
          ws: advancedStats?.ws ?? null,
          ws48: advancedStats?.ws_48 ?? null,
          obpm: advancedStats?.obpm ?? null,
          dbpm: advancedStats?.dbpm ?? null,
          bpm: advancedStats?.bpm ?? null,
          vorp: advancedStats?.vorp ?? null,
          ortg: advancedStats?.ortg ?? null,
          drtg: advancedStats?.drtg ?? null,
          netRtg: advancedStats?.net_rtg ?? null,
          pace: advancedStats?.pace ?? null,
          threePar: advancedStats?.three_par ?? null,
          ftr: advancedStats?.ftr ?? null,
        },
        percentiles: {
          per: advancedStats?.per_pctile ?? null,
          ts: advancedStats?.ts_pctile ?? null,
          usg: advancedStats?.usg_pctile ?? null,
          ws: advancedStats?.ws_pctile ?? null,
          bpm: advancedStats?.bpm_pctile ?? null,
        },
      },
      availableSeasons,
      lastUpdated,
    };

    return NextResponse.json(response, {
      headers: { ...corsHeaders, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("Player profile route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
