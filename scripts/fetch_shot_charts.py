"""
CourtIQ — Fetch Shot Charts Pipeline Script

Fetches individual shot attempt data (LOC_X, LOC_Y, zones, etc.) for all
Tier 1 players using nba_api's ShotChartDetail endpoint. This powers the
heat map — the crown jewel of the product.

Volume: 500-1,000+ shots per player × ~150 Tier 1 players = 75k-150k rows.
The script uses aggressive batching and pauses to respect rate limits:
  - 3-second delay between players (shot chart endpoint is heavily throttled)
  - 30-second pause between batches of 10 players
  - Resume capability: tracks completed players within a run

Usage:
  # Fetch current season (default)
  python scripts/fetch_shot_charts.py

  # Fetch a specific season (e.g. previous season for comparison)
  python scripts/fetch_shot_charts.py --season 2024-25

Data source:
  - ShotChartDetail(context_measure_simple='FGA') returns every shot attempt
    for a player in a given season, with court coordinates and zone metadata.
  - Second DataFrame [1] contains league averages per zone (not used here,
    but available for zone comparison in the API layer).
"""

from __future__ import annotations

import argparse
import sys
import time
import traceback
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from nba_api.stats.endpoints import ShotChartDetail

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

JOB_NAME = "fetch_shot_charts"
UPSERT_BATCH_SIZE = 100  # Larger batches for high-volume data
PLAYER_BATCH_SIZE = 10   # Players per batch before long pause
INTER_PLAYER_DELAY = 3.0  # Seconds between individual player requests
INTER_BATCH_DELAY = 30.0  # Seconds between batches of players


# ============================================================
# Helpers
# ============================================================


def safe_int(value) -> Optional[int]:
    """Convert to int, None for NaN/empty."""
    if pd.isna(value) or value is None or value == "":
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def safe_str(value) -> Optional[str]:
    """Convert to str, None for NaN/empty."""
    if pd.isna(value) or value is None or value == "":
        return None
    return str(value).strip()


def parse_game_date(date_str) -> Optional[str]:
    """
    Parse GAME_DATE from ShotChartDetail into ISO date string.
    nba_api returns dates as 'YYYYMMDD' (e.g. '20251225').
    Our DB stores game_date as DATE type, so we need 'YYYY-MM-DD'.
    """
    if pd.isna(date_str) or date_str is None or date_str == "":
        return None
    s = str(date_str).strip()
    # Handle 'YYYYMMDD' format
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    # Already in 'YYYY-MM-DD' or similar format
    if len(s) >= 10 and s[4] == "-":
        return s[:10]
    return s


# ============================================================
# Data Fetching
# ============================================================


def get_tier1_players() -> list[dict]:
    """Fetch all active Tier 1 players with their team abbreviation."""
    result = (
        supabase.table("players")
        .select("nba_player_id, full_name, team_abbr")
        .eq("is_active", True)
        .eq("tier", 1)
        .execute()
    )
    players = result.data
    logger.info(f"Found {len(players)} active Tier 1 players in database")
    return players


def get_already_fetched_player_ids(season: str) -> set[int]:
    """
    Query shot_chart_data to find players who already have data for this
    season. Used for resume capability — if the script is interrupted and
    restarted, it skips players that already have shots in the DB.

    We check for any rows matching (season), then collect distinct player IDs.
    This is a lightweight query using the existing index on (nba_player_id, season).
    """
    try:
        result = (
            supabase.table("shot_chart_data")
            .select("nba_player_id")
            .eq("season", season)
            .execute()
        )
        ids = {row["nba_player_id"] for row in result.data}
        if ids:
            logger.info(
                f"Resume: found {len(ids)} players already fetched for {season}"
            )
        return ids
    except Exception as e:
        logger.warning(f"Could not check existing data for resume: {e}")
        return set()


@with_retry(max_retries=3, base_delay=10.0)
def fetch_player_shots(
    player_id: int, season: str, team_id: int = 0
) -> pd.DataFrame:
    """
    Fetch all shot attempts for a player in a season via ShotChartDetail.

    Returns the Shot_Chart_Detail DataFrame with columns:
      GAME_ID, GAME_DATE, PERIOD, MINUTES_REMAINING, SECONDS_REMAINING,
      ACTION_TYPE, SHOT_TYPE, SHOT_ZONE_BASIC, SHOT_ZONE_AREA,
      SHOT_ZONE_RANGE, SHOT_DISTANCE, LOC_X, LOC_Y, SHOT_MADE_FLAG,
      HTM, VTM, PLAYER_ID, TEAM_ID, etc.
    """
    rate_limit()
    ep = ShotChartDetail(
        player_id=player_id,
        team_id=team_id,
        context_measure_simple="FGA",
        season_type_all_star="Regular Season",
        season_nullable=season,
        headers=CUSTOM_HEADERS,
        timeout=NBA_TIMEOUT,
    )
    df = ep.get_data_frames()[0]
    return df


# ============================================================
# Data Transformation
# ============================================================


def derive_game_context(
    row: pd.Series, player_team_abbr: Optional[str]
) -> dict:
    """
    Derive opponent_team, home_away, and game_result from shot row context.

    ShotChartDetail provides:
      - HTM: home team abbreviation (e.g. 'GSW')
      - VTM: visitor team abbreviation (e.g. 'LAL')

    We don't have W/L directly from ShotChartDetail — game_result is set
    to None here. It can be backfilled from game_logs if needed.
    """
    htm = safe_str(row.get("HTM"))
    vtm = safe_str(row.get("VTM"))

    home_away = None
    opponent_team = None

    if player_team_abbr and htm and vtm:
        if player_team_abbr.upper() == htm.upper():
            home_away = "H"
            opponent_team = vtm
        elif player_team_abbr.upper() == vtm.upper():
            home_away = "A"
            opponent_team = htm
        else:
            # Player may have been traded — team_abbr in DB is current team,
            # but the shot was taken when they were on a different team.
            # Use HTM/VTM to figure it out from TEAM_ID if needed.
            opponent_team = None
            home_away = None

    return {
        "opponent_team": opponent_team,
        "home_away": home_away,
        "game_result": None,  # Not available from ShotChartDetail
    }


def transform_shot_rows(
    shots_df: pd.DataFrame,
    nba_player_id: int,
    season: str,
    player_team_abbr: Optional[str],
) -> list[dict]:
    """
    Transform ShotChartDetail DataFrame rows into records for upsert.
    """
    if shots_df.empty:
        return []

    records = []
    for _, row in shots_df.iterrows():
        # Core shot location data (required fields — skip if missing)
        loc_x = safe_int(row.get("LOC_X"))
        loc_y = safe_int(row.get("LOC_Y"))
        game_id = safe_str(row.get("GAME_ID"))
        game_date = parse_game_date(row.get("GAME_DATE"))

        if loc_x is None or loc_y is None or not game_id or not game_date:
            continue

        # SHOT_MADE_FLAG: 1 = made, 0 = missed
        shot_made_flag = row.get("SHOT_MADE_FLAG")
        if pd.isna(shot_made_flag) or shot_made_flag is None:
            continue
        shot_made = bool(int(shot_made_flag))

        # Game context (opponent, home/away)
        context = derive_game_context(row, player_team_abbr)

        record = {
            "nba_player_id": nba_player_id,
            "game_id": game_id,
            "game_date": game_date,
            "season": season,
            "period": safe_int(row.get("PERIOD")),
            "minutes_remaining": safe_int(row.get("MINUTES_REMAINING")),
            "seconds_remaining": safe_int(row.get("SECONDS_REMAINING")),
            "action_type": safe_str(row.get("ACTION_TYPE")),
            "shot_type": safe_str(row.get("SHOT_TYPE")),
            "shot_zone_basic": safe_str(row.get("SHOT_ZONE_BASIC")),
            "shot_zone_area": safe_str(row.get("SHOT_ZONE_AREA")),
            "shot_zone_range": safe_str(row.get("SHOT_ZONE_RANGE")),
            "shot_distance": safe_int(row.get("SHOT_DISTANCE")),
            "loc_x": loc_x,
            "loc_y": loc_y,
            "shot_made": shot_made,
            "opponent_team": context["opponent_team"],
            "home_away": context["home_away"],
            "game_result": context["game_result"],
        }
        records.append(record)

    return records


# ============================================================
# Supabase Upsert
# ============================================================


def upsert_shot_records(records: list[dict]) -> int:
    """
    Upsert shot chart records in batches.
    Conflict key: (nba_player_id, game_id, loc_x, loc_y, period,
                    minutes_remaining, seconds_remaining).
    """
    total = len(records)
    upserted = 0

    conflict_key = (
        "nba_player_id,game_id,loc_x,loc_y,"
        "period,minutes_remaining,seconds_remaining"
    )

    for i in range(0, total, UPSERT_BATCH_SIZE):
        batch = records[i : i + UPSERT_BATCH_SIZE]
        try:
            supabase.table("shot_chart_data").upsert(
                batch, on_conflict=conflict_key
            ).execute()
            upserted += len(batch)
        except Exception as e:
            logger.error(f"  Failed to upsert batch starting at index {i}: {e}")
            continue

    return upserted


# ============================================================
# Main
# ============================================================


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch shot chart data for Tier 1 NBA players"
    )
    parser.add_argument(
        "--season",
        type=str,
        default=None,
        help=(
            "NBA season to fetch (e.g. '2024-25'). "
            "Defaults to current season."
        ),
    )
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Disable resume — re-fetch all players even if data exists.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    season = args.season or get_current_season()

    logger.info(f"=== fetch_shot_charts.py — Season: {season} ===")

    log_id = log_refresh_start(JOB_NAME)

    try:
        # Step 1: Get Tier 1 players from DB
        players = get_tier1_players()
        if not players:
            raise ValueError("No Tier 1 players found in database")

        # Step 2: Check for resume — which players already have data
        if args.no_resume:
            already_fetched = set()
            logger.info("Resume disabled — fetching all players")
        else:
            already_fetched = get_already_fetched_player_ids(season)

        # Filter to only players that need fetching
        players_to_fetch = [
            p for p in players
            if p["nba_player_id"] not in already_fetched
        ]
        skipped = len(players) - len(players_to_fetch)
        if skipped > 0:
            logger.info(
                f"Skipping {skipped} already-fetched players, "
                f"{len(players_to_fetch)} remaining"
            )

        if not players_to_fetch:
            logger.info("All players already fetched for this season")
            log_refresh_complete(log_id, JOB_NAME, 0)
            return

        # Step 3: Fetch shot charts in batches
        total_shots = 0
        players_processed = 0
        players_failed = 0

        for batch_idx in range(0, len(players_to_fetch), PLAYER_BATCH_SIZE):
            batch = players_to_fetch[
                batch_idx : batch_idx + PLAYER_BATCH_SIZE
            ]
            batch_num = batch_idx // PLAYER_BATCH_SIZE + 1
            total_batches = (
                (len(players_to_fetch) + PLAYER_BATCH_SIZE - 1)
                // PLAYER_BATCH_SIZE
            )
            logger.info(
                f"--- Batch {batch_num}/{total_batches} "
                f"({len(batch)} players) ---"
            )

            for i, player in enumerate(batch):
                player_id = player["nba_player_id"]
                player_name = player["full_name"]
                player_team = player.get("team_abbr")

                try:
                    shots_df = fetch_player_shots(player_id, season)

                    if shots_df.empty:
                        logger.info(
                            f"  {player_name}: 0 shots (no data)"
                        )
                        players_processed += 1
                        # Still count as processed — player just has no shots
                    else:
                        records = transform_shot_rows(
                            shots_df, player_id, season, player_team
                        )

                        if records:
                            upserted = upsert_shot_records(records)
                            total_shots += upserted
                            logger.info(
                                f"  {player_name}: {len(shots_df)} shots "
                                f"-> {upserted} upserted"
                            )
                        else:
                            logger.info(
                                f"  {player_name}: {len(shots_df)} shots "
                                f"(all skipped — missing required fields)"
                            )
                        players_processed += 1

                except Exception as e:
                    players_failed += 1
                    logger.error(
                        f"  FAILED {player_name} (id={player_id}): {e}"
                    )
                    continue

                # Inter-player delay (skip after last player in batch)
                if i < len(batch) - 1:
                    time.sleep(INTER_PLAYER_DELAY)

            # Progress summary after each batch
            logger.info(
                f"  Batch {batch_num} done — "
                f"cumulative: {players_processed} processed, "
                f"{total_shots} shots, {players_failed} failed"
            )

            # Inter-batch pause (skip after last batch)
            remaining_batches = total_batches - batch_num
            if remaining_batches > 0:
                logger.info(
                    f"  Pausing {INTER_BATCH_DELAY:.0f}s before next batch "
                    f"({remaining_batches} batches remaining)..."
                )
                time.sleep(INTER_BATCH_DELAY)

        # Step 4: Final summary and log
        logger.info(
            f"Processed {players_processed} players "
            f"({players_failed} failed), {total_shots} total shot records"
        )
        log_refresh_complete(log_id, JOB_NAME, players_processed)
        logger.info("=== fetch_shot_charts.py complete ===")

    except Exception as e:
        log_refresh_failed(log_id, JOB_NAME, traceback.format_exc())
        logger.error("=== fetch_shot_charts.py FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
