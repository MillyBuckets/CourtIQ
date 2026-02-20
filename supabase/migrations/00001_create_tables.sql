-- ============================================================
-- CourtIQ — Initial Schema Migration
-- Creates all tables, indexes, constraints, and triggers
-- Source of truth: PRD Section 11
-- ============================================================

-- Enable pg_trgm for fuzzy player name search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- Table: players
-- Core player biographical and roster data
-- ============================================================
CREATE TABLE players (
    id              SERIAL PRIMARY KEY,
    nba_player_id   INTEGER UNIQUE NOT NULL,
    full_name       VARCHAR(100) NOT NULL,
    first_name      VARCHAR(50),
    last_name       VARCHAR(50),
    slug            VARCHAR(100) UNIQUE NOT NULL,
    team_id         INTEGER,
    team_abbr       VARCHAR(5),
    team_name       VARCHAR(50),
    position        VARCHAR(10),
    jersey_number   VARCHAR(5),
    height          VARCHAR(10),
    weight          INTEGER,
    birth_date      DATE,
    country         VARCHAR(50),
    draft_year      INTEGER,
    draft_round     INTEGER,
    draft_number    INTEGER,
    season_exp      INTEGER,
    headshot_url    VARCHAR(255),
    is_active       BOOLEAN DEFAULT true,
    tier            SMALLINT DEFAULT 2 CHECK (tier IN (1, 2)),
    last_fetched    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for players
CREATE INDEX idx_players_slug ON players(slug);
CREATE INDEX idx_players_active ON players(is_active) WHERE is_active = true;
CREATE INDEX idx_players_tier ON players(tier);
CREATE INDEX idx_players_name_trgm ON players USING gin (full_name gin_trgm_ops);

-- ============================================================
-- Table: player_season_stats
-- Per-season basic box score averages (Tier 1 stats)
-- ============================================================
CREATE TABLE player_season_stats (
    id              SERIAL PRIMARY KEY,
    nba_player_id   INTEGER NOT NULL REFERENCES players(nba_player_id),
    season          VARCHAR(10) NOT NULL,
    season_type     VARCHAR(20) DEFAULT 'Regular Season',
    gp              INTEGER,
    gs              INTEGER,
    min_pg          NUMERIC(5,1),
    pts_pg          NUMERIC(5,1),
    reb_pg          NUMERIC(5,1),
    ast_pg          NUMERIC(5,1),
    stl_pg          NUMERIC(5,1),
    blk_pg          NUMERIC(5,1),
    tov_pg          NUMERIC(5,1),
    fgm_pg          NUMERIC(5,1),
    fga_pg          NUMERIC(5,1),
    fg_pct          NUMERIC(5,3),
    fg3m_pg         NUMERIC(5,1),
    fg3a_pg         NUMERIC(5,1),
    fg3_pct         NUMERIC(5,3),
    ftm_pg          NUMERIC(5,1),
    fta_pg          NUMERIC(5,1),
    ft_pct          NUMERIC(5,3),
    oreb_pg         NUMERIC(5,1),
    dreb_pg         NUMERIC(5,1),
    pf_pg           NUMERIC(5,1),
    plus_minus      NUMERIC(5,1),
    last_updated    TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(nba_player_id, season, season_type)
);

-- Indexes for player_season_stats
CREATE INDEX idx_season_stats_player ON player_season_stats(nba_player_id);
CREATE INDEX idx_season_stats_season ON player_season_stats(season);

-- ============================================================
-- Table: player_advanced_stats
-- Per-season advanced analytics (Tier 2 stats) + percentiles
-- ============================================================
CREATE TABLE player_advanced_stats (
    id              SERIAL PRIMARY KEY,
    nba_player_id   INTEGER NOT NULL REFERENCES players(nba_player_id),
    season          VARCHAR(10) NOT NULL,
    season_type     VARCHAR(20) DEFAULT 'Regular Season',
    per             NUMERIC(5,1),
    ts_pct          NUMERIC(5,3),
    efg_pct         NUMERIC(5,3),
    usg_pct         NUMERIC(5,1),
    ast_pct         NUMERIC(5,1),
    trb_pct         NUMERIC(5,1),
    tov_pct         NUMERIC(5,1),
    ows             NUMERIC(5,1),
    dws             NUMERIC(5,1),
    ws              NUMERIC(5,1),
    ws_48           NUMERIC(6,3),
    obpm            NUMERIC(5,1),
    dbpm            NUMERIC(5,1),
    bpm             NUMERIC(5,1),
    vorp            NUMERIC(5,1),
    ortg            NUMERIC(5,1),
    drtg            NUMERIC(5,1),
    net_rtg         NUMERIC(5,1),
    pace            NUMERIC(5,1),
    three_par       NUMERIC(5,3),
    ftr             NUMERIC(5,3),
    -- Percentile ranks (0-100, computed by calculate_percentiles.py)
    per_pctile      NUMERIC(5,1),
    ts_pctile       NUMERIC(5,1),
    usg_pctile      NUMERIC(5,1),
    ws_pctile       NUMERIC(5,1),
    bpm_pctile      NUMERIC(5,1),
    last_updated    TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(nba_player_id, season, season_type)
);

-- Indexes for player_advanced_stats
CREATE INDEX idx_advanced_stats_player ON player_advanced_stats(nba_player_id);
CREATE INDEX idx_advanced_stats_season ON player_advanced_stats(season);

-- ============================================================
-- Table: shot_chart_data
-- Individual shot attempts with court coordinates (Tier 3)
-- This powers the heat map — the crown jewel of the product
-- ============================================================
CREATE TABLE shot_chart_data (
    id                  SERIAL PRIMARY KEY,
    nba_player_id       INTEGER NOT NULL,
    game_id             VARCHAR(20) NOT NULL,
    game_date           DATE NOT NULL,
    season              VARCHAR(10) NOT NULL,
    period              SMALLINT,
    minutes_remaining   SMALLINT,
    seconds_remaining   SMALLINT,
    action_type         VARCHAR(50),
    shot_type           VARCHAR(20),
    shot_zone_basic     VARCHAR(30),
    shot_zone_area      VARCHAR(20),
    shot_zone_range     VARCHAR(20),
    shot_distance       SMALLINT,
    loc_x               SMALLINT NOT NULL,
    loc_y               SMALLINT NOT NULL,
    shot_made           BOOLEAN NOT NULL,
    opponent_team       VARCHAR(5),
    home_away           CHAR(1) CHECK (home_away IN ('H', 'A')),
    game_result         CHAR(1) CHECK (game_result IN ('W', 'L')),

    UNIQUE(nba_player_id, game_id, loc_x, loc_y, period, minutes_remaining, seconds_remaining)
);

-- Critical indexes for shot chart query performance
CREATE INDEX idx_shots_player_season ON shot_chart_data(nba_player_id, season);
CREATE INDEX idx_shots_player_date ON shot_chart_data(nba_player_id, game_date DESC);
CREATE INDEX idx_shots_game ON shot_chart_data(game_id);

-- ============================================================
-- Table: game_logs
-- Individual game box scores for Form Tracker and rolling windows
-- ============================================================
CREATE TABLE game_logs (
    id              SERIAL PRIMARY KEY,
    nba_player_id   INTEGER NOT NULL,
    game_id         VARCHAR(20) NOT NULL,
    game_date       DATE NOT NULL,
    season          VARCHAR(10) NOT NULL,
    matchup         VARCHAR(20),
    wl              CHAR(1) CHECK (wl IN ('W', 'L')),
    min             NUMERIC(5,1),
    pts             INTEGER,
    reb             INTEGER,
    ast             INTEGER,
    stl             INTEGER,
    blk             INTEGER,
    tov             INTEGER,
    fgm             INTEGER,
    fga             INTEGER,
    fg_pct          NUMERIC(5,3),
    fg3m            INTEGER,
    fg3a            INTEGER,
    fg3_pct         NUMERIC(5,3),
    ftm             INTEGER,
    fta             INTEGER,
    ft_pct          NUMERIC(5,3),
    oreb            INTEGER,
    dreb            INTEGER,
    pf              INTEGER,
    plus_minus      NUMERIC(5,1),

    UNIQUE(nba_player_id, game_id)
);

-- Indexes for game_logs
CREATE INDEX idx_gamelogs_player_date ON game_logs(nba_player_id, game_date DESC);
CREATE INDEX idx_gamelogs_player_season ON game_logs(nba_player_id, season);

-- ============================================================
-- Table: data_refresh_log
-- Pipeline execution audit trail
-- ============================================================
CREATE TABLE data_refresh_log (
    id              SERIAL PRIMARY KEY,
    job_name        VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    players_updated INTEGER,
    error_message   TEXT,
    started_at      TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    duration_seconds INTEGER
);

-- Index for querying recent jobs
CREATE INDEX idx_refresh_log_job ON data_refresh_log(job_name, started_at DESC);

-- ============================================================
-- Trigger: auto-update updated_at on players
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- Public read access, service-key write access
-- ============================================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_advanced_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE shot_chart_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_refresh_log ENABLE ROW LEVEL SECURITY;

-- Public read policies (anon key can SELECT)
CREATE POLICY "Public read access" ON players FOR SELECT USING (true);
CREATE POLICY "Public read access" ON player_season_stats FOR SELECT USING (true);
CREATE POLICY "Public read access" ON player_advanced_stats FOR SELECT USING (true);
CREATE POLICY "Public read access" ON shot_chart_data FOR SELECT USING (true);
CREATE POLICY "Public read access" ON game_logs FOR SELECT USING (true);
CREATE POLICY "Public read access" ON data_refresh_log FOR SELECT USING (true);

-- Service role write policies (pipeline uses service key)
CREATE POLICY "Service write access" ON players FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write access" ON player_season_stats FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write access" ON player_advanced_stats FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write access" ON shot_chart_data FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write access" ON game_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write access" ON data_refresh_log FOR ALL USING (auth.role() = 'service_role');
