// ============================================================
// CourtIQ — TypeScript Type Definitions
// Mirrors database schema from PRD Section 11 and
// supabase/migrations/00001_create_tables.sql
// ============================================================

// ============================================================
// Database Row Types
// These map 1:1 to Supabase table rows
// ============================================================

export interface PlayerRow {
  id: number;
  nba_player_id: number;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  slug: string;
  team_id: number | null;
  team_abbr: string | null;
  team_name: string | null;
  position: string | null;
  jersey_number: string | null;
  height: string | null;
  weight: number | null;
  birth_date: string | null;
  country: string | null;
  draft_year: number | null;
  draft_round: number | null;
  draft_number: number | null;
  season_exp: number | null;
  headshot_url: string | null;
  is_active: boolean;
  tier: number;
  last_fetched: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerSeasonStatsRow {
  id: number;
  nba_player_id: number;
  season: string;
  season_type: string;
  gp: number | null;
  gs: number | null;
  min_pg: number | null;
  pts_pg: number | null;
  reb_pg: number | null;
  ast_pg: number | null;
  stl_pg: number | null;
  blk_pg: number | null;
  tov_pg: number | null;
  fgm_pg: number | null;
  fga_pg: number | null;
  fg_pct: number | null;
  fg3m_pg: number | null;
  fg3a_pg: number | null;
  fg3_pct: number | null;
  ftm_pg: number | null;
  fta_pg: number | null;
  ft_pct: number | null;
  oreb_pg: number | null;
  dreb_pg: number | null;
  pf_pg: number | null;
  plus_minus: number | null;
  last_updated: string;
}

export interface PlayerAdvancedStatsRow {
  id: number;
  nba_player_id: number;
  season: string;
  season_type: string;
  per: number | null;
  ts_pct: number | null;
  efg_pct: number | null;
  usg_pct: number | null;
  ast_pct: number | null;
  trb_pct: number | null;
  tov_pct: number | null;
  ows: number | null;
  dws: number | null;
  ws: number | null;
  ws_48: number | null;
  obpm: number | null;
  dbpm: number | null;
  bpm: number | null;
  vorp: number | null;
  ortg: number | null;
  drtg: number | null;
  net_rtg: number | null;
  pace: number | null;
  three_par: number | null;
  ftr: number | null;
  per_pctile: number | null;
  ts_pctile: number | null;
  usg_pctile: number | null;
  ws_pctile: number | null;
  bpm_pctile: number | null;
  last_updated: string;
}

export interface ShotChartRow {
  id: number;
  nba_player_id: number;
  game_id: string;
  game_date: string;
  season: string;
  period: number | null;
  minutes_remaining: number | null;
  seconds_remaining: number | null;
  action_type: string | null;
  shot_type: string | null;
  shot_zone_basic: string | null;
  shot_zone_area: string | null;
  shot_zone_range: string | null;
  shot_distance: number | null;
  loc_x: number;
  loc_y: number;
  shot_made: boolean;
  opponent_team: string | null;
  home_away: string | null;
  game_result: string | null;
}

export interface GameLogRow {
  id: number;
  nba_player_id: number;
  game_id: string;
  game_date: string;
  season: string;
  matchup: string | null;
  wl: string | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fgm: number | null;
  fga: number | null;
  fg_pct: number | null;
  fg3m: number | null;
  fg3a: number | null;
  fg3_pct: number | null;
  ftm: number | null;
  fta: number | null;
  ft_pct: number | null;
  oreb: number | null;
  dreb: number | null;
  pf: number | null;
  plus_minus: number | null;
}

export interface DataRefreshLogRow {
  id: number;
  job_name: string;
  status: "started" | "completed" | "failed";
  players_updated: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
}

// ============================================================
// Insert Types (omit auto-generated columns)
// Used by the Python pipeline when writing to Supabase
// ============================================================

export type PlayerInsert = Omit<PlayerRow, "id" | "created_at" | "updated_at">;
export type PlayerSeasonStatsInsert = Omit<PlayerSeasonStatsRow, "id" | "last_updated">;
export type PlayerAdvancedStatsInsert = Omit<PlayerAdvancedStatsRow, "id" | "last_updated">;
export type ShotChartInsert = Omit<ShotChartRow, "id">;
export type GameLogInsert = Omit<GameLogRow, "id">;
export type DataRefreshLogInsert = Omit<DataRefreshLogRow, "id">;

// ============================================================
// Supabase Database Type Map
// Enables typed supabase.from('table').select()
//
// NOTE: Insert/Update use Record<string, unknown> rather than
// Omit<> aliases because @supabase/supabase-js v2.97's select
// query parser resolves to `never` when Omit<> is used.
// For typed inserts/updates, use the Insert types above directly.
// ============================================================

export interface Database {
  public: {
    Tables: {
      players: {
        Row: PlayerRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      player_season_stats: {
        Row: PlayerSeasonStatsRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      player_advanced_stats: {
        Row: PlayerAdvancedStatsRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      shot_chart_data: {
        Row: ShotChartRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      game_logs: {
        Row: GameLogRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      data_refresh_log: {
        Row: DataRefreshLogRow;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
  };
}

// ============================================================
// API Response Types
// Shape of data returned by Next.js API routes (PRD Section 12)
// ============================================================

export interface PlayerSearchResult {
  nbaPlayerId: number;
  fullName: string;
  slug: string;
  teamAbbr: string | null;
  teamName: string | null;
  position: string | null;
  jerseyNumber: string | null;
  headshotUrl: string | null;
  isActive: boolean;
}

export interface PlayerSearchResponse {
  players: PlayerSearchResult[];
}

export interface PlayerProfileResponse {
  player: {
    nbaPlayerId: number;
    fullName: string;
    slug: string;
    teamAbbr: string | null;
    teamName: string | null;
    position: string | null;
    jerseyNumber: string | null;
    height: string | null;
    weight: number | null;
    birthDate: string | null;
    country: string | null;
    draftYear: number | null;
    draftRound: number | null;
    draftNumber: number | null;
    seasonExp: number | null;
    headshotUrl: string | null;
  };
  currentSeason: {
    season: string;
    basic: {
      gp: number | null;
      gs: number | null;
      minPg: number | null;
      ptsPg: number | null;
      rebPg: number | null;
      astPg: number | null;
      stlPg: number | null;
      blkPg: number | null;
      tovPg: number | null;
      fgmPg: number | null;
      fgaPg: number | null;
      fgPct: number | null;
      fg3mPg: number | null;
      fg3aPg: number | null;
      fg3Pct: number | null;
      ftmPg: number | null;
      ftaPg: number | null;
      ftPct: number | null;
      orebPg: number | null;
      drebPg: number | null;
      pfPg: number | null;
      plusMinus: number | null;
    };
    advanced: {
      per: number | null;
      tsPct: number | null;
      efgPct: number | null;
      usgPct: number | null;
      astPct: number | null;
      trbPct: number | null;
      tovPct: number | null;
      ows: number | null;
      dws: number | null;
      ws: number | null;
      ws48: number | null;
      obpm: number | null;
      dbpm: number | null;
      bpm: number | null;
      vorp: number | null;
      ortg: number | null;
      drtg: number | null;
      netRtg: number | null;
      pace: number | null;
      threePar: number | null;
      ftr: number | null;
    };
    percentiles: {
      per: number | null;
      ts: number | null;
      usg: number | null;
      ws: number | null;
      bpm: number | null;
    };
  };
  availableSeasons: string[];
  lastUpdated: string;
}

export interface ZoneSummary {
  zone: string;
  fgm: number;
  fga: number;
  fgPct: number;
  leagueAvg: number;
}

export interface ShotChartResponse {
  shots: {
    locX: number;
    locY: number;
    shotMade: boolean;
    shotType: string | null;
    shotZoneBasic: string | null;
    shotDistance: number | null;
    actionType: string | null;
    period: number | null;
    gameDate: string;
  }[];
  zoneSummary: ZoneSummary[];
  totalShots: number;
  overallFgPct: number;
}

export interface RollingAverage {
  ptsPg: number;
  rebPg: number;
  astPg: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;
}

export interface GameLogResponse {
  games: {
    gameDate: string;
    matchup: string | null;
    wl: string | null;
    min: number | null;
    pts: number | null;
    reb: number | null;
    ast: number | null;
    stl: number | null;
    blk: number | null;
    tov: number | null;
    fgm: number | null;
    fga: number | null;
    fgPct: number | null;
    fg3m: number | null;
    fg3a: number | null;
    fg3Pct: number | null;
    ftm: number | null;
    fta: number | null;
    ftPct: number | null;
    oreb: number | null;
    dreb: number | null;
    pf: number | null;
    plusMinus: number | null;
  }[];
  rolling: {
    last5: RollingAverage;
    last10: RollingAverage;
    season: RollingAverage;
  };
}

export interface RadarDimension {
  score: number;
  raw: number;
  label: string;
  leagueAvg: number;
}

export interface RadarResponse {
  dimensions: {
    scoring: RadarDimension;
    playmaking: RadarDimension;
    rebounding: RadarDimension;
    defense: RadarDimension;
    efficiency: RadarDimension;
    volume: RadarDimension;
  };
}

export interface StatLeader {
  nbaPlayerId: number;
  fullName: string;
  slug: string;
  teamAbbr: string | null;
  position: string | null;
  headshotUrl: string | null;
  value: number;
}

export interface LeadersResponse {
  stat: string;
  leaders: StatLeader[];
}

// ============================================================
// UI State Types
// ============================================================

export type CourtMode = "heatmap" | "zones";
export type ShotFilter = "all" | "2PT" | "3PT";
export type WindowSelection = "season" | "last10" | "last5";
