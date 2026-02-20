"""
CourtIQ — Data Pipeline Configuration

Shared utilities for all pipeline scripts:
- Supabase client (service role)
- Rate limiter for nba_api
- Current season helper
- Logging setup
- Refresh log helpers
"""

from __future__ import annotations

import os
import sys
import time
import logging
from datetime import date, datetime, timezone
from functools import wraps
from typing import Optional

from supabase import create_client, Client

# ============================================================
# NBA API — Configure headers and timeout BEFORE any endpoint imports
# stats.nba.com requires browser-like headers and longer timeouts
# ============================================================

CUSTOM_HEADERS = {
    "Host": "stats.nba.com",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "Connection": "keep-alive",
}
NBA_TIMEOUT = 120  # seconds — NBA API can be very slow

# ============================================================
# Logging
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("courtiq")

# ============================================================
# Environment
# ============================================================

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("SUPABASE_URL and SUPABASE_KEY environment variables are required")
    sys.exit(1)

# ============================================================
# Supabase Client (service role — full write access)
# ============================================================

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ============================================================
# NBA API Rate Limiter
# ============================================================

# Minimum delay between nba_api requests (seconds)
REQUEST_DELAY = 2.0

_last_request_time = 0.0


def rate_limit():
    """Sleep if needed to maintain REQUEST_DELAY between nba_api calls."""
    global _last_request_time
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < REQUEST_DELAY:
        sleep_time = REQUEST_DELAY - elapsed
        logger.debug(f"Rate limiting: sleeping {sleep_time:.1f}s")
        time.sleep(sleep_time)
    _last_request_time = time.time()


def with_retry(max_retries: int = 3, base_delay: float = 5.0):
    """Decorator that retries a function on exception with exponential backoff."""

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(1, max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries:
                        logger.error(
                            f"{func.__name__} failed after {max_retries} attempts: {e}"
                        )
                        raise
                    delay = base_delay * (2 ** (attempt - 1))
                    logger.warning(
                        f"{func.__name__} attempt {attempt}/{max_retries} failed: {e}. "
                        f"Retrying in {delay:.0f}s..."
                    )
                    time.sleep(delay)

        return wrapper

    return decorator


# ============================================================
# Season Helpers
# ============================================================


def get_current_season() -> str:
    """
    Return the current NBA season string in 'YYYY-YY' format.
    NBA season starts in October: before October we're in the prior season.
    """
    today = date.today()
    year = today.year
    if today.month >= 10:
        return f"{year}-{str(year + 1)[2:]}"
    return f"{year - 1}-{str(year)[2:]}"


def get_seasons(n: int = 4) -> list[str]:
    """Return the current season plus the previous (n-1) seasons."""
    today = date.today()
    start_year = today.year if today.month >= 10 else today.year - 1
    seasons = []
    for i in range(n):
        y = start_year - i
        seasons.append(f"{y}-{str(y + 1)[2:]}")
    return seasons


# ============================================================
# Slug Helper
# ============================================================


def make_slug(full_name: str) -> str:
    """Convert a player name to a URL-friendly slug: 'Stephen Curry' -> 'stephen-curry'."""
    import re

    slug = full_name.lower().strip()
    slug = re.sub(r"[.'']", "", slug)  # Remove apostrophes and dots
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)  # Keep only alphanumeric, spaces, hyphens
    slug = re.sub(r"[\s]+", "-", slug)  # Spaces to hyphens
    slug = re.sub(r"-+", "-", slug)  # Collapse multiple hyphens
    return slug.strip("-")


# ============================================================
# Headshot URL
# ============================================================

HEADSHOT_URL_TEMPLATE = "https://cdn.nba.com/headshots/nba/latest/1040x760/{player_id}.png"


def get_headshot_url(player_id: int) -> str:
    return HEADSHOT_URL_TEMPLATE.format(player_id=player_id)


# ============================================================
# Refresh Log Helpers
# ============================================================


def log_refresh_start(job_name: str) -> int:
    """Insert a 'started' row into data_refresh_log. Returns the row id."""
    now = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("data_refresh_log")
        .insert({"job_name": job_name, "status": "started", "started_at": now})
        .execute()
    )
    row_id = result.data[0]["id"]
    logger.info(f"[{job_name}] Refresh started (log id: {row_id})")
    return row_id


def log_refresh_complete(log_id: int, job_name: str, players_updated: int):
    """Mark a refresh log row as completed."""
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("data_refresh_log").update(
        {
            "status": "completed",
            "players_updated": players_updated,
            "completed_at": now,
        }
    ).eq("id", log_id).execute()
    logger.info(f"[{job_name}] Refresh completed — {players_updated} players updated")


def log_refresh_failed(log_id: int, job_name: str, error_message: str):
    """Mark a refresh log row as failed."""
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("data_refresh_log").update(
        {
            "status": "failed",
            "error_message": error_message[:2000],  # Truncate long errors
            "completed_at": now,
        }
    ).eq("id", log_id).execute()
    logger.error(f"[{job_name}] Refresh failed: {error_message}")
