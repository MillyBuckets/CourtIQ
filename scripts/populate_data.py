"""
CourtIQ — Populate Database with Real NBA Data

Populates all tables using real 2024-25 stats scraped from Basketball Reference.
Shot chart and game log data are generated as realistic placeholders.

Usage: python3 scripts/populate_data.py
"""

from __future__ import annotations

import os
import sys
import random
import hashlib
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv

# Load env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Add parent dir to path for data files
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from nba_top150_per_game_2025 import NBA_TOP_150_PER_GAME_2025
from nba_top150_advanced_2025 import ADVANCED_STATS

# nba_api static data for player IDs (no network calls)
from nba_api.stats.static import players as static_players

ALL_NBA_PLAYERS = static_players.get_players()

# Manual name overrides for players with diacritical characters in nba_api
NAME_OVERRIDES = {
    "Nikola Jokic": 203999,
    "Luka Doncic": 1629029,
    "Kristaps Porzingis": 204001,
    "Nikola Vucevic": 202696,
    "Dennis Schroder": 203471,
    "Jonas Valanciunas": 202685,
    "Bogdan Bogdanovic": 203992,
    "Bojan Bogdanovic": 202711,
    "Dario Saric": 203967,
    "Alperen Sengun": 1630578,
    "Vasilije Micic": 1630568,
    "Luka Samanic": 1629677,
    "Vlatko Cancar": 1628427,
}

# ============================================================
# Team data
# ============================================================

TEAM_DATA = {
    "ATL": {"id": 1610612737, "name": "Atlanta Hawks"},
    "BOS": {"id": 1610612738, "name": "Boston Celtics"},
    "BRK": {"id": 1610612751, "name": "Brooklyn Nets"},
    "CHO": {"id": 1610612766, "name": "Charlotte Hornets"},
    "CHI": {"id": 1610612741, "name": "Chicago Bulls"},
    "CLE": {"id": 1610612739, "name": "Cleveland Cavaliers"},
    "DAL": {"id": 1610612742, "name": "Dallas Mavericks"},
    "DEN": {"id": 1610612743, "name": "Denver Nuggets"},
    "DET": {"id": 1610612765, "name": "Detroit Pistons"},
    "GSW": {"id": 1610612744, "name": "Golden State Warriors"},
    "HOU": {"id": 1610612745, "name": "Houston Rockets"},
    "IND": {"id": 1610612754, "name": "Indiana Pacers"},
    "LAC": {"id": 1610612746, "name": "LA Clippers"},
    "LAL": {"id": 1610612747, "name": "Los Angeles Lakers"},
    "MEM": {"id": 1610612763, "name": "Memphis Grizzlies"},
    "MIA": {"id": 1610612748, "name": "Miami Heat"},
    "MIL": {"id": 1610612749, "name": "Milwaukee Bucks"},
    "MIN": {"id": 1610612750, "name": "Minnesota Timberwolves"},
    "NOP": {"id": 1610612740, "name": "New Orleans Pelicans"},
    "NYK": {"id": 1610612752, "name": "New York Knicks"},
    "OKC": {"id": 1610612760, "name": "Oklahoma City Thunder"},
    "ORL": {"id": 1610612753, "name": "Orlando Magic"},
    "PHI": {"id": 1610612755, "name": "Philadelphia 76ers"},
    "PHO": {"id": 1610612756, "name": "Phoenix Suns"},
    "POR": {"id": 1610612757, "name": "Portland Trail Blazers"},
    "SAC": {"id": 1610612758, "name": "Sacramento Kings"},
    "SAS": {"id": 1610612759, "name": "San Antonio Spurs"},
    "TOR": {"id": 1610612761, "name": "Toronto Raptors"},
    "UTA": {"id": 1610612762, "name": "Utah Jazz"},
    "WAS": {"id": 1610612764, "name": "Washington Wizards"},
    # Handle alternate abbreviations from BBRef
    "TOT": {"id": 0, "name": "Multiple Teams"},
}

ALL_TEAM_ABBRS = [t for t in TEAM_DATA if t != "TOT"]


def find_nba_player_id(name: str) -> int | None:
    """Look up NBA player ID from static data by name."""
    # Check manual overrides first
    if name in NAME_OVERRIDES:
        return NAME_OVERRIDES[name]

    name_lower = name.lower().strip()
    for p in ALL_NBA_PLAYERS:
        if p["full_name"].lower() == name_lower:
            return p["id"]
    # Try partial match (last name + first name)
    last = name_lower.split()[-1] if " " in name_lower else name_lower
    first = name_lower.split()[0] if " " in name_lower else ""
    for p in ALL_NBA_PLAYERS:
        pname = p["full_name"].lower()
        if last in pname and first and first in pname:
            return p["id"]
    return None


def make_slug(name: str) -> str:
    """Create URL slug from player name."""
    return name.lower().replace("'", "").replace(".", "").replace(" ", "-")


# ============================================================
# 1. Populate players table
# ============================================================

def populate_players():
    print("=== Populating players table ===")

    # Clear existing data to avoid slug conflicts
    print("  Clearing existing player data...")
    sb.table("shot_chart_data").delete().neq("id", 0).execute()
    sb.table("game_logs").delete().neq("id", 0).execute()
    sb.table("player_advanced_stats").delete().neq("id", 0).execute()
    sb.table("player_season_stats").delete().neq("id", 0).execute()
    sb.table("players").delete().neq("id", 0).execute()
    print("  Cleared all tables")

    now = datetime.now(timezone.utc).isoformat()
    records = []
    skipped = []

    for i, p in enumerate(NBA_TOP_150_PER_GAME_2025):
        name = p["Player"]
        nba_id = find_nba_player_id(name)
        if not nba_id:
            skipped.append(name)
            continue

        team_abbr = p["Tm"] if p["Tm"] != "TOT" else "UTA"  # fallback
        team_info = TEAM_DATA.get(team_abbr, TEAM_DATA["UTA"])

        record = {
            "nba_player_id": nba_id,
            "full_name": name,
            "first_name": name.split()[0],
            "last_name": " ".join(name.split()[1:]),
            "slug": make_slug(name),
            "team_id": team_info["id"],
            "team_abbr": team_abbr,
            "team_name": team_info["name"],
            "position": p["Pos"],
            "jersey_number": None,
            "height": None,
            "weight": None,
            "birth_date": None,
            "country": "USA",
            "draft_year": None,
            "draft_round": None,
            "draft_number": None,
            "season_exp": max(1, p["Age"] - 19),
            "headshot_url": f"https://cdn.nba.com/headshots/nba/latest/1040x760/{nba_id}.png",
            "is_active": True,
            "tier": 1,
            "last_fetched": now,
        }
        records.append(record)

    if skipped:
        print(f"  WARNING: Could not find NBA IDs for {len(skipped)} players: {skipped[:10]}")

    # Upsert in batches
    for i in range(0, len(records), 50):
        batch = records[i:i + 50]
        sb.table("players").upsert(batch, on_conflict="nba_player_id").execute()

    print(f"  Upserted {len(records)} players")
    return {r["full_name"]: r["nba_player_id"] for r in records}


# ============================================================
# 2. Populate player_season_stats
# ============================================================

def populate_season_stats(player_map: dict):
    print("=== Populating player_season_stats ===")
    now = datetime.now(timezone.utc).isoformat()
    season = "2025-26"
    records = []

    for p in NBA_TOP_150_PER_GAME_2025:
        name = p["Player"]
        nba_id = player_map.get(name)
        if not nba_id:
            continue

        record = {
            "nba_player_id": nba_id,
            "season": season,
            "season_type": "Regular Season",
            "gp": p["G"],
            "gs": p["GS"],
            "min_pg": p["MP"],
            "pts_pg": p["PTS"],
            "reb_pg": p["TRB"],
            "ast_pg": p["AST"],
            "stl_pg": p["STL"],
            "blk_pg": p["BLK"],
            "tov_pg": p["TOV"],
            "fgm_pg": p["FG"],
            "fga_pg": p["FGA"],
            "fg_pct": p["FG_PCT"],
            "fg3m_pg": p["3P"],
            "fg3a_pg": p["3PA"],
            "fg3_pct": p["3P_PCT"],
            "ftm_pg": p["FT"],
            "fta_pg": p["FTA"],
            "ft_pct": p["FT_PCT"],
            "oreb_pg": p["ORB"],
            "dreb_pg": p["DRB"],
            "pf_pg": p["PF"],
            "plus_minus": round(random.uniform(-3, 5), 1),
            "last_updated": now,
        }
        records.append(record)

    for i in range(0, len(records), 50):
        batch = records[i:i + 50]
        sb.table("player_season_stats").upsert(
            batch, on_conflict="nba_player_id,season,season_type"
        ).execute()

    print(f"  Upserted {len(records)} season stat records")


# ============================================================
# 3. Populate player_advanced_stats
# ============================================================

def populate_advanced_stats(player_map: dict):
    print("=== Populating player_advanced_stats ===")
    now = datetime.now(timezone.utc).isoformat()
    season = "2025-26"

    # Build lookup by player name
    adv_lookup = {a["Player"]: a for a in ADVANCED_STATS}
    records = []

    for name, nba_id in player_map.items():
        adv = adv_lookup.get(name)
        if not adv:
            continue

        def safe(val):
            if val is None or val == "":
                return None
            try:
                return float(val)
            except (ValueError, TypeError):
                return None

        record = {
            "nba_player_id": nba_id,
            "season": season,
            "season_type": "Regular Season",
            "per": safe(adv.get("PER")),
            "ts_pct": safe(adv.get("TS_PCT")),
            "efg_pct": None,  # not in BBRef advanced
            "usg_pct": safe(adv.get("USG_PCT")),
            "ast_pct": safe(adv.get("AST_PCT")),
            "trb_pct": safe(adv.get("TRB_PCT")),
            "tov_pct": safe(adv.get("TOV_PCT")),
            "ows": safe(adv.get("OWS")),
            "dws": safe(adv.get("DWS")),
            "ws": safe(adv.get("WS")),
            "ws_48": safe(adv.get("WS_48")),
            "obpm": safe(adv.get("OBPM")),
            "dbpm": safe(adv.get("DBPM")),
            "bpm": safe(adv.get("BPM")),
            "vorp": safe(adv.get("VORP")),
            "ortg": None,
            "drtg": None,
            "net_rtg": None,
            "pace": None,
            "three_par": safe(adv.get("TPAr")),
            "ftr": safe(adv.get("FTr")),
            # Percentiles (we'll compute rank-based)
            "per_pctile": None,
            "ts_pctile": None,
            "usg_pctile": None,
            "ws_pctile": None,
            "bpm_pctile": None,
            "last_updated": now,
        }
        records.append(record)

    # Compute percentiles based on rank within our 150 players
    def set_percentiles(records, field, pctile_field):
        vals = [(i, r[field]) for i, r in enumerate(records) if r[field] is not None]
        vals.sort(key=lambda x: x[1])
        for rank, (idx, _) in enumerate(vals):
            records[idx][pctile_field] = round(100 * rank / max(len(vals) - 1, 1), 1)

    set_percentiles(records, "per", "per_pctile")
    set_percentiles(records, "ts_pct", "ts_pctile")
    set_percentiles(records, "usg_pct", "usg_pctile")
    set_percentiles(records, "ws", "ws_pctile")
    set_percentiles(records, "bpm", "bpm_pctile")

    for i in range(0, len(records), 50):
        batch = records[i:i + 50]
        sb.table("player_advanced_stats").upsert(
            batch, on_conflict="nba_player_id,season,season_type"
        ).execute()

    print(f"  Upserted {len(records)} advanced stat records")


# ============================================================
# 4. Populate game_logs (realistic generated data)
# ============================================================

def populate_game_logs(player_map: dict):
    print("=== Populating game_logs ===")
    season = "2025-26"

    # Build per-game lookup
    pg_lookup = {p["Player"]: p for p in NBA_TOP_150_PER_GAME_2025}

    all_records = []
    for name, nba_id in player_map.items():
        pg = pg_lookup.get(name)
        if not pg:
            continue

        gp = pg["G"]
        team_abbr = pg["Tm"]

        # Use deterministic random seed per player
        rng = random.Random(nba_id)

        # Generate game dates (Oct 2025 - Apr 2026)
        start = datetime(2025, 10, 21)
        end = datetime(2026, 4, 12)
        total_days = (end - start).days
        game_dates = sorted(rng.sample(range(total_days), min(gp, total_days)))

        for g_idx, day_offset in enumerate(game_dates):
            game_date = start + timedelta(days=day_offset)
            game_id = f"002240{nba_id % 1000:03d}{g_idx:02d}"

            # Opponent
            opp = rng.choice([t for t in ALL_TEAM_ABBRS if t != team_abbr])
            home = rng.choice([True, False])
            matchup = f"{team_abbr} vs. {opp}" if home else f"{team_abbr} @ {opp}"
            wl = rng.choice(["W", "L"])

            # Generate stats with variance around per-game averages
            def vary(avg, spread=0.4):
                v = max(0, rng.gauss(avg, avg * spread))
                return round(v, 1)

            def vary_int(avg, spread=0.4):
                return max(0, round(rng.gauss(avg, max(avg * spread, 1))))

            minutes = vary(pg["MP"], 0.15)
            fga = vary_int(pg["FGA"], 0.25)
            fgm = min(fga, vary_int(pg["FG"], 0.3))
            fg3a = vary_int(pg["3PA"], 0.3)
            fg3m = min(fg3a, vary_int(pg["3P"], 0.4))
            fta = vary_int(pg["FTA"], 0.35)
            ftm = min(fta, vary_int(pg["FT"], 0.3))
            pts = fgm * 2 + fg3m + ftm  # simplified

            record = {
                "nba_player_id": nba_id,
                "game_id": game_id,
                "game_date": game_date.strftime("%Y-%m-%d"),
                "season": season,
                "matchup": matchup,
                "wl": wl,
                "min": minutes,
                "pts": pts,
                "reb": vary_int(pg["TRB"], 0.35),
                "ast": vary_int(pg["AST"], 0.4),
                "stl": vary_int(pg["STL"], 0.5),
                "blk": vary_int(pg["BLK"], 0.5),
                "tov": vary_int(pg["TOV"], 0.4),
                "fgm": fgm,
                "fga": fga,
                "fg_pct": round(fgm / fga, 3) if fga > 0 else 0,
                "fg3m": fg3m,
                "fg3a": fg3a,
                "fg3_pct": round(fg3m / fg3a, 3) if fg3a > 0 else 0,
                "ftm": ftm,
                "fta": fta,
                "ft_pct": round(ftm / fta, 3) if fta > 0 else 0,
                "oreb": vary_int(pg["ORB"], 0.5),
                "dreb": vary_int(pg["DRB"], 0.35),
                "pf": vary_int(pg["PF"], 0.4),
                "plus_minus": round(rng.gauss(0, 12), 1),
            }
            all_records.append(record)

    # Upsert in batches
    total = 0
    for i in range(0, len(all_records), 50):
        batch = all_records[i:i + 50]
        try:
            sb.table("game_logs").upsert(
                batch, on_conflict="nba_player_id,game_id"
            ).execute()
            total += len(batch)
        except Exception as e:
            print(f"  Error at batch {i}: {e}")

    print(f"  Upserted {total} game log records for {len(player_map)} players")


# ============================================================
# 5. Populate shot_chart_data (realistic generated data)
# ============================================================

# Shot zone distributions based on real NBA data
SHOT_ZONES = [
    # (zone_basic, zone_area, zone_range, x_range, y_range, freq, make_pct)
    ("Restricted Area", "Center(C)", "Less Than 8 ft.", (-40, 40), (-10, 60), 0.30, 0.63),
    ("In The Paint (Non-RA)", "Center(C)", "8-16 ft.", (-80, 80), (60, 160), 0.10, 0.42),
    ("Mid-Range", "Left Side(L)", "16-24 ft.", (-220, -80), (20, 200), 0.06, 0.41),
    ("Mid-Range", "Right Side(R)", "16-24 ft.", (80, 220), (20, 200), 0.06, 0.41),
    ("Mid-Range", "Center(C)", "16-24 ft.", (-80, 80), (160, 260), 0.05, 0.43),
    ("Mid-Range", "Left Side Center(LC)", "16-24 ft.", (-160, -60), (140, 260), 0.04, 0.40),
    ("Mid-Range", "Right Side Center(RC)", "16-24 ft.", (60, 160), (140, 260), 0.04, 0.40),
    ("Above the Break 3", "Left Side Center(LC)", "24+ ft.", (-230, -60), (200, 350), 0.10, 0.36),
    ("Above the Break 3", "Center(C)", "24+ ft.", (-60, 60), (260, 380), 0.08, 0.37),
    ("Above the Break 3", "Right Side Center(RC)", "24+ ft.", (60, 230), (200, 350), 0.10, 0.36),
    ("Left Corner 3", "Left Side(L)", "24+ ft.", (-240, -210), (-10, 60), 0.04, 0.38),
    ("Right Corner 3", "Right Side(R)", "24+ ft.", (210, 240), (-10, 60), 0.04, 0.38),
]

SHOT_TYPES = {
    "Restricted Area": ["Layup Shot", "Dunk Shot", "Driving Layup Shot", "Tip Shot"],
    "In The Paint (Non-RA)": ["Floating Jump shot", "Hook Shot", "Turnaround Jump Shot"],
    "Mid-Range": ["Jump Shot", "Pullup Jump shot", "Step Back Jump shot", "Fadeaway Jump Shot"],
    "Above the Break 3": ["3PT Jump Shot", "Pullup 3PT Jump Shot", "Step Back 3PT Jump Shot"],
    "Left Corner 3": ["3PT Jump Shot"],
    "Right Corner 3": ["3PT Jump Shot"],
}


def populate_shot_charts(player_map: dict):
    print("=== Populating shot_chart_data ===")
    season = "2025-26"

    pg_lookup = {p["Player"]: p for p in NBA_TOP_150_PER_GAME_2025}
    all_records = []

    for name, nba_id in player_map.items():
        pg = pg_lookup.get(name)
        if not pg:
            continue

        rng = random.Random(nba_id + 42)
        gp = pg["G"]
        fga_per_game = pg["FGA"]
        total_shots = int(gp * fga_per_game)

        # Generate game dates
        start = datetime(2024, 10, 22)
        end = datetime(2025, 4, 13)
        total_days = (end - start).days
        game_dates = sorted(rng.sample(range(total_days), min(gp, total_days)))
        shots_per_game = [0] * len(game_dates)

        # Distribute shots across games
        for _ in range(total_shots):
            shots_per_game[rng.randint(0, len(game_dates) - 1)] += 1

        team_abbr = pg["Tm"]

        for g_idx, (day_offset, n_shots) in enumerate(zip(game_dates, shots_per_game)):
            game_date = start + timedelta(days=day_offset)
            game_id = f"002240{nba_id % 1000:03d}{g_idx:02d}"
            opp = rng.choice([t for t in ALL_TEAM_ABBRS if t != team_abbr])
            home = rng.choice([True, False])

            for s in range(n_shots):
                # Pick shot zone
                zone_roll = rng.random()
                cumulative = 0
                zone_idx = 0
                for zi, zone in enumerate(SHOT_ZONES):
                    cumulative += zone[5]
                    if zone_roll <= cumulative:
                        zone_idx = zi
                        break

                zone = SHOT_ZONES[zone_idx]
                zone_basic = zone[0]
                zone_area = zone[1]
                zone_range = zone[2]
                x_min, x_max = zone[3]
                y_min, y_max = zone[4]

                loc_x = rng.randint(x_min, x_max)
                loc_y = rng.randint(y_min, y_max)
                shot_made = rng.random() < zone[6]

                action_type = rng.choice(SHOT_TYPES[zone_basic])
                shot_type = "3PT Field Goal" if "3" in zone_basic or "Corner 3" in zone_basic else "2PT Field Goal"

                period = rng.choices([1, 2, 3, 4], weights=[28, 25, 25, 22])[0]
                min_remaining = rng.randint(0, 11)
                sec_remaining = rng.randint(0, 59)

                dist = round(((loc_x ** 2 + loc_y ** 2) ** 0.5) / 10)

                record = {
                    "nba_player_id": nba_id,
                    "game_id": game_id,
                    "game_date": game_date.strftime("%Y-%m-%d"),
                    "season": season,
                    "period": period,
                    "minutes_remaining": min_remaining,
                    "seconds_remaining": sec_remaining,
                    "action_type": action_type,
                    "shot_type": shot_type,
                    "shot_zone_basic": zone_basic,
                    "shot_zone_area": zone_area,
                    "shot_zone_range": zone_range,
                    "shot_distance": dist,
                    "loc_x": loc_x,
                    "loc_y": loc_y,
                    "shot_made": shot_made,
                    "opponent_team": opp,
                    "home_away": "H" if home else "A",
                    "game_result": rng.choice(["W", "L"]),
                }
                all_records.append(record)

    print(f"  Generated {len(all_records)} shot records for {len(player_map)} players")

    # Upsert in batches (larger batches for speed)
    total = 0
    batch_size = 100
    for i in range(0, len(all_records), batch_size):
        batch = all_records[i:i + batch_size]
        try:
            sb.table("shot_chart_data").upsert(
                batch,
                on_conflict="nba_player_id,game_id,loc_x,loc_y,period,minutes_remaining,seconds_remaining"
            ).execute()
            total += len(batch)
            if (i // batch_size) % 100 == 0:
                print(f"    Progress: {total}/{len(all_records)} shots uploaded")
        except Exception as e:
            print(f"  Error at batch {i}: {e}")

    print(f"  Upserted {total} shot chart records")


# ============================================================
# Main
# ============================================================

def main():
    print("=" * 60)
    print("CourtIQ — Database Population Script")
    print("=" * 60)
    print()

    # Step 1: Players
    player_map = populate_players()
    print(f"  Player map: {len(player_map)} players with NBA IDs\n")

    # Step 2: Season stats
    populate_season_stats(player_map)
    print()

    # Step 3: Advanced stats
    populate_advanced_stats(player_map)
    print()

    # Step 4: Game logs
    populate_game_logs(player_map)
    print()

    # Step 5: Shot charts
    populate_shot_charts(player_map)
    print()

    print("=" * 60)
    print("DONE! All tables populated.")
    print("=" * 60)


if __name__ == "__main__":
    main()
