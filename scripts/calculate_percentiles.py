"""
CourtIQ — Calculate Percentiles Pipeline Script

Computes percentile ranks across all Tier 1 players for the current
season and updates the *_pctile columns in player_advanced_stats.

Recomputes ALL 5 percentile columns (per, ts, usg, ws, bpm) from
whatever data exists, overwriting any inline values from
fetch_advanced_stats.py for consistency.

For each stat, if fewer than 10 players have non-NULL values, the
percentile is skipped (left as NULL) and a warning is logged.

Percentile formula:
  percentile = (count of players with value < this player) / total * 100
  Rounded to nearest integer (0-100 scale).
"""

from __future__ import annotations

import sys
import traceback
from datetime import datetime, timezone

sys.path.insert(0, sys.path[0])
from config import (
    logger,
    supabase,
    get_current_season,
    log_refresh_start,
    log_refresh_complete,
    log_refresh_failed,
)

JOB_NAME = "calculate_percentiles"
MIN_PLAYERS_FOR_PERCENTILE = 10

# Maps the stat column in player_advanced_stats to its percentile column
STAT_TO_PCTILE = {
    "per": "per_pctile",
    "ts_pct": "ts_pctile",
    "usg_pct": "usg_pctile",
    "ws": "ws_pctile",
    "bpm": "bpm_pctile",
}


# ============================================================
# Data Fetching
# ============================================================


def get_tier1_advanced_stats(season: str) -> list[dict]:
    """
    Fetch advanced stats for all Tier 1 players for the given season.
    Returns list of dicts with nba_player_id + the 5 stat columns.
    """
    # First get all Tier 1 player IDs
    tier1_result = (
        supabase.table("players")
        .select("nba_player_id")
        .eq("is_active", True)
        .eq("tier", 1)
        .execute()
    )
    tier1_ids = [r["nba_player_id"] for r in tier1_result.data]

    if not tier1_ids:
        return []

    # Fetch advanced stats for these players
    stat_cols = ", ".join(
        ["nba_player_id"] + list(STAT_TO_PCTILE.keys())
    )
    result = (
        supabase.table("player_advanced_stats")
        .select(stat_cols)
        .eq("season", season)
        .in_("nba_player_id", tier1_ids)
        .execute()
    )

    logger.info(
        f"Found {len(result.data)} Tier 1 advanced stat rows for season {season}"
    )
    return result.data


# ============================================================
# Percentile Computation
# ============================================================


def compute_percentile_rank(value: float, all_values: list[float]) -> int:
    """
    Compute percentile rank: percentage of values strictly below.
    Returns integer 0-100.
    """
    below = sum(1 for v in all_values if v < value)
    return round((below / len(all_values)) * 100)


def compute_all_percentiles(
    rows: list[dict],
) -> dict[int, dict[str, int | None]]:
    """
    For each stat, compute percentile ranks across all qualifying players.

    Returns:
      { nba_player_id: { "per_pctile": 85, "ts_pctile": 72, ... }, ... }

    If fewer than MIN_PLAYERS_FOR_PERCENTILE have non-NULL values for
    a stat, that percentile is set to None for all players.
    """
    # Initialize result: every player starts with all percentiles as None
    player_ids = [r["nba_player_id"] for r in rows]
    results: dict[int, dict[str, int | None]] = {
        pid: {pctile_col: None for pctile_col in STAT_TO_PCTILE.values()}
        for pid in player_ids
    }

    for stat_col, pctile_col in STAT_TO_PCTILE.items():
        # Gather non-NULL values with their player IDs
        valid_entries = [
            (r["nba_player_id"], r[stat_col])
            for r in rows
            if r.get(stat_col) is not None
        ]

        if len(valid_entries) < MIN_PLAYERS_FOR_PERCENTILE:
            logger.warning(
                f"  {stat_col}: only {len(valid_entries)} non-NULL values "
                f"(need {MIN_PLAYERS_FOR_PERCENTILE}). Skipping percentile."
            )
            continue

        # Extract just the values for ranking
        all_values = [v for _, v in valid_entries]
        logger.info(
            f"  {stat_col}: computing percentiles for {len(valid_entries)} players"
        )

        # Compute percentile for each player with a non-NULL value
        for pid, value in valid_entries:
            results[pid][pctile_col] = compute_percentile_rank(value, all_values)

    return results


# ============================================================
# Supabase Update
# ============================================================


def update_percentiles(
    percentiles: dict[int, dict[str, int | None]],
    season: str,
) -> int:
    """
    Update percentile columns in player_advanced_stats for each player.
    Returns count of players updated.
    """
    updated = 0

    for pid, pctile_values in percentiles.items():
        try:
            supabase.table("player_advanced_stats").update(
                pctile_values
            ).eq("nba_player_id", pid).eq("season", season).execute()
            updated += 1
        except Exception as e:
            logger.error(
                f"  Failed to update percentiles for player {pid}: {e}"
            )
            continue

    return updated


# ============================================================
# Main
# ============================================================


def main():
    season = get_current_season()
    logger.info(f"=== calculate_percentiles.py — Season: {season} ===")

    log_id = log_refresh_start(JOB_NAME)

    try:
        # Step 1: Fetch all Tier 1 advanced stats for the season
        rows = get_tier1_advanced_stats(season)
        if not rows:
            logger.warning("No advanced stat rows found. Nothing to compute.")
            log_refresh_complete(log_id, JOB_NAME, 0)
            logger.info("=== calculate_percentiles.py complete (no data) ===")
            return

        # Step 2: Compute percentile ranks
        logger.info(f"Computing percentiles across {len(rows)} players...")
        percentiles = compute_all_percentiles(rows)

        # Step 3: Update the DB
        updated = update_percentiles(percentiles, season)
        logger.info(f"Updated percentiles for {updated} players")

        # Step 4: Log success
        log_refresh_complete(log_id, JOB_NAME, updated)
        logger.info("=== calculate_percentiles.py complete ===")

    except Exception as e:
        log_refresh_failed(log_id, JOB_NAME, traceback.format_exc())
        logger.error("=== calculate_percentiles.py FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
