"""
CourtIQ — Fetch Season Stats Pipeline Script

For each Tier 1 player, fetches season-by-season per-game averages
from nba_api's PlayerCareerStats endpoint and upserts into the
player_season_stats table.

Stores the current season + previous 3 seasons (4 total).
Players with fewer than 4 seasons get however many they have.

Data source:
  - PlayerCareerStats (per_mode36='PerGame'): one call per player,
    returns every season of their career in a single response.
"""

from __future__ import annotations

import sys
import traceback
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from nba_api.stats.endpoints import PlayerCareerStats

sys.path.insert(0, sys.path[0])
from config import (
    logger,
    supabase,
    rate_limit,
    with_retry,
    get_seasons,
    log_refresh_start,
    log_refresh_complete,
    log_refresh_failed,
    CUSTOM_HEADERS,
    NBA_TIMEOUT,
)

JOB_NAME = "fetch_season_stats"
UPSERT_BATCH_SIZE = 50
NUM_SEASONS = 4  # Current + 3 prior


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
def fetch_career_stats(player_id: int) -> pd.DataFrame:
    """
    Fetch career per-game stats for a single player.
    Returns the SeasonTotalsRegularSeason DataFrame with one row per season.
    """
    rate_limit()
    ep = PlayerCareerStats(
        player_id=player_id,
        per_mode36="PerGame",
        headers=CUSTOM_HEADERS,
        timeout=NBA_TIMEOUT,
    )
    df = ep.get_data_frames()[0]  # SeasonTotalsRegularSeason
    return df


# ============================================================
# Data Transformation
# ============================================================

# Map nba_api column names -> our DB column names
# PlayerCareerStats PerGame columns -> player_season_stats columns
COLUMN_MAP = {
    "SEASON_ID": "season",
    "GP": "gp",
    "GS": "gs",
    "MIN": "min_pg",
    "PTS": "pts_pg",
    "REB": "reb_pg",
    "AST": "ast_pg",
    "STL": "stl_pg",
    "BLK": "blk_pg",
    "TOV": "tov_pg",
    "FGM": "fgm_pg",
    "FGA": "fga_pg",
    "FG_PCT": "fg_pct",
    "FG3M": "fg3m_pg",
    "FG3A": "fg3a_pg",
    "FG3_PCT": "fg3_pct",
    "FTM": "ftm_pg",
    "FTA": "fta_pg",
    "FT_PCT": "ft_pct",
    "OREB": "oreb_pg",
    "DREB": "dreb_pg",
    "PF": "pf_pg",
}

# Columns that are percentages (0-1 scale, stored as NUMERIC(5,3))
PCT_COLUMNS = {"fg_pct", "fg3_pct", "ft_pct"}

# Columns that are integers in our schema
INT_COLUMNS = {"gp", "gs"}


def transform_season_row(
    nba_player_id: int,
    row: pd.Series,
    now: str,
) -> dict:
    """Transform a single season row from nba_api format to our DB format."""
    record = {
        "nba_player_id": nba_player_id,
        "season_type": "Regular Season",
        "last_updated": now,
    }

    for nba_col, db_col in COLUMN_MAP.items():
        value = row.get(nba_col)
        if db_col == "season":
            record[db_col] = str(value) if pd.notna(value) else None
        elif db_col in INT_COLUMNS:
            record[db_col] = safe_int(value)
        elif db_col in PCT_COLUMNS:
            record[db_col] = safe_float(value)
        else:
            record[db_col] = safe_float(value)

    # PlayerCareerStats doesn't include plus_minus, set to None
    record["plus_minus"] = None

    return record


def extract_player_seasons(
    nba_player_id: int,
    career_df: pd.DataFrame,
    target_seasons: set[str],
    now: str,
) -> list[dict]:
    """
    Filter a player's career DataFrame to target seasons and transform rows.
    Returns list of records for upsert. Gracefully returns fewer than 4
    seasons if the player hasn't been in the league that long.
    """
    if career_df.empty:
        return []

    records = []
    for _, row in career_df.iterrows():
        season_id = str(row.get("SEASON_ID", ""))
        if season_id in target_seasons:
            record = transform_season_row(nba_player_id, row, now)
            if record.get("season"):
                records.append(record)

    return records


# ============================================================
# Supabase Upsert
# ============================================================


def upsert_season_stats(records: list[dict]) -> int:
    """
    Upsert season stat records in batches.
    Conflict key: (nba_player_id, season, season_type).
    """
    total = len(records)
    upserted = 0

    for i in range(0, total, UPSERT_BATCH_SIZE):
        batch = records[i : i + UPSERT_BATCH_SIZE]
        try:
            supabase.table("player_season_stats").upsert(
                batch, on_conflict="nba_player_id,season,season_type"
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
    target_seasons = get_seasons(NUM_SEASONS)
    target_season_set = set(target_seasons)
    logger.info(
        f"=== fetch_season_stats.py — Seasons: {', '.join(target_seasons)} ==="
    )

    log_id = log_refresh_start(JOB_NAME)

    try:
        # Step 1: Get Tier 1 players from DB
        players = get_tier1_players()
        if not players:
            raise ValueError("No Tier 1 players found in database")

        # Step 2: Fetch career stats for each player
        now = datetime.now(timezone.utc).isoformat()
        all_records: list[dict] = []
        players_processed = 0
        players_failed = 0

        for i, player in enumerate(players):
            player_id = player["nba_player_id"]
            player_name = player["full_name"]

            try:
                career_df = fetch_career_stats(player_id)
                records = extract_player_seasons(
                    player_id, career_df, target_season_set, now
                )
                all_records.extend(records)
                players_processed += 1

                if (i + 1) % 25 == 0 or (i + 1) == len(players):
                    logger.info(
                        f"  Progress: {i + 1}/{len(players)} players fetched "
                        f"({len(all_records)} season records so far)"
                    )

            except Exception as e:
                players_failed += 1
                logger.error(
                    f"  Failed to fetch stats for {player_name} "
                    f"(id={player_id}): {e}"
                )
                continue

        logger.info(
            f"Fetched {len(all_records)} season records from "
            f"{players_processed} players ({players_failed} failed)"
        )

        # Step 3: Upsert all records
        if all_records:
            upserted = upsert_season_stats(all_records)
            logger.info(f"Upserted {upserted} season stat records")
        else:
            upserted = 0
            logger.warning("No season stat records to upsert")

        # Step 4: Log success
        log_refresh_complete(log_id, JOB_NAME, players_processed)
        logger.info(f"=== fetch_season_stats.py complete ===")

    except Exception as e:
        log_refresh_failed(log_id, JOB_NAME, traceback.format_exc())
        logger.error(f"=== fetch_season_stats.py FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
