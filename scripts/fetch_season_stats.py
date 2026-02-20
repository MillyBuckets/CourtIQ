"""
CourtIQ — Fetch Season Stats Pipeline Script

Fetches season-by-season per-game averages for Tier 1 players using the
bulk LeagueDashPlayerStats endpoint and upserts into the player_season_stats table.

Stores the current season + previous 3 seasons (4 total).

Approach: Uses bulk league-wide endpoint (one API call per season) instead
of per-player calls. For 4 seasons that's only 4 API calls total vs ~600
per-player calls — dramatically faster and more reliable.

Data source:
  - LeagueDashPlayerStats (per_mode_detailed='PerGame', measure_type='Base'):
    one call per season, returns all ~500 players in a single response.
"""

from __future__ import annotations

import sys
import traceback
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from nba_api.stats.endpoints import LeagueDashPlayerStats

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
def fetch_league_stats_bulk(season: str) -> pd.DataFrame:
    """
    Fetch LeagueDashPlayerStats with measure_type='Base' PerGame for ALL players.
    Returns one row per player with per-game averages.
    """
    logger.info(f"  Fetching LeagueDashPlayerStats (PerGame) for {season}...")
    rate_limit()
    ep = LeagueDashPlayerStats(
        season=season,
        season_type_all_star="Regular Season",
        measure_type_detailed_defense="Base",
        per_mode_detailed="PerGame",
        headers=CUSTOM_HEADERS,
        timeout=NBA_TIMEOUT,
    )
    df = ep.get_data_frames()[0]
    logger.info(f"    Returned {len(df)} players")
    return df


# ============================================================
# Data Transformation
# ============================================================

# Map LeagueDashPlayerStats columns -> our DB columns
COLUMN_MAP = {
    "GP": "gp",
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
    "PLUS_MINUS": "plus_minus",
}

# Columns that are percentages (0-1 scale, stored as NUMERIC(5,3))
PCT_COLUMNS = {"fg_pct", "fg3_pct", "ft_pct"}

# Columns that are integers in our schema
INT_COLUMNS = {"gp", "gs"}


def build_season_records(
    df: pd.DataFrame,
    tier1_ids: set[int],
    season: str,
    now: str,
) -> list[dict]:
    """
    Filter bulk DataFrame to Tier 1 players and build record dicts for upsert.
    """
    if df.empty:
        return []

    # Filter to Tier 1 players only
    filtered = df[df["PLAYER_ID"].isin(tier1_ids)]

    if filtered.empty:
        return []

    records = []
    for _, row in filtered.iterrows():
        record = {
            "nba_player_id": int(row["PLAYER_ID"]),
            "season": season,
            "season_type": "Regular Season",
            "last_updated": now,
        }

        for nba_col, db_col in COLUMN_MAP.items():
            value = row.get(nba_col)
            if db_col in INT_COLUMNS:
                record[db_col] = safe_int(value)
            elif db_col in PCT_COLUMNS:
                record[db_col] = safe_float(value)
            else:
                record[db_col] = safe_float(value)

        # GS (games started) — available from LeagueDashPlayerStats but not
        # guaranteed across all seasons. Check if column exists.
        if "GS" in row.index:
            record["gs"] = safe_int(row.get("GS"))
        else:
            record["gs"] = None

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
    logger.info(
        f"=== fetch_season_stats.py — Seasons: {', '.join(target_seasons)} ==="
    )

    log_id = log_refresh_start(JOB_NAME)

    try:
        # Step 1: Get Tier 1 player IDs from DB
        tier1_ids = get_tier1_player_ids()
        if not tier1_ids:
            raise ValueError("No Tier 1 players found in database")

        now = datetime.now(timezone.utc).isoformat()
        all_records: list[dict] = []
        seasons_processed = 0

        # Step 2: For each season, make 1 bulk API call
        for season in target_seasons:
            logger.info(f"--- Season {season} ---")
            try:
                df = fetch_league_stats_bulk(season)

                if df.empty:
                    logger.warning(f"  No data for {season}, skipping")
                    continue

                records = build_season_records(df, tier1_ids, season, now)
                logger.info(f"  Built {len(records)} Tier 1 records for {season}")
                all_records.extend(records)
                seasons_processed += 1

            except Exception as e:
                logger.error(f"  Failed to process season {season}: {e}")
                continue

        logger.info(
            f"Processed {seasons_processed}/{len(target_seasons)} seasons, "
            f"{len(all_records)} total records"
        )

        # Step 3: Upsert all records
        if all_records:
            upserted = upsert_season_stats(all_records)
            logger.info(f"Upserted {upserted} season stat records")
        else:
            upserted = 0
            logger.warning("No season stat records to upsert")

        # Step 4: Log success
        players_updated = len({r["nba_player_id"] for r in all_records})
        log_refresh_complete(log_id, JOB_NAME, players_updated)
        logger.info("=== fetch_season_stats.py complete ===")

    except Exception as e:
        log_refresh_failed(log_id, JOB_NAME, traceback.format_exc())
        logger.error("=== fetch_season_stats.py FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
