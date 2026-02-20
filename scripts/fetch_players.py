"""
CourtIQ — Fetch Players Pipeline Script

Fetches all active NBA players from nba_api, assigns tiers based on
minutes per game, and upserts into the Supabase players table.

Data sources:
  - PlayerIndex: roster data with bio (height, weight, position, draft info)
  - LeagueDashPlayerStats: per-game averages (used for MPG → tier assignment)

Tier logic:
  - Tier 1: 20+ minutes per game (priority refresh, ~150 players)
  - Tier 2: under 20 MPG (on-demand, deferred for post-MVP)
"""

from __future__ import annotations

import sys
import traceback
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from nba_api.stats.endpoints import PlayerIndex, LeagueDashPlayerStats

# Add parent dir to path so we can import config
sys.path.insert(0, sys.path[0])
from config import (
    logger,
    supabase,
    rate_limit,
    with_retry,
    get_current_season,
    make_slug,
    get_headshot_url,
    log_refresh_start,
    log_refresh_complete,
    log_refresh_failed,
    CUSTOM_HEADERS,
    NBA_TIMEOUT,
)

JOB_NAME = "fetch_players"
MPG_TIER1_THRESHOLD = 20.0
UPSERT_BATCH_SIZE = 50


# ============================================================
# Data Fetching
# ============================================================


@with_retry(max_retries=3, base_delay=10.0)
def fetch_player_index(season: str) -> pd.DataFrame:
    """Fetch player roster with biographical data from PlayerIndex endpoint."""
    logger.info(f"Fetching PlayerIndex for season {season}...")
    rate_limit()
    ep = PlayerIndex(
        league_id="00",
        season=season,
        headers=CUSTOM_HEADERS,
        timeout=NBA_TIMEOUT,
    )
    df = ep.get_data_frames()[0]
    logger.info(f"  PlayerIndex returned {len(df)} players")
    return df


@with_retry(max_retries=3, base_delay=10.0)
def fetch_league_stats(season: str) -> pd.DataFrame:
    """Fetch per-game averages for all players (used for MPG tiering)."""
    logger.info(f"Fetching LeagueDashPlayerStats (PerGame) for season {season}...")
    rate_limit()
    ep = LeagueDashPlayerStats(
        season=season,
        season_type_all_star="Regular Season",
        per_mode_detailed="PerGame",
        headers=CUSTOM_HEADERS,
        timeout=NBA_TIMEOUT,
    )
    df = ep.get_data_frames()[0]
    logger.info(f"  LeagueDashPlayerStats returned {len(df)} players")
    return df


# ============================================================
# Data Transformation
# ============================================================


def safe_int(value) -> Optional[int]:
    """Convert a value to int, returning None for NaN/empty/non-numeric."""
    if pd.isna(value) or value == "" or value == "Undrafted":
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def safe_str(value) -> Optional[str]:
    """Convert a value to str, returning None for NaN/empty."""
    if pd.isna(value) or value == "":
        return None
    return str(value).strip()


def build_player_records(
    player_index_df: pd.DataFrame,
    league_stats_df: pd.DataFrame,
) -> list[dict]:
    """
    Merge PlayerIndex bio data with LeagueDashPlayerStats MPG data.
    Returns a list of dicts ready for Supabase upsert.
    """
    # Build a lookup: player_id -> MPG from league stats
    mpg_lookup = {}
    if not league_stats_df.empty:
        for _, row in league_stats_df.iterrows():
            player_id = int(row["PLAYER_ID"])
            mpg = float(row["MIN"]) if pd.notna(row["MIN"]) else 0.0
            mpg_lookup[player_id] = mpg

    now = datetime.now(timezone.utc).isoformat()
    records = []
    seen_ids = set()

    for _, row in player_index_df.iterrows():
        player_id = int(row["PERSON_ID"])

        # Skip duplicates (PlayerIndex can return players on multiple teams)
        if player_id in seen_ids:
            continue
        seen_ids.add(player_id)

        full_name = f"{safe_str(row.get('PLAYER_FIRST_NAME', '')) or ''} {safe_str(row.get('PLAYER_LAST_NAME', '')) or ''}".strip()
        if not full_name:
            continue

        mpg = mpg_lookup.get(player_id, 0.0)
        tier = 1 if mpg >= MPG_TIER1_THRESHOLD else 2

        record = {
            "nba_player_id": player_id,
            "full_name": full_name,
            "first_name": safe_str(row.get("PLAYER_FIRST_NAME")),
            "last_name": safe_str(row.get("PLAYER_LAST_NAME")),
            "slug": safe_str(row.get("PLAYER_SLUG")) or make_slug(full_name),
            "team_id": safe_int(row.get("TEAM_ID")),
            "team_abbr": safe_str(row.get("TEAM_ABBREVIATION")),
            "team_name": safe_str(row.get("TEAM_NAME")),
            "position": safe_str(row.get("POSITION")),
            "jersey_number": safe_str(row.get("JERSEY_NUMBER")),
            "height": safe_str(row.get("HEIGHT")),
            "weight": safe_int(row.get("WEIGHT")),
            "country": safe_str(row.get("COUNTRY")),
            "draft_year": safe_int(row.get("DRAFT_YEAR")),
            "draft_round": safe_int(row.get("DRAFT_ROUND")),
            "draft_number": safe_int(row.get("DRAFT_NUMBER")),
            "headshot_url": get_headshot_url(player_id),
            "is_active": True,
            "tier": tier,
            "last_fetched": now,
        }

        records.append(record)

    return records


# ============================================================
# Supabase Upsert
# ============================================================


def upsert_players(records: list[dict]) -> int:
    """
    Upsert player records into Supabase in batches.
    Uses nba_player_id as the conflict key.
    Returns the number of players upserted.
    """
    total = len(records)
    upserted = 0

    for i in range(0, total, UPSERT_BATCH_SIZE):
        batch = records[i : i + UPSERT_BATCH_SIZE]
        try:
            supabase.table("players").upsert(
                batch, on_conflict="nba_player_id"
            ).execute()
            upserted += len(batch)
            logger.info(
                f"  Upserted batch {i // UPSERT_BATCH_SIZE + 1} "
                f"({upserted}/{total} players)"
            )
        except Exception as e:
            logger.error(f"  Failed to upsert batch starting at index {i}: {e}")
            # Continue with remaining batches rather than aborting
            continue

    return upserted


def mark_inactive_players(active_ids: set[int]):
    """
    Mark players not in the active set as inactive.
    This handles players who were traded, waived, or retired mid-season.
    """
    try:
        # Fetch all currently-active players from DB
        result = (
            supabase.table("players")
            .select("nba_player_id")
            .eq("is_active", True)
            .execute()
        )
        db_active_ids = {row["nba_player_id"] for row in result.data}

        # Find players in DB that are no longer in the active roster
        to_deactivate = db_active_ids - active_ids
        if to_deactivate:
            logger.info(f"  Marking {len(to_deactivate)} players as inactive")
            for player_id in to_deactivate:
                supabase.table("players").update({"is_active": False}).eq(
                    "nba_player_id", player_id
                ).execute()
        else:
            logger.info("  No players to deactivate")
    except Exception as e:
        logger.warning(f"  Failed to mark inactive players: {e}")


# ============================================================
# Main
# ============================================================


def main():
    season = get_current_season()
    logger.info(f"=== fetch_players.py — Season: {season} ===")

    log_id = log_refresh_start(JOB_NAME)

    try:
        # Step 1: Fetch player roster with bio data
        player_index_df = fetch_player_index(season)
        if player_index_df.empty:
            raise ValueError("PlayerIndex returned no data")

        # Step 2: Fetch per-game stats for MPG tiering
        league_stats_df = fetch_league_stats(season)

        # Step 3: Build merged player records
        records = build_player_records(player_index_df, league_stats_df)
        logger.info(
            f"Built {len(records)} player records "
            f"({sum(1 for r in records if r['tier'] == 1)} Tier 1, "
            f"{sum(1 for r in records if r['tier'] == 2)} Tier 2)"
        )

        if not records:
            raise ValueError("No player records built from API data")

        # Step 4: Upsert into Supabase
        upserted = upsert_players(records)

        # Step 5: Mark players no longer on active rosters
        active_ids = {r["nba_player_id"] for r in records}
        mark_inactive_players(active_ids)

        # Step 6: Log success
        log_refresh_complete(log_id, JOB_NAME, upserted)
        logger.info(f"=== fetch_players.py complete ===")

    except Exception as e:
        log_refresh_failed(log_id, JOB_NAME, traceback.format_exc())
        logger.error(f"=== fetch_players.py FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
