"""
CourtIQ — Seed Mock Data

Inserts 5 well-known NBA players with realistic mock data into all tables:
  - players
  - player_season_stats
  - player_advanced_stats
  - shot_chart_data  (~150-200 shots per player, player-specific patterns)
  - game_logs        (~40 games per player)

Usage:
    python3 scripts/seed_mock_data.py              # upsert seed data
    python3 scripts/seed_mock_data.py --clean       # delete old seed data first
    python3 scripts/seed_mock_data.py --season 2024-25  # override season

Requires SUPABASE_URL and SUPABASE_KEY env vars (or .env.local via dotenv).
"""

from __future__ import annotations

import argparse
import math
import random as _random_module
from datetime import date, datetime, timedelta, timezone

from config import (
    supabase,
    logger,
    get_current_season,
    make_slug,
    get_headshot_url,
)

# ============================================================
# Deterministic RNG
# ============================================================

rng = _random_module.Random(42)

# ============================================================
# Constants
# ============================================================

BATCH_SIZE_SMALL = 50
BATCH_SIZE_SHOTS = 100

NBA_TEAMS = [
    "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN",
    "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MEM", "MIA",
    "MIL", "MIN", "NOP", "NYK", "OKC", "ORL", "PHI", "PHX",
    "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
]

SEASON_START = date(2025, 10, 22)

# ============================================================
# Player Definitions
# ============================================================

PLAYERS = [
    {
        "nba_player_id": 201939,
        "full_name": "Stephen Curry",
        "first_name": "Stephen",
        "last_name": "Curry",
        "team_id": 1610612744,
        "team_abbr": "GSW",
        "team_name": "Golden State Warriors",
        "position": "G",
        "jersey_number": "30",
        "height": "6-2",
        "weight": 185,
        "birth_date": "1988-03-14",
        "country": "USA",
        "draft_year": 2009,
        "draft_round": 1,
        "draft_number": 7,
        "season_exp": 16,
    },
    {
        "nba_player_id": 2544,
        "full_name": "LeBron James",
        "first_name": "LeBron",
        "last_name": "James",
        "team_id": 1610612747,
        "team_abbr": "LAL",
        "team_name": "Los Angeles Lakers",
        "position": "F",
        "jersey_number": "23",
        "height": "6-9",
        "weight": 250,
        "birth_date": "1984-12-30",
        "country": "USA",
        "draft_year": 2003,
        "draft_round": 1,
        "draft_number": 1,
        "season_exp": 22,
    },
    {
        "nba_player_id": 203507,
        "full_name": "Giannis Antetokounmpo",
        "first_name": "Giannis",
        "last_name": "Antetokounmpo",
        "team_id": 1610612749,
        "team_abbr": "MIL",
        "team_name": "Milwaukee Bucks",
        "position": "F",
        "jersey_number": "34",
        "height": "6-11",
        "weight": 243,
        "birth_date": "1994-12-06",
        "country": "Greece",
        "draft_year": 2013,
        "draft_round": 1,
        "draft_number": 15,
        "season_exp": 12,
    },
    {
        "nba_player_id": 1629029,
        "full_name": "Luka Doncic",
        "first_name": "Luka",
        "last_name": "Doncic",
        "team_id": 1610612742,
        "team_abbr": "DAL",
        "team_name": "Dallas Mavericks",
        "position": "G-F",
        "jersey_number": "77",
        "height": "6-7",
        "weight": 230,
        "birth_date": "1999-02-28",
        "country": "Slovenia",
        "draft_year": 2018,
        "draft_round": 1,
        "draft_number": 3,
        "season_exp": 7,
    },
    {
        "nba_player_id": 1628369,
        "full_name": "Jayson Tatum",
        "first_name": "Jayson",
        "last_name": "Tatum",
        "team_id": 1610612738,
        "team_abbr": "BOS",
        "team_name": "Boston Celtics",
        "position": "F",
        "jersey_number": "0",
        "height": "6-8",
        "weight": 210,
        "birth_date": "1998-03-03",
        "country": "USA",
        "draft_year": 2017,
        "draft_round": 1,
        "draft_number": 3,
        "season_exp": 8,
    },
]

SEED_PLAYER_IDS = [p["nba_player_id"] for p in PLAYERS]

# ============================================================
# Season Stats Definitions
# ============================================================


def get_season_stats(season: str) -> list[dict]:
    """Return realistic per-game season stat rows for the 5 seed players."""
    return [
        # Curry
        {
            "nba_player_id": 201939, "season": season, "season_type": "Regular Season",
            "gp": 48, "gs": 48, "min_pg": 32.5, "pts_pg": 26.8, "reb_pg": 5.2,
            "ast_pg": 5.1, "stl_pg": 1.0, "blk_pg": 0.4, "tov_pg": 3.1,
            "fgm_pg": 9.2, "fga_pg": 19.8, "fg_pct": 0.465,
            "fg3m_pg": 4.2, "fg3a_pg": 10.8, "fg3_pct": 0.389,
            "ftm_pg": 4.2, "fta_pg": 4.5, "ft_pct": 0.933,
            "oreb_pg": 0.5, "dreb_pg": 4.7, "pf_pg": 2.1, "plus_minus": 6.2,
        },
        # LeBron
        {
            "nba_player_id": 2544, "season": season, "season_type": "Regular Season",
            "gp": 45, "gs": 45, "min_pg": 33.8, "pts_pg": 25.4, "reb_pg": 7.5,
            "ast_pg": 8.3, "stl_pg": 1.2, "blk_pg": 0.6, "tov_pg": 3.5,
            "fgm_pg": 9.8, "fga_pg": 19.2, "fg_pct": 0.510,
            "fg3m_pg": 2.2, "fg3a_pg": 6.1, "fg3_pct": 0.361,
            "ftm_pg": 3.6, "fta_pg": 5.0, "ft_pct": 0.720,
            "oreb_pg": 1.0, "dreb_pg": 6.5, "pf_pg": 1.8, "plus_minus": 4.8,
        },
        # Giannis
        {
            "nba_player_id": 203507, "season": season, "season_type": "Regular Season",
            "gp": 50, "gs": 50, "min_pg": 35.2, "pts_pg": 31.2, "reb_pg": 11.8,
            "ast_pg": 5.8, "stl_pg": 1.1, "blk_pg": 1.4, "tov_pg": 3.4,
            "fgm_pg": 12.0, "fga_pg": 21.5, "fg_pct": 0.558,
            "fg3m_pg": 0.8, "fg3a_pg": 2.8, "fg3_pct": 0.286,
            "ftm_pg": 6.4, "fta_pg": 9.2, "ft_pct": 0.696,
            "oreb_pg": 2.5, "dreb_pg": 9.3, "pf_pg": 3.2, "plus_minus": 5.5,
        },
        # Luka
        {
            "nba_player_id": 1629029, "season": season, "season_type": "Regular Season",
            "gp": 47, "gs": 47, "min_pg": 36.1, "pts_pg": 28.9, "reb_pg": 8.2,
            "ast_pg": 8.8, "stl_pg": 1.4, "blk_pg": 0.5, "tov_pg": 3.8,
            "fgm_pg": 10.1, "fga_pg": 22.5, "fg_pct": 0.449,
            "fg3m_pg": 3.3, "fg3a_pg": 9.0, "fg3_pct": 0.367,
            "ftm_pg": 5.4, "fta_pg": 6.8, "ft_pct": 0.794,
            "oreb_pg": 0.8, "dreb_pg": 7.4, "pf_pg": 2.4, "plus_minus": 3.2,
        },
        # Tatum
        {
            "nba_player_id": 1628369, "season": season, "season_type": "Regular Season",
            "gp": 49, "gs": 49, "min_pg": 35.8, "pts_pg": 27.5, "reb_pg": 8.5,
            "ast_pg": 4.8, "stl_pg": 1.1, "blk_pg": 0.7, "tov_pg": 2.8,
            "fgm_pg": 9.6, "fga_pg": 21.0, "fg_pct": 0.457,
            "fg3m_pg": 3.2, "fg3a_pg": 8.5, "fg3_pct": 0.376,
            "ftm_pg": 5.1, "fta_pg": 5.8, "ft_pct": 0.879,
            "oreb_pg": 1.0, "dreb_pg": 7.5, "pf_pg": 2.5, "plus_minus": 5.8,
        },
    ]


# ============================================================
# Advanced Stats Definitions
# ============================================================


def get_advanced_stats(season: str) -> list[dict]:
    """Return realistic advanced stat rows for the 5 seed players."""
    raw = [
        # Curry
        {
            "nba_player_id": 201939, "season": season, "season_type": "Regular Season",
            "per": 24.5, "ts_pct": 0.632, "efg_pct": 0.567, "usg_pct": 28.5,
            "ast_pct": 25.8, "trb_pct": 11.2, "tov_pct": 12.4,
            "ows": 4.8, "dws": 1.5, "ws": 6.3, "ws_48": 0.192,
            "obpm": 6.5, "dbpm": -0.2, "bpm": 6.3, "vorp": 4.2,
            "ortg": 118.5, "drtg": 112.3, "net_rtg": 6.2, "pace": 100.5,
            "three_par": 0.545, "ftr": 0.227,
        },
        # LeBron
        {
            "nba_player_id": 2544, "season": season, "season_type": "Regular Season",
            "per": 23.2, "ts_pct": 0.598, "efg_pct": 0.571, "usg_pct": 30.2,
            "ast_pct": 38.5, "trb_pct": 14.8, "tov_pct": 13.2,
            "ows": 3.2, "dws": 2.1, "ws": 5.3, "ws_48": 0.163,
            "obpm": 5.8, "dbpm": 1.2, "bpm": 7.0, "vorp": 4.5,
            "ortg": 115.2, "drtg": 110.8, "net_rtg": 4.4, "pace": 99.2,
            "three_par": 0.318, "ftr": 0.260,
        },
        # Giannis
        {
            "nba_player_id": 203507, "season": season, "season_type": "Regular Season",
            "per": 31.2, "ts_pct": 0.618, "efg_pct": 0.576, "usg_pct": 35.8,
            "ast_pct": 22.5, "trb_pct": 20.5, "tov_pct": 13.5,
            "ows": 4.5, "dws": 2.8, "ws": 7.3, "ws_48": 0.205,
            "obpm": 7.2, "dbpm": 2.5, "bpm": 9.7, "vorp": 5.8,
            "ortg": 119.8, "drtg": 108.5, "net_rtg": 11.3, "pace": 101.2,
            "three_par": 0.130, "ftr": 0.428,
        },
        # Luka
        {
            "nba_player_id": 1629029, "season": season, "season_type": "Regular Season",
            "per": 25.8, "ts_pct": 0.585, "efg_pct": 0.530, "usg_pct": 34.5,
            "ast_pct": 42.0, "trb_pct": 15.2, "tov_pct": 14.8,
            "ows": 3.5, "dws": 1.8, "ws": 5.3, "ws_48": 0.148,
            "obpm": 6.8, "dbpm": -0.5, "bpm": 6.3, "vorp": 4.0,
            "ortg": 116.8, "drtg": 113.5, "net_rtg": 3.3, "pace": 98.8,
            "three_par": 0.400, "ftr": 0.302,
        },
        # Tatum
        {
            "nba_player_id": 1628369, "season": season, "season_type": "Regular Season",
            "per": 24.8, "ts_pct": 0.601, "efg_pct": 0.543, "usg_pct": 29.8,
            "ast_pct": 21.5, "trb_pct": 16.2, "tov_pct": 10.8,
            "ows": 4.2, "dws": 2.2, "ws": 6.4, "ws_48": 0.180,
            "obpm": 5.5, "dbpm": 1.0, "bpm": 6.5, "vorp": 4.5,
            "ortg": 117.2, "drtg": 111.0, "net_rtg": 6.2, "pace": 99.8,
            "three_par": 0.405, "ftr": 0.276,
        },
    ]

    # Compute percentiles within this pool
    pctile_fields = {
        "per": "per_pctile",
        "ts_pct": "ts_pctile",
        "usg_pct": "usg_pctile",
        "ws": "ws_pctile",
        "bpm": "bpm_pctile",
    }

    n = len(raw)
    for src_field, dst_field in pctile_fields.items():
        values = [(i, row[src_field]) for i, row in enumerate(raw)]
        values.sort(key=lambda x: x[1])
        for rank, (idx, _) in enumerate(values):
            raw[idx][dst_field] = round((rank / (n - 1)) * 100, 1) if n > 1 else 50.0

    return raw


# ============================================================
# Shot Chart Generation
# ============================================================

# Zone definitions: (zone_basic, coord_generator, action_types)
# coord_generator returns (loc_x, loc_y)

def _restricted_area_coord() -> tuple[int, int]:
    """Random point within the restricted area (~4ft radius)."""
    angle = rng.uniform(0, math.pi)
    radius = rng.uniform(0, 38)
    x = int(radius * math.cos(angle) * rng.choice([-1, 1]))
    y = int(radius * math.sin(angle) * 0.6 + rng.randint(-5, 15))
    return (max(-40, min(40, x)), max(-10, min(38, y)))


def _paint_coord() -> tuple[int, int]:
    """Random point in the paint but outside restricted area."""
    x = rng.randint(-75, 75)
    y = rng.randint(40, 142)
    return (x, y)


def _midrange_coord() -> tuple[int, int]:
    """Random mid-range shot (between paint and 3PT line)."""
    # Generate via polar coordinates, radius 100-230 from basket
    angle = rng.uniform(0.05, math.pi - 0.05)
    radius = rng.uniform(100, 230)
    x = int(radius * math.cos(angle))
    y = int(radius * math.sin(angle))
    # Make sure it's not inside the paint
    if abs(x) < 80 and y < 142:
        x = rng.choice([-1, 1]) * rng.randint(85, 180)
    return (max(-230, min(230, x)), max(20, min(280, y)))


def _left_corner_3_coord() -> tuple[int, int]:
    """Random left corner 3."""
    x = rng.randint(-240, -220)
    y = rng.randint(-5, 75)
    return (x, y)


def _right_corner_3_coord() -> tuple[int, int]:
    """Random right corner 3."""
    x = rng.randint(220, 240)
    y = rng.randint(-5, 75)
    return (x, y)


def _above_break_3_coord() -> tuple[int, int]:
    """Random above-the-break 3 along the arc."""
    angle = rng.uniform(0.35, math.pi - 0.35)
    radius = rng.uniform(237, 260)
    x = int(radius * math.cos(angle))
    y = int(radius * math.sin(angle))
    return (max(-245, min(245, x)), max(60, min(330, y)))


def _get_zone_area(loc_x: int) -> str:
    """Derive shot_zone_area from loc_x."""
    ax = abs(loc_x)
    if ax < 80:
        return "Center(C)"
    elif loc_x < -160:
        return "Left Side(L)"
    elif loc_x > 160:
        return "Right Side(R)"
    elif loc_x < 0:
        return "Left Side Center(LC)"
    else:
        return "Right Side Center(RC)"


def _get_zone_range(distance_ft: int) -> str:
    """Derive shot_zone_range from distance in feet."""
    if distance_ft < 8:
        return "Less Than 8 ft."
    elif distance_ft < 16:
        return "8-16 ft."
    elif distance_ft < 24:
        return "16-24 ft."
    else:
        return "24+ ft."


# Zone config: (zone_basic, coord_fn, shot_type, action_types)
ZONE_CONFIGS = {
    "Restricted Area": (
        _restricted_area_coord,
        "2PT Field Goal",
        ["Layup Shot", "Dunk Shot", "Driving Layup Shot", "Alley Oop Dunk Shot", "Finger Roll Layup Shot"],
    ),
    "In The Paint (Non-RA)": (
        _paint_coord,
        "2PT Field Goal",
        ["Floating Jump Shot", "Hook Shot", "Turnaround Jump Shot", "Push Shot"],
    ),
    "Mid-Range": (
        _midrange_coord,
        "2PT Field Goal",
        ["Jump Shot", "Pull-Up Jump Shot", "Fadeaway Jump Shot", "Turnaround Fadeaway"],
    ),
    "Left Corner 3": (
        _left_corner_3_coord,
        "3PT Field Goal",
        ["Jump Shot", "Step Back Jump Shot", "Pull-Up Jump Shot"],
    ),
    "Right Corner 3": (
        _right_corner_3_coord,
        "3PT Field Goal",
        ["Jump Shot", "Step Back Jump Shot", "Pull-Up Jump Shot"],
    ),
    "Above the Break 3": (
        _above_break_3_coord,
        "3PT Field Goal",
        ["Jump Shot", "Step Back Jump Shot", "Pull-Up Jump Shot", "Running Pull-Up Jump Shot"],
    ),
}

# Player shot profiles: zone_name -> (count, fg_pct)
SHOT_PROFILES: dict[int, dict[str, tuple[int, float]]] = {
    # Curry: shooter's chart — heavy 3PT, especially above the break
    201939: {
        "Restricted Area":         (30, 0.65),
        "In The Paint (Non-RA)":   (15, 0.40),
        "Mid-Range":               (15, 0.46),
        "Left Corner 3":           (20, 0.43),
        "Right Corner 3":          (20, 0.44),
        "Above the Break 3":       (100, 0.40),
    },
    # LeBron: balanced, paint-dominant, moderate 3s
    2544: {
        "Restricted Area":         (55, 0.72),
        "In The Paint (Non-RA)":   (30, 0.42),
        "Mid-Range":               (35, 0.45),
        "Left Corner 3":           (10, 0.38),
        "Right Corner 3":          (10, 0.37),
        "Above the Break 3":       (30, 0.35),
    },
    # Giannis: rim runner — mostly restricted area, very few 3s
    203507: {
        "Restricted Area":         (90, 0.74),
        "In The Paint (Non-RA)":   (35, 0.44),
        "Mid-Range":               (10, 0.35),
        "Left Corner 3":           (3, 0.25),
        "Right Corner 3":          (3, 0.28),
        "Above the Break 3":       (9, 0.27),
    },
    # Luka: step-back 3s, heavy mid-range, good paint finishing
    1629029: {
        "Restricted Area":         (45, 0.68),
        "In The Paint (Non-RA)":   (25, 0.40),
        "Mid-Range":               (40, 0.44),
        "Left Corner 3":           (12, 0.38),
        "Right Corner 3":          (12, 0.37),
        "Above the Break 3":       (56, 0.36),
    },
    # Tatum: balanced 3PT from everywhere + paint scoring
    1628369: {
        "Restricted Area":         (40, 0.66),
        "In The Paint (Non-RA)":   (25, 0.41),
        "Mid-Range":               (30, 0.43),
        "Left Corner 3":           (15, 0.40),
        "Right Corner 3":          (15, 0.39),
        "Above the Break 3":       (65, 0.37),
    },
}


def generate_game_schedule(
    team_abbr: str, n_games: int, player_seed: int
) -> list[dict]:
    """Generate a schedule of n_games with dates, IDs, opponents, etc."""
    local_rng = _random_module.Random(player_seed)
    opponents = [t for t in NBA_TEAMS if t != team_abbr]
    games = []
    current_date = SEASON_START

    for i in range(n_games):
        game_id = f"00225{player_seed % 1000:03d}{i + 1:03d}"
        opp = local_rng.choice(opponents)
        home = local_rng.random() < 0.5
        matchup = f"{team_abbr} vs. {opp}" if home else f"{team_abbr} @ {opp}"
        wl = "W" if local_rng.random() < 0.55 else "L"

        games.append({
            "game_id": game_id,
            "game_date": current_date.isoformat(),
            "opponent_team": opp,
            "home_away": "H" if home else "A",
            "game_result": wl,
            "matchup": matchup,
            "wl": wl,
        })
        current_date += timedelta(days=local_rng.choice([2, 2, 3, 3, 3]))

    return games


def generate_shots_for_player(
    player_id: int, season: str, games: list[dict]
) -> list[dict]:
    """Generate shot chart data for a player according to their shot profile."""
    profile = SHOT_PROFILES[player_id]
    shots = []
    seen_keys: set[tuple] = set()

    # Distribute shots across ALL games so Last 5 / Last 10 window filtering works
    shot_games = games

    for zone_name, (count, fg_pct) in profile.items():
        coord_fn, shot_type, action_types = ZONE_CONFIGS[zone_name]

        for _ in range(count):
            # Pick a random game for this shot
            game = rng.choice(shot_games)
            loc_x, loc_y = coord_fn()
            shot_distance = round(math.sqrt(loc_x ** 2 + loc_y ** 2) / 10)
            period = rng.choices([1, 2, 3, 4], weights=[28, 27, 25, 20])[0]

            # Ensure unique composite key
            for _attempt in range(20):
                mins_rem = rng.randint(0, 11)
                secs_rem = rng.randint(0, 59)
                key = (player_id, game["game_id"], loc_x, loc_y, period, mins_rem, secs_rem)
                if key not in seen_keys:
                    seen_keys.add(key)
                    break
            else:
                # All attempts collided — skip this shot
                continue

            shots.append({
                "nba_player_id": player_id,
                "game_id": game["game_id"],
                "game_date": game["game_date"],
                "season": season,
                "period": period,
                "minutes_remaining": mins_rem,
                "seconds_remaining": secs_rem,
                "action_type": rng.choice(action_types),
                "shot_type": shot_type,
                "shot_zone_basic": zone_name,
                "shot_zone_area": _get_zone_area(loc_x),
                "shot_zone_range": _get_zone_range(shot_distance),
                "shot_distance": shot_distance,
                "loc_x": loc_x,
                "loc_y": loc_y,
                "shot_made": rng.random() < fg_pct,
                "opponent_team": game["opponent_team"],
                "home_away": game["home_away"],
                "game_result": game["game_result"],
            })

    rng.shuffle(shots)
    return shots


# ============================================================
# Game Log Generation
# ============================================================

# Player baselines: (mean, stdev) for key counting stats
# fga, fg3a, fta are volume; fg_pct, fg3_pct, ft_pct are shooting %
GAME_LOG_PROFILES: dict[int, dict] = {
    201939: {  # Curry
        "min": (32.5, 3.0), "fga": (20, 4), "fg_pct": (0.465, 0.08),
        "fg3a": (11, 3), "fg3_pct": (0.389, 0.10),
        "fta": (4.5, 2.0), "ft_pct": (0.933, 0.05),
        "oreb": (0.5, 0.6), "dreb": (4.7, 2.0),
        "ast": (5.1, 2.5), "stl": (1.0, 0.8), "blk": (0.4, 0.5),
        "tov": (3.1, 1.2), "pf": (2.1, 1.0), "plus_minus": (6.0, 12.0),
    },
    2544: {  # LeBron
        "min": (33.8, 4.0), "fga": (19, 4), "fg_pct": (0.510, 0.08),
        "fg3a": (6, 2), "fg3_pct": (0.361, 0.12),
        "fta": (5.0, 2.5), "ft_pct": (0.720, 0.08),
        "oreb": (1.0, 0.8), "dreb": (6.5, 2.5),
        "ast": (8.3, 3.0), "stl": (1.2, 0.9), "blk": (0.6, 0.7),
        "tov": (3.5, 1.5), "pf": (1.8, 1.0), "plus_minus": (5.0, 10.0),
    },
    203507: {  # Giannis
        "min": (35.2, 3.5), "fga": (22, 4), "fg_pct": (0.558, 0.08),
        "fg3a": (3, 1.5), "fg3_pct": (0.286, 0.15),
        "fta": (9.2, 3.0), "ft_pct": (0.696, 0.10),
        "oreb": (2.5, 1.5), "dreb": (9.3, 3.0),
        "ast": (5.8, 2.5), "stl": (1.1, 0.8), "blk": (1.4, 1.0),
        "tov": (3.4, 1.3), "pf": (3.2, 1.2), "plus_minus": (5.5, 11.0),
    },
    1629029: {  # Luka
        "min": (36.1, 3.0), "fga": (23, 5), "fg_pct": (0.449, 0.08),
        "fg3a": (9, 3), "fg3_pct": (0.367, 0.12),
        "fta": (6.8, 3.0), "ft_pct": (0.794, 0.08),
        "oreb": (0.8, 0.7), "dreb": (7.4, 2.5),
        "ast": (8.8, 3.5), "stl": (1.4, 1.0), "blk": (0.5, 0.6),
        "tov": (3.8, 1.5), "pf": (2.4, 1.2), "plus_minus": (3.0, 12.0),
    },
    1628369: {  # Tatum
        "min": (35.8, 3.0), "fga": (21, 4), "fg_pct": (0.457, 0.08),
        "fg3a": (9, 3), "fg3_pct": (0.376, 0.10),
        "fta": (5.8, 2.5), "ft_pct": (0.879, 0.06),
        "oreb": (1.0, 0.8), "dreb": (7.5, 2.5),
        "ast": (4.8, 2.0), "stl": (1.1, 0.8), "blk": (0.7, 0.7),
        "tov": (2.8, 1.2), "pf": (2.5, 1.0), "plus_minus": (6.0, 10.0),
    },
}


def _clamp(val: float, lo: float, hi: float) -> int:
    """Round and clamp a value to [lo, hi]."""
    return int(max(lo, min(hi, round(val))))


def generate_game_logs(
    player_id: int, season: str, games: list[dict]
) -> list[dict]:
    """Generate realistic per-game box scores for a player."""
    profile = GAME_LOG_PROFILES[player_id]
    logs = []

    for game in games:
        # Generate volume stats
        minutes = round(max(15.0, min(42.0, rng.gauss(*profile["min"]))), 1)
        fga = _clamp(rng.gauss(*profile["fga"]), 8, 35)
        fgm = _clamp(fga * max(0.20, min(0.75, rng.gauss(*profile["fg_pct"]))), 0, fga)

        fg3a = _clamp(rng.gauss(*profile["fg3a"]), 0, fga)
        fg3m = _clamp(fg3a * max(0.0, min(0.65, rng.gauss(*profile["fg3_pct"]))), 0, min(fg3a, fgm))

        fta = _clamp(rng.gauss(*profile["fta"]), 0, 20)
        ftm = _clamp(fta * max(0.30, min(1.0, rng.gauss(*profile["ft_pct"]))), 0, fta)

        # Derived
        pts = 2 * (fgm - fg3m) + 3 * fg3m + ftm
        oreb = _clamp(rng.gauss(*profile["oreb"]), 0, 8)
        dreb = _clamp(rng.gauss(*profile["dreb"]), 0, 18)
        reb = oreb + dreb

        ast = _clamp(rng.gauss(*profile["ast"]), 0, 20)
        stl = _clamp(rng.gauss(*profile["stl"]), 0, 6)
        blk = _clamp(rng.gauss(*profile["blk"]), 0, 6)
        tov = _clamp(rng.gauss(*profile["tov"]), 0, 10)
        pf = _clamp(rng.gauss(*profile["pf"]), 0, 6)

        # Plus/minus correlates slightly with W/L
        pm_base = rng.gauss(*profile["plus_minus"])
        if game["wl"] == "W":
            pm = round(max(pm_base, pm_base + rng.uniform(0, 5)), 1)
        else:
            pm = round(min(pm_base, pm_base - rng.uniform(0, 5)), 1)

        logs.append({
            "nba_player_id": player_id,
            "game_id": game["game_id"],
            "game_date": game["game_date"],
            "season": season,
            "matchup": game["matchup"],
            "wl": game["wl"],
            "min": minutes,
            "pts": pts,
            "reb": reb,
            "ast": ast,
            "stl": stl,
            "blk": blk,
            "tov": tov,
            "fgm": fgm,
            "fga": fga,
            "fg_pct": round(fgm / fga, 3) if fga > 0 else 0.0,
            "fg3m": fg3m,
            "fg3a": fg3a,
            "fg3_pct": round(fg3m / fg3a, 3) if fg3a > 0 else 0.0,
            "ftm": ftm,
            "fta": fta,
            "ft_pct": round(ftm / fta, 3) if fta > 0 else 0.0,
            "oreb": oreb,
            "dreb": dreb,
            "pf": pf,
            "plus_minus": pm,
        })

    return logs


# ============================================================
# Upsert Helpers
# ============================================================


def batch_upsert(table: str, rows: list[dict], conflict: str, batch_size: int):
    """Upsert rows in batches to avoid payload limits."""
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        result = supabase.table(table).upsert(batch, on_conflict=conflict).execute()
        total += len(result.data)
    return total


# ============================================================
# Clean
# ============================================================


def clean_seed_data():
    """Delete all seed player data (children first, then players)."""
    logger.info("Cleaning existing seed data...")
    tables_with_fk = [
        "shot_chart_data",
        "game_logs",
        "player_advanced_stats",
        "player_season_stats",
    ]
    for table in tables_with_fk:
        result = (
            supabase.table(table)
            .delete()
            .in_("nba_player_id", SEED_PLAYER_IDS)
            .execute()
        )
        count = len(result.data) if result.data else 0
        logger.info(f"  Deleted {count} rows from {table}")

    result = (
        supabase.table("players")
        .delete()
        .in_("nba_player_id", SEED_PLAYER_IDS)
        .execute()
    )
    count = len(result.data) if result.data else 0
    logger.info(f"  Deleted {count} rows from players")


# ============================================================
# Main
# ============================================================


def main():
    parser = argparse.ArgumentParser(description="Seed CourtIQ with mock data")
    parser.add_argument("--clean", action="store_true", help="Delete existing seed data before inserting")
    parser.add_argument("--season", default=None, help="Season string (default: auto-detect)")
    args = parser.parse_args()

    season = args.season or get_current_season()
    now_iso = datetime.now(timezone.utc).isoformat()

    logger.info(f"=== seed_mock_data.py — Season: {season} ===")

    # --clean
    if args.clean:
        clean_seed_data()

    # 1. Players
    logger.info("Seeding players...")
    player_rows = []
    for p in PLAYERS:
        row = {
            **p,
            "slug": make_slug(p["full_name"]),
            "headshot_url": get_headshot_url(p["nba_player_id"]),
            "is_active": True,
            "tier": 1,
            "last_fetched": now_iso,
        }
        player_rows.append(row)

    count = batch_upsert("players", player_rows, "nba_player_id", BATCH_SIZE_SMALL)
    logger.info(f"  Upserted {count} players")

    # 2. Season Stats
    logger.info("Seeding season stats...")
    stats = get_season_stats(season)
    count = batch_upsert("player_season_stats", stats, "nba_player_id,season,season_type", BATCH_SIZE_SMALL)
    logger.info(f"  Upserted {count} season stat rows")

    # 3. Advanced Stats
    logger.info("Seeding advanced stats...")
    adv = get_advanced_stats(season)
    count = batch_upsert("player_advanced_stats", adv, "nba_player_id,season,season_type", BATCH_SIZE_SMALL)
    logger.info(f"  Upserted {count} advanced stat rows")

    # 4. Shot Charts + 5. Game Logs
    total_shots = 0
    total_games = 0

    for p in PLAYERS:
        pid = p["nba_player_id"]
        name = p["full_name"]
        team = p["team_abbr"]

        logger.info(f"Generating data for {name}...")

        # Generate game schedule (40 games)
        games = generate_game_schedule(team, 40, pid)

        # Shots
        shots = generate_shots_for_player(pid, season, games)
        sc = batch_upsert(
            "shot_chart_data",
            shots,
            "nba_player_id,game_id,loc_x,loc_y,period,minutes_remaining,seconds_remaining",
            BATCH_SIZE_SHOTS,
        )
        total_shots += sc
        logger.info(f"  {name}: {sc} shots")

        # Game logs
        logs = generate_game_logs(pid, season, games)
        gc = batch_upsert("game_logs", logs, "nba_player_id,game_id", BATCH_SIZE_SMALL)
        total_games += gc
        logger.info(f"  {name}: {gc} game logs")

    # Summary
    logger.info("=" * 50)
    logger.info(f"Seed complete!")
    logger.info(f"  Players:        {len(PLAYERS)}")
    logger.info(f"  Season stats:   {len(stats)}")
    logger.info(f"  Advanced stats: {len(adv)}")
    logger.info(f"  Shots:          {total_shots}")
    logger.info(f"  Game logs:      {total_games}")
    logger.info("=" * 50)


if __name__ == "__main__":
    main()
