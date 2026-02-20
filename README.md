# CourtIQ

NBA player analytics dashboard with interactive shot chart heat maps, advanced stats, and performance tracking. Built for the 2025-26 season with data for 150 Tier 1 players.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS v4 |
| **Charts** | D3.js (hex-bin shot charts), Recharts (radar, line charts) |
| **Database** | Supabase (PostgreSQL) |
| **Data Fetching** | TanStack React Query v5 |
| **Data Pipeline** | Python (Basketball Reference + nba_api static data) |
| **Hosting** | Vercel |

## Features

- **Interactive Shot Chart** — Hex-bin heat map with made/missed/frequency modes, zone overlay, and shot type filters
- **Advanced Stats Dashboard** — PER, TS%, USG%, Win Shares, BPM with league percentiles
- **Player Radar Chart** — Six-dimension comparison against Tier 1 peers
- **Game Log & Form Tracker** — Rolling averages (last 5, 10, season) with trend visualization
- **Stat Leaders** — League leaders in points, assists, rebounds, steals, blocks, 3PM
- **Player Search** — Debounced search with instant results
- **Responsive Design** — Optimized for mobile (375px+), tablet (768px), and desktop (1440px)

## Local Development

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+ (for data population only)
- A [Supabase](https://supabase.com) project with the schema set up (see `docs/CourtIQ_PRD.md` Section 11)

### Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/MillyBuckets/CourtIQ.git
   cd CourtIQ
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy the example file and fill in your Supabase credentials:

   ```bash
   cp .env.production.example .env.local
   ```

   Required variables:

   | Variable | Description | Where to Find |
   |----------|-------------|---------------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard > Settings > API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable anon key (safe for browser) | Supabase Dashboard > Settings > API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only, never exposed to browser) | Supabase Dashboard > Settings > API |

4. **Populate the database** (see [Data Population](#data-population) below)

5. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push your code to GitHub.

2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.

3. Add environment variables in **Vercel Dashboard > Settings > Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

4. Deploy. Vercel auto-detects Next.js and handles everything.

No `vercel.json` is needed — the default settings work out of the box.

## Data Population

The database is populated using `scripts/populate_data.py`, which loads real NBA stats from Basketball Reference into all 5 Supabase tables.

### Data Sources

| Table | Records | Source |
|-------|---------|--------|
| `players` | 150 | Real player data (Basketball Reference + nba_api static IDs) |
| `player_season_stats` | 150 | Real 2024-25 per-game averages (Basketball Reference) |
| `player_advanced_stats` | 150 | Real 2024-25 advanced metrics (Basketball Reference) |
| `game_logs` | ~9,000 | Generated — realistic per-game stats based on real averages |
| `shot_chart_data` | ~125,000 | Generated — realistic NBA shot zone distributions |

### Running the Population Script

```bash
cd scripts
pip install supabase python-dotenv nba_api
python populate_data.py
```

The script reads credentials from `../.env.local` (the project root `.env.local` file). It requires:
- `SUPABASE_URL` (same value as `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_KEY` (same value as `SUPABASE_SERVICE_ROLE_KEY`)

The script clears all existing data and repopulates from scratch. It is idempotent and safe to re-run.

### Source Data Files

The raw stats are stored as Python modules in the project root:

| File | Contents |
|------|----------|
| `nba_top150_per_game_2025.py` | Per-game stats for top 150 scorers (scraped from Basketball Reference) |
| `nba_top150_advanced_2025.py` | Advanced stats for all NBA players (scraped from Basketball Reference) |

To update stats, re-scrape these files from Basketball Reference and re-run `populate_data.py`.

## Automated Pipeline (GitHub Actions)

A daily refresh pipeline exists in `.github/workflows/daily-refresh.yml` using the `nba_api` Python library to fetch from `stats.nba.com`. However, **this pipeline is currently non-functional** because `stats.nba.com` (via Akamai CDN) blocks automated traffic from cloud IPs.

The pipeline scripts in `scripts/` (`fetch_players.py`, `fetch_season_stats.py`, `fetch_advanced_stats.py`, `fetch_game_logs.py`, `fetch_shot_charts.py`) are correct but cannot reach the data source. Future options include switching to the `balldontlie.io` API or using a proxy service.

## Required Environment Variables

### Vercel / Next.js App

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (public, browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) |

### GitHub Actions (if pipeline is re-enabled)

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Same as `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_KEY` | Same as `SUPABASE_SERVICE_ROLE_KEY` |

## Project Structure

```
src/
  app/
    api/                  # Next.js API routes (server-side, uses service role key)
      leaders/            # GET /api/leaders?stat=pts
      players/
        search/           # GET /api/players/search?q=lebron
        [slug]/           # GET /api/players/lebron-james
          shots/          # GET /api/players/lebron-james/shots?season=2025-26
          game-log/       # GET /api/players/lebron-james/game-log?season=2025-26
          radar/          # GET /api/players/lebron-james/radar
    player/[slug]/        # Player detail page
    page.tsx              # Homepage with stat leaders
    layout.tsx            # Root layout with metadata
  components/
    court/                # Shot chart: CourtCanvas, ShotChartHeatMap, ShotZoneOverlay
    dashboard/            # Stats: AdvancedStatsTable, FormTracker, PlayerRadarChart, StatSummaryBar
    layout/               # Header, PlayerHeader, PlayerSearch
    ui/                   # PlayerCard, ErrorState, shared components
  hooks/                  # React Query hooks: usePlayer, useLeaders, useShots, etc.
  lib/                    # Supabase clients, API fetch helper
  types/                  # TypeScript types + Supabase Database interface
scripts/                  # Python data pipeline + population script
```

## License

Private project. All rights reserved.
