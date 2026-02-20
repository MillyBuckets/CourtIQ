"""
CourtIQ — Fetch Advanced Stats Pipeline Script

Fetches advanced per-game stats for Tier 1 players using bulk league-wide
endpoints and upserts into the player_advanced_stats table.

Approach: Instead of per-player API calls, this script uses two bulk calls
per season (LeagueDashPlayerStats with 'Advanced' and 'Base' measure types),
giving us all ~500 players in a single response. For 4 seasons that's only
8 API calls total vs ~600 per-player calls.

Available from nba_api (12 of 21 stats):
  - From Advanced measure: ORtg, DRtg, Net Rating, TS%, eFG%, USG%, AST%,
    TRB%, TOV%, Pace
  - Derived from Base measure: 3PAr (FG3A/FGA), FTr (FTA/FGA)

NOT available from stats.nba.com — Basketball Reference proprietary (9 stats):
  - PER, OWS, DWS, WS, WS/48, OBPM, DBPM, BPM, VORP
  These are set to NULL for MVP. Can be filled later via Basketball Reference
  scraping or a third-party API.

Percentile ranks:
  - ts_pctile and usg_pctile: computed from nba_api data (20+ MPG qualifying)
  - per_pctile, ws_pctile, bpm_pctile: NULL (source stats are NULL)
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

JOB_NAME = "fetch_advanced_stats"
UPSERT_BATCH_SIZE = 50
NUM_SEASONS = 4  # Current + 3 prior
MPG_THRESHOLD = 20.0  # Minimum MPG to qualify for percentile pool


# ============================================================
# Helpers
# ============================================================


def safe_float(value, decimals: int = 1) -> Optional[float]:
    """Convert to float rounded to `decimals` places, None for NaN/empty."""
    if pd.isna(value) or value is None or value == "":
        return None
    try:
        return round(float(value), decimals)
    except (ValueError, TypeError):
        return None


def safe_int(value) -> Optional[int]:
    """Convert to int, None for NaN/empty."""
    if pd.isna(value) or value is None or value == "":
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def pct_fraction_to_whole(value) -> Optional[float]:
    """
    nba_api returns USG_PCT, AST_PCT, REB_PCT, TM_TOV_PCT as 0-1 fractions
    (e.g. 0.234 = 23.4%). Our DB stores them as whole-percent NUMERIC(5,1).
    """
    if pd.isna(value) or value is None:
        return None
    try:
        return round(float(value) * 100, 1)
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
def fetch_advanced_bulk(season: str) -> pd.DataFrame:
    """
    Fetch LeagueDashPlayerStats with measure_type='Advanced' for ALL players.
    Returns one row per player with: PLAYER_ID, MIN, OFF_RATING, DEF_RATING,
    NET_RATING, TS_PCT, EFG_PCT, USG_PCT, AST_PCT, REB_PCT, TM_TOV_PCT, PACE.
    """
    logger.info(f"  Fetching Advanced bulk for {season}...")
    rate_limit()
    ep = LeagueDashPlayerStats(
        season=season,
        season_type_all_star="Regular Season",
        measure_type_detailed_defense="Advanced",
        per_mode_simple="PerGame",
        headers=CUSTOM_HEADERS,
        timeout=NBA_TIMEOUT,
    )
    df = ep.get_data_frames()[0]
    logger.info(f"    Advanced: {len(df)} players")
    return df


@with_retry(max_retries=3, base_delay=10.0)
def fetch_base_bulk(season: str) -> pd.DataFrame:
    """
    Fetch LeagueDashPlayerStats with measure_type='Base' PerGame for ALL players.
    We need FG3A, FGA, FTA to derive 3PAr and FTr.
    """
    logger.info(f"  Fetching Base bulk for {season}...")
    rate_limit()
    ep = LeagueDashPlayerStats(
        season=season,
        season_type_all_star="Regular Season",
        measure_type_detailed_defense="Base",
        per_mode_simple="PerGame",
        headers=CUSTOM_HEADERS,
        timeout=NBA_TIMEOUT,
    )
    df = ep.get_data_frames()[0]
    logger.info(f"    Base: {len(df)} players")
    return df


# ============================================================
# Data Transformation
# ============================================================

# nba_api Advanced measure columns -> our DB columns
# These map directly without scale conversion
DIRECT_MAP = {
    "OFF_RATING": ("ortg", 1),      # NUMERIC(5,1), whole number (e.g. 112.3)
    "DEF_RATING": ("drtg", 1),      # NUMERIC(5,1)
    "NET_RATING": ("net_rtg", 1),   # NUMERIC(5,1)
    "TS_PCT":     ("ts_pct", 3),    # NUMERIC(5,3), fraction (e.g. 0.623)
    "EFG_PCT":    ("efg_pct", 3),   # NUMERIC(5,3), fraction
    "PACE":       ("pace", 1),      # NUMERIC(5,1), whole number (e.g. 98.2)
}

# nba_api columns that are 0-1 fractions but stored as whole percents (0-100)
FRACTION_TO_WHOLE_MAP = {
    "USG_PCT":    "usg_pct",    # 0.234 -> 23.4, NUMERIC(5,1)
    "AST_PCT":    "ast_pct",    # NUMERIC(5,1)
    "REB_PCT":    "trb_pct",    # NUMERIC(5,1)
    "TM_TOV_PCT": "tov_pct",   # NUMERIC(5,1), team-context (best available)
}


def build_season_records(
    adv_df: pd.DataFrame,
    base_df: pd.DataFrame,
    tier1_ids: set[int],
    season: str,
    now: str,
) -> list[dict]:
    """
    Merge Advanced + Base DataFrames, filter to Tier 1,
    and build record dicts for upsert.

    Each record includes a transient '_min_pg' field used for percentile
    qualification, stripped before upsert.
    """
    if adv_df.empty:
        return []

    # Merge: left join Base columns onto Advanced DataFrame
    base_cols = base_df[["PLAYER_ID", "FG3A", "FGA", "FTA"]].copy()
    merged = adv_df.merge(base_cols, on="PLAYER_ID", how="left")

    # Filter to Tier 1 players only
    merged = merged[merged["PLAYER_ID"].isin(tier1_ids)]

    if merged.empty:
        return []

    records = []
    for _, row in merged.iterrows():
        record = {
            "nba_player_id": int(row["PLAYER_ID"]),
            "season": season,
            "season_type": "Regular Season",
            "last_updated": now,
        }

        # --- Stats available from nba_api ---

        # Direct mapping (no scale conversion needed)
        for nba_col, (db_col, decimals) in DIRECT_MAP.items():
            record[db_col] = safe_float(row.get(nba_col), decimals)

        # Fraction-to-whole-percent conversion
        for nba_col, db_col in FRACTION_TO_WHOLE_MAP.items():
            record[db_col] = pct_fraction_to_whole(row.get(nba_col))

        # Derived stats from Base measure type
        fga = float(row.get("FGA", 0) or 0)
        if fga > 0:
            record["three_par"] = safe_float(
                float(row.get("FG3A", 0) or 0) / fga, 3
            )
            record["ftr"] = safe_float(
                float(row.get("FTA", 0) or 0) / fga, 3
            )
        else:
            record["three_par"] = None
            record["ftr"] = None

        # --- Basketball Reference-only stats (NULL for MVP) ---
        # These are proprietary metrics not available from stats.nba.com:
        #   PER: Player Efficiency Rating (BBRef formula)
        #   OWS/DWS/WS/WS48: Win Shares family (BBRef formula)
        #   OBPM/DBPM/BPM: Box Plus/Minus family (BBRef formula)
        #   VORP: Value Over Replacement Player (BBRef formula)
        # TODO: Fill via Basketball Reference scraping or third-party API post-MVP
        record["per"] = None
        record["ows"] = None
        record["dws"] = None
        record["ws"] = None
        record["ws_48"] = None
        record["obpm"] = None
        record["dbpm"] = None
        record["bpm"] = None
        record["vorp"] = None

        # Transient field for percentile qualification (stripped before upsert)
        record["_min_pg"] = safe_float(row.get("MIN"), 1)

        records.append(record)

    return records


# ============================================================
# Percentile Calculation
# ============================================================


def compute_percentile_map(
    records: list[dict],
    stat_col: str,
) -> dict[int, float]:
    """
    Compute percentile rank for stat_col across qualifying players (20+ MPG).
    Returns {nba_player_id: percentile_rank}.

    Percentile = (count of qualifying players with strictly lower value
                  / total qualifying count) * 100

    No scipy dependency — simple sorted-list scan, fast enough for ~150 players.
    """
    qualifying = [
        r for r in records
        if r.get("_min_pg") is not None
        and r["_min_pg"] >= MPG_THRESHOLD
        and r.get(stat_col) is not None
    ]
    if not qualifying:
        return {}

    values = sorted(r[stat_col] for r in qualifying)
    n = len(values)

    result = {}
    for r in qualifying:
        v = r[stat_col]
        count_below = 0
        for x in values:
            if x < v:
                count_below += 1
            else:
                break  # values is sorted, no need to continue
        pctile = round((count_below / n) * 100, 1)
        result[r["nba_player_id"]] = pctile

    return result


def apply_percentiles(records: list[dict]) -> list[dict]:
    """
    Compute percentile ranks for available stats and attach to records.
    Strips the transient _min_pg field before returning.

    Computed: ts_pctile, usg_pctile (source data available from nba_api)
    NULL: per_pctile, ws_pctile, bpm_pctile (source stats are NULL for MVP)
    """
    ts_map = compute_percentile_map(records, "ts_pct")
    usg_map = compute_percentile_map(records, "usg_pct")

    for r in records:
        pid = r["nba_player_id"]
        r["ts_pctile"] = ts_map.get(pid)
        r["usg_pctile"] = usg_map.get(pid)
        # NULL because source stats (PER, WS, BPM) are NULL for MVP
        r["per_pctile"] = None
        r["ws_pctile"] = None
        r["bpm_pctile"] = None
        # Strip transient field before upsert
        r.pop("_min_pg", None)

    return records


# ============================================================
# Supabase Upsert
# ============================================================


def upsert_advanced_stats(records: list[dict]) -> int:
    """
    Upsert advanced stat records in batches.
    Conflict key: (nba_player_id, season, season_type).
    """
    total = len(records)
    upserted = 0

    for i in range(0, total, UPSERT_BATCH_SIZE):
        batch = records[i : i + UPSERT_BATCH_SIZE]
        try:
            supabase.table("player_advanced_stats").upsert(
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
        f"=== fetch_advanced_stats.py — Seasons: {', '.join(target_seasons)} ==="
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

        # Step 2: For each season, make 2 bulk API calls
        for season in target_seasons:
            logger.info(f"--- Season {season} ---")
            try:
                adv_df = fetch_advanced_bulk(season)
                base_df = fetch_base_bulk(season)

                if adv_df.empty:
                    logger.warning(f"  No advanced data for {season}, skipping")
                    continue

                records = build_season_records(
                    adv_df, base_df, tier1_ids, season, now
                )
                logger.info(f"  Built {len(records)} Tier 1 records for {season}")

                # Compute percentiles for this season's pool
                records = apply_percentiles(records)
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
            upserted = upsert_advanced_stats(all_records)
            logger.info(f"Upserted {upserted} advanced stat records")
        else:
            upserted = 0
            logger.warning("No advanced stat records to upsert")

        # Step 4: Log success
        players_updated = len({r["nba_player_id"] for r in all_records})
        log_refresh_complete(log_id, JOB_NAME, players_updated)
        logger.info("=== fetch_advanced_stats.py complete ===")

    except Exception as e:
        log_refresh_failed(log_id, JOB_NAME, traceback.format_exc())
        logger.error("=== fetch_advanced_stats.py FAILED ===")
        sys.exit(1)


if __name__ == "__main__":
    main()
