import { NextRequest, NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase";
import type { PlayerRow } from "@/types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  // Missing or empty query → 400
  if (!q || q.trim() === "") {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400, headers: corsHeaders }
    );
  }

  const trimmed = q.trim();

  // Too short to be useful — return empty rather than hitting DB
  if (trimmed.length < 2) {
    return NextResponse.json({ players: [] }, { headers: corsHeaders });
  }

  try {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .ilike("full_name", `%${trimmed}%`)
      .order("tier", { ascending: true })
      .order("full_name", { ascending: true })
      .limit(10);

    if (error) {
      console.error("Supabase search error:", error);
      return NextResponse.json(
        { error: "Database query failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    const rows = (data ?? []) as PlayerRow[];
    const players = rows.map((row) => ({
      nbaPlayerId: row.nba_player_id,
      fullName: row.full_name,
      slug: row.slug,
      teamAbbr: row.team_abbr,
      teamName: row.team_name,
      position: row.position,
      jerseyNumber: row.jersey_number,
      headshotUrl: row.headshot_url,
      isActive: row.is_active,
    }));

    return NextResponse.json({ players }, {
      headers: { ...corsHeaders, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("Search route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
