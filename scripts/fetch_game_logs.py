"""
CourtIQ — Fetch Game Logs Pipeline Script

For each Tier 1 player, fetches per-game box scores for the current
season from nba_api's PlayerGameLog endpoint and upserts into the
game_logs table.

Each call to PlayerGameLog returns every game the player has played
in the given season (one row per game). This script is idempotent:
re-running it updates existing rows and inserts new ones.

Data source:
  - PlayerGameLog (season, season_type_all_star='Regular Season'):
    one call per player, returns full box score per game.
"""

from __future__ import annotations

import sys
import traceback
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from nba_api.stats.endpoints import PlayerGameLog

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


def get_tier1_players() -> list[dict]:
    """Fetch all active Tier 1 players from Supabase."""
    result = (
        supabase.table("players")
        .select("nba_player_id, full_name")
        .eq("is_active", True)
        .eq("tier", 1)
        .execute()
    )
    players = result.data
    logger.info(f"Found {len(players)} active Tier 1 players in database")
    return players


@with_retry(max_retries=3, base_delay=10.0)
def fetch_player_game_log(player_id: int, season: str) -> pd.DataFrame:
    """
    Fetch game logs for a single player for the given season.
    Returns a DataFrame with one row per game played.
    """
    rate_limit()
    ep = PlayerGameLog(
        player_id=player_id,
        season=season,
        season_type_all_star="Regular Season",
        headers=CUSTOM_HEADERS,
        timeout=NBA_TIMEOUT,
    )
    df = ep.get_data_frames()[0]
    return df


# ============================================================
# Data Transformation
# ============================================================

# Map nba_api column names -> our DB column names
# PlayerGameLog columns -> game_logs columns
COLUMN_MAP = {
    "Game_ID": "game_id",
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
    nba_api returns dates like 'MAR 15, 2026' or '2026-03-15'.
    """
    if not raw_date:
        return None

    # Already in ISO format
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


def transform_game_row(
    nba_player_id: int,
    season: str,
    row: pd.Series,
) -> dict:
    """Transform a single game row from nba_api format to our DB format."""
    record = {
        "nba_player_id": nba_player_id,
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

    return record


def extract_player_games(
    nba_player_id: int,
    season: str,
    game_log_df: pd.DataFrame,
) -> list[dict]:
    """
    Transform all game rows for a player.
    Returns empty list if the player has no games (injured, new, etc.).
    """
    if game_log_df.empty:
        return []

    records = []
    for _, row in game_log_df.iterrows():
        record = transform_game_row(nba_player_id, season, row)
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
        # Step 1: Get Tier 1 players from DB
        players = get_tier1_players()
        if not players:
            raise ValueError("No Tier 1 players found in database")

        # Step 2: Fetch game logs for each player
        all_records: list[dict] = []
        players_processed = 0
        players_skipped = 0
        players_failed = 0

        for i, player in enumerate(players):
            player_id = player["nba_player_id"]
            player_name = player["full_name"]

            try:
                game_log_df = fetch_player_game_log(player_id, season)
                records = extract_player_games(player_id, season, game_log_df)

                if records:
                    all_records.extend(records)
                    players_processed += 1
                else:
                    # Player has no games this season (injured, new, etc.)
                    players_skipped += 1
                    logger.debug(
                        f"  No game logs for {player_name} (id={player_id})"
                    )

                if (i + 1) % 25 == 0 or (i + 1) == len(players):
                    logger.info(
                        f"  Progress: {i + 1}/{len(players)} players fetched "
                        f"({len(all_records)} game records so far)"
                    )

            except Exception as e:
                players_failed += 1
                logger.error(
                    f"  Failed to fetch game logs for {player_name} "
                    f"(id={player_id}): {e}"
                )
                continue

        logger.info(
            f"Fetched {len(all_records)} game records from "
            f"{players_processed} players "
            f"({players_skipped} skipped, {players_failed} failed)"
        )

        # Step 3: Upsert all records
        if all_records:
            upserted = upsert_game_logs(all_records)
            logger.info(f"Upserted {upserted} game log records")
        else:
            upserted = 0
            logger.warning("No game log records to upsert")

        # Step 4: Log success
        log_refresh_complete(log_id, JOB_NAME, players_processed)
        logger.info(f"=== fetch_game_logs.py complete ===")

    except Exception as e:
        log_refresh_failed(log_id, JOB_NAME, traceback.format_exc())
        logger.error(f"=== fetch_game_logs.py FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
