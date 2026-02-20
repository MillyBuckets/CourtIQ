# CourtIQ

NBA player analytics dashboard with interactive shot chart heat maps, advanced stats, and performance tracking. Built for the 2025-26 season with daily data refreshes.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS v4 |
| **Charts** | D3.js (hex-bin shot charts), Recharts (radar, line charts) |
| **Database** | Supabase (PostgreSQL) |
| **Data Fetching** | TanStack React Query v5 |
| **Data Pipeline** | Python + nba_api (GitHub Actions) |
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
- A [Supabase](https://supabase.com) project with the schema set up (see `docs/CourtIQ_PRD.md` Section 11)

### Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/your-username/courtiq.git
   cd courtiq
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

   | Variable | Description | Where |
   |----------|-------------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard > Settings > API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable anon key (safe for browser) | Supabase Dashboard > Settings > API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only, never exposed to browser) | Supabase Dashboard > Settings > API |

4. **Run the dev server**

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

## Data Pipeline

The data pipeline uses Python scripts that pull from the NBA Stats API via `nba_api` and write to Supabase. It runs on **GitHub Actions** (not Vercel) because the NBA API blocks cloud IPs.

### Pipeline Scripts

Located in `scripts/`:

| Script | Purpose |
|--------|---------|
| `fetch_players.py` | Tier 1 player roster (~150 players, 20+ mpg) |
| `fetch_season_stats.py` | Per-game season averages |
| `fetch_advanced_stats.py` | PER, TS%, Win Shares, BPM, etc. |
| `fetch_shot_charts.py` | Individual shot locations for heat maps |
| `fetch_game_logs.py` | Game-by-game box scores |
| `calculate_percentiles.py` | League percentile rankings |
| `seed_mock_data.py` | Generate mock data for local testing |

### Running the Pipeline Locally

```bash
cd scripts
pip install -r requirements.txt
```

Set pipeline environment variables:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_KEY=your-service-role-key
```

Run scripts in order:

```bash
python fetch_players.py
python fetch_season_stats.py
python fetch_advanced_stats.py
python fetch_shot_charts.py
python fetch_game_logs.py
python calculate_percentiles.py
```

### GitHub Actions (Automated Daily Refresh)

Add these as **repository secrets** in GitHub:
- `SUPABASE_URL`
- `SUPABASE_KEY` (service role key)

The workflow runs daily to keep stats current during the NBA season.

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
scripts/                  # Python data pipeline
```

## License

Private project. All rights reserved.
