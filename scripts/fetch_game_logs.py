"""
CourtIQ — Fetch Game Logs Pipeline Script

Fetches per-game box scores for all Tier 1 players using the bulk
PlayerGameLogs endpoint and upserts into the game_logs table.

Approach: Uses bulk PlayerGameLogs endpoint (one API call for the entire
season) instead of per-player calls. Returns every game for every player
in a single response — dramatically faster and more reliable than 150+
individual PlayerGameLog calls.

Data source:
  - PlayerGameLogs (season='Regular Season'): one call per season,
    returns full box score per game for every player.
"""

from __future__ import annotations

import sys
import traceback
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from nba_api.stats.endpoints import PlayerGameLogs

sys.path.insert(0, sys.path[0])
from config import (
    logger,
    supabase,
    rate_limit,
    with_retry,
    get_current_season,
    log_refresh_start,
    log_refresh_complete,
    log_refresh_failed,
    CUSTOM_HEADERS,
    NBA_TIMEOUT,
)

JOB_NAME = "fetch_game_logs"
UPSERT_BATCH_SIZE = 50


# ============================================================
# Helpers
# ============================================================


def safe_float(value) -> Optional[float]:
    """Convert to float, returning None for NaN/empty."""
    if pd.isna(value) or value == "" or value is None:
        return None
    try:
        return round(float(value), 3)
    except (ValueError, TypeError):
        return None


def safe_int(value) -> Optional[int]:
    """Convert to int, returning None for NaN/empty."""
    if pd.isna(value) or value == "" or value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def safe_str(value) -> Optional[str]:
    """Convert to string, returning None for NaN/empty."""
    if pd.isna(value) or value == "" or value is None:
        return None
    return str(value)


# ============================================================
# Data Fetching
# ============================================================


def get_tier1_player_ids() -> set[int]:
    """Fetch all active Tier 1 player IDs from Supabase."""
    result = (
        supabase.table("players")
        .select("nba_player_id")
        .eq("is_active", True)
        .eq("tier", 1)
        .execute()
    )
    ids = {row["nba_player_id"] for row in result.data}
    logger.info(f"Found {len(ids)} active Tier 1 players in database")
    return ids


@with_retry(max_retries=3, base_delay=10.0)
def fetch_all_game_logs(season: str) -> pd.DataFrame:
    """
    Fetch game logs for ALL players for the given season in a single API call.
    Returns a DataFrame with one row per player-game.
    """
    logger.info(f"  Fetching PlayerGameLogs (bulk) for {season}...")
    rate_limit()
    ep = PlayerGameLogs(
        season_nullable=season,
        season_type_nullable="Regular Season",
        headers=CUSTOM_HEADERS,
        timeout=NBA_TIMEOUT,
    )
    df = ep.get_data_frames()[0]
    logger.info(f"    Returned {len(df)} game log rows")
    return df


# ============================================================
# Data Transformation
# ============================================================

# Map nba_api column names -> our DB column names
COLUMN_MAP = {
    "GAME_ID": "game_id",
    "GAME_DATE": "game_date",
    "MATCHUP": "matchup",
    "WL": "wl",
    "MIN": "min",
    "PTS": "pts",
    "REB": "reb",
    "AST": "ast",
    "STL": "stl",
    "BLK": "blk",
    "TOV": "tov",
    "FGM": "fgm",
    "FGA": "fga",
    "FG_PCT": "fg_pct",
    "FG3M": "fg3m",
    "FG3A": "fg3a",
    "FG3_PCT": "fg3_pct",
    "FTM": "ftm",
    "FTA": "fta",
    "FT_PCT": "ft_pct",
    "OREB": "oreb",
    "DREB": "dreb",
    "PF": "pf",
    "PLUS_MINUS": "plus_minus",
}

# Columns stored as percentages (NUMERIC(5,3))
PCT_COLUMNS = {"fg_pct", "fg3_pct", "ft_pct"}

# Columns stored as strings
STR_COLUMNS = {"game_id", "game_date", "matchup", "wl"}

# Columns stored as integers
INT_COLUMNS = {
    "min", "pts", "reb", "ast", "stl", "blk", "tov",
    "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "pf",
}


def normalize_game_date(raw_date: str) -> Optional[str]:
    """
    Convert nba_api game date formats to YYYY-MM-DD.
    PlayerGameLogs returns dates like '2026-03-15T00:00:00' or '2026-03-15'.
    """
    if not raw_date:
        return None

    # Handle ISO datetime format (e.g. '2026-03-15T00:00:00')
    if "T" in raw_date:
        return raw_date.split("T")[0]

    # Already in ISO date format
    if len(raw_date) == 10 and raw_date[4] == "-":
        return raw_date

    # Try common nba_api format: 'MMM DD, YYYY'
    for fmt in ("%b %d, %Y", "%B %d, %Y"):
        try:
            dt = datetime.strptime(raw_date, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return raw_date  # Return as-is if unparseable


def build_game_log_records(
    df: pd.DataFrame,
    tier1_ids: set[int],
    season: str,
) -> list[dict]:
    """
    Filter bulk DataFrame to Tier 1 players and build record dicts for upsert.
    """
    if df.empty:
        return []

    # Filter to Tier 1 players only
    filtered = df[df["PLAYER_ID"].isin(tier1_ids)]

    if filtered.empty:
        logger.warning("  No game logs found for Tier 1 players")
        return []

    logger.info(f"  Filtering: {len(df)} total → {len(filtered)} Tier 1 game logs")

    records = []
    for _, row in filtered.iterrows():
        record = {
            "nba_player_id": int(row["PLAYER_ID"]),
            "season": season,
        }

        for nba_col, db_col in COLUMN_MAP.items():
            value = row.get(nba_col)

            if db_col == "game_date":
                record[db_col] = normalize_game_date(safe_str(value))
            elif db_col in STR_COLUMNS:
                record[db_col] = safe_str(value)
            elif db_col in PCT_COLUMNS:
                record[db_col] = safe_float(value)
            elif db_col in INT_COLUMNS:
                record[db_col] = safe_int(value)
            elif db_col == "plus_minus":
                record[db_col] = safe_int(value)
            else:
                record[db_col] = safe_float(value)

        # Only include rows that have a valid game_id
        if record.get("game_id"):
            records.append(record)

    return records


# ============================================================
# Supabase Upsert
# ============================================================


def upsert_game_logs(records: list[dict]) -> int:
    """
    Upsert game log records in batches.
    Conflict key: (nba_player_id, game_id).
    """
    total = len(records)
    upserted = 0

    for i in range(0, total, UPSERT_BATCH_SIZE):
        batch = records[i : i + UPSERT_BATCH_SIZE]
        try:
            supabase.table("game_logs").upsert(
                batch, on_conflict="nba_player_id,game_id"
            ).execute()
            upserted += len(batch)
        except Exception as e:
            logger.error(f"  Failed to upsert batch starting at index {i}: {e}")
            continue

    return upserted


# ============================================================
# Main
# ============================================================


def main():
    season = get_current_season()
    logger.info(f"=== fetch_game_logs.py — Season: {season} ===")

    log_id = log_refresh_start(JOB_NAME)

    try:
        # Step 1: Get Tier 1 player IDs from DB
        tier1_ids = get_tier1_player_ids()
        if not tier1_ids:
            raise ValueError("No Tier 1 players found in database")

        # Step 2: Fetch ALL game logs in a single bulk call
        game_log_df = fetch_all_game_logs(season)

        # Step 3: Filter to Tier 1 and transform
        records = build_game_log_records(game_log_df, tier1_ids, season)
        players_in_records = len({r["nba_player_id"] for r in records})
        logger.info(
            f"Built {len(records)} game log records for "
            f"{players_in_records} Tier 1 players"
        )

        # Step 4: Upsert all records
        if records:
            upserted = upsert_game_logs(records)
            logger.info(f"Upserted {upserted} game log records")
        else:
            upserted = 0
            logger.warning("No game log records to upsert")

        # Step 5: Log success
        log_refresh_complete(log_id, JOB_NAME, players_in_records)
        logger.info(f"=== fetch_game_logs.py complete ===")

    except Exception as e:
        log_refresh_failed(log_id, JOB_NAME, traceback.format_exc())
        logger.error(f"=== fetch_game_logs.py FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
