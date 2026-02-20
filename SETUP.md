# CourtIQ Setup Guide

Step-by-step instructions to get CourtIQ running locally from scratch. No prior experience with Supabase or databases required.

---

## Prerequisites

Before you start, make sure you have these installed:

- **Node.js** (v18 or later) — [download here](https://nodejs.org/)
- **Python 3** (v3.9 or later) — [download here](https://www.python.org/downloads/)
- **Git** — [download here](https://git-scm.com/downloads)

To verify, open your terminal and run:

```bash
node --version    # should print v18.x.x or higher
python3 --version # should print 3.9.x or higher
git --version     # should print git version 2.x.x
```

**You should see:** A version number printed for each command. If any command says "not found", install that tool first.

---

## Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd CourtIQ
```

Then install the JavaScript dependencies:

```bash
npm install
```

**You should see:** A progress bar followed by "added X packages" with no errors. A `node_modules/` folder will appear in the project.

---

## Step 2: Create a Supabase Project

Supabase is a free hosted database. You need an account and a project.

1. Go to **[supabase.com](https://supabase.com)** and click **Start your project**
2. Sign up with your **GitHub account** (easiest) or email
3. Once logged in, click the green **New project** button
4. Fill in the form:
   - **Organization:** Pick your default org (or create one)
   - **Name:** `courtiq` (or any name you like)
   - **Database Password:** Pick something strong and **save it somewhere** (you won't need it again for this setup, but keep it safe)
   - **Region:** Choose the closest to you (e.g., "East US" for the US East Coast)
5. Click **Create new project**
6. Wait about 60 seconds for the project to finish setting up

**You should see:** A project dashboard with a green "Project is ready" status. The left sidebar will show options like Table Editor, SQL Editor, etc.

---

## Step 3: Run the Database Migration

This creates all the tables CourtIQ needs (players, stats, shots, etc.).

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New query** (top left)
3. Open the file `supabase/migrations/00001_create_tables.sql` from the project in any text editor
4. **Copy the entire contents** of that file
5. **Paste** it into the Supabase SQL Editor
6. Click the green **Run** button (or press Ctrl/Cmd + Enter)

**You should see:** A green banner that says **"Success. No rows returned"** at the bottom. This is expected — the SQL created tables, it didn't return data.

To verify, click **Table Editor** in the left sidebar. You should see 6 tables listed:
- `players`
- `player_season_stats`
- `player_advanced_stats`
- `shot_chart_data`
- `game_logs`
- `data_refresh_log`

---

## Step 4: Get Your Supabase Credentials

You need 3 values from Supabase. Here's where to find them:

1. In the Supabase dashboard, click **Settings** (gear icon) in the left sidebar
2. Click **API** under the "Configuration" section
3. You'll see a page with your project details. Copy these 3 values:

| What to copy | Where to find it | Looks like |
|---|---|---|
| **Project URL** | Top of the page, under "Project URL" | `https://abcdefg.supabase.co` |
| **anon public key** | Under "Project API keys", labeled `anon` `public` | A long string starting with `eyJ...` |
| **service_role key** | Under "Project API keys", labeled `service_role` `secret` (click the eye icon to reveal) | A long string starting with `eyJ...` |

**You should see:** Three values copied to your clipboard or a text file. Keep them handy for the next step.

> **Important:** The `service_role` key has full access to your database. Never share it publicly or commit it to Git.

---

## Step 5: Create Your Environment Files

CourtIQ needs two environment files — one for the web app and one for the data scripts.

### 5a: Create `.env.local` (for the Next.js web app)

In the project root (`CourtIQ/`), create a file called `.env.local`:

```bash
cp .env.local.example .env.local
```

Then open `.env.local` in a text editor and replace the placeholder values with your real credentials:

```env
# Frontend (Next.js)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Pipeline Scripts (Python)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your_service_role_key_here
```

> **Note:** `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL` use the **same** Project URL value. `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_KEY` use the **same** service_role key value. They're duplicated because Next.js and Python read environment variables differently.

**You should see:** A `.env.local` file in your project root with your real Supabase URL and keys filled in (no more `your_...` placeholders).

### 5b: Verify `.env.local` is in `.gitignore`

This file contains secrets and should never be committed to Git. Check that `.gitignore` includes it:

```bash
grep "env.local" .gitignore
```

**You should see:** A line containing `.env.local` in the output. If not, add it manually.

---

## Step 6: Install Python Dependencies

The data pipeline scripts need a few Python packages:

```bash
pip3 install -r scripts/requirements.txt
```

**You should see:** Output ending with `Successfully installed nba-api-X.X.X pandas-X.X.X supabase-X.X.X python-dotenv-X.X.X` (version numbers may vary). Some warnings about PATH are normal and can be ignored.

If you get a permissions error, try:

```bash
pip3 install --user -r scripts/requirements.txt
```

---

## Step 7: Seed the Database with Sample Data

Before connecting to the live NBA API, let's populate the database with realistic mock data for 5 players so you can test the app:

```bash
cd scripts
SUPABASE_URL=https://your-project-id.supabase.co SUPABASE_KEY=your_service_role_key_here python3 seed_mock_data.py
```

> **Tip:** Replace `your-project-id` and `your_service_role_key_here` with your actual values from Step 4. Alternatively, if you set up `.env.local` correctly, you can source it:
> ```bash
> cd scripts
> export $(grep -E '^SUPABASE_' ../. env.local | xargs) && python3 seed_mock_data.py
> ```

**You should see:** Output like this:

```
=== seed_mock_data.py — Season: 2025-26 ===
Seeding players...
  Upserted 5 players
Seeding season stats...
  Upserted 5 season stat rows
Seeding advanced stats...
  Upserted 5 advanced stat rows
Generating data for Stephen Curry...
  Stephen Curry: 200 shots
  Stephen Curry: 40 game logs
Generating data for LeBron James...
  LeBron James: 170 shots
  LeBron James: 40 game logs
Generating data for Giannis Antetokounmpo...
  Giannis Antetokounmpo: 150 shots
  Giannis Antetokounmpo: 40 game logs
Generating data for Luka Doncic...
  Luka Doncic: 190 shots
  Luka Doncic: 40 game logs
Generating data for Jayson Tatum...
  Jayson Tatum: 190 shots
  Jayson Tatum: 40 game logs
==================================================
Seed complete!
  Players:        5
  Season stats:   5
  Advanced stats: 5
  Shots:          900
  Game logs:      200
==================================================
```

If you ever need to reset the seed data, use the `--clean` flag:

```bash
python3 seed_mock_data.py --clean
```

---

## Step 8: Start the Dev Server

Go back to the project root and start the Next.js development server:

```bash
cd ..
npm run dev
```

**You should see:**

```
Next.js 16.x.x (Turbopack)
- Local:    http://localhost:3000
- Network:  http://192.168.x.x:3000

Ready in ~1500ms
```

> **If port 3000 is busy**, Next.js will automatically use port 3001. Check the output for the actual URL.

---

## Step 9: Verify Everything Works

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### Homepage

**You should see:**

- A dark-themed page with **"CourtIQ"** in large text (the word "Court" is red, "IQ" is white)
- A subtitle: "NBA Player Analytics & Shot Charts"
- A **search bar** in the center
- A **"Top Performers"** section with tabs: **PPG | APG | RPG | 3PM**
- Player cards showing names, teams, headshot photos, and stats
- A footer with "Data provided by NBA.com"

### Search

1. Click the search bar and type **"Curry"**
2. **You should see:** A dropdown with "Stephen Curry" appearing as you type
3. Click on **Stephen Curry**

### Player Page

**You should see:**

- A player header with Curry's name, team (GSW), and photo
- A **shot chart heat map** on a basketball court — Curry's chart should show heavy concentration along the three-point line (lots of red/orange on the perimeter)
- **Zone breakdown** stats below the court
- A **radar chart** showing scoring, playmaking, rebounding, defense, efficiency, and impact dimensions
- A **form tracker** showing game-by-game performance over ~40 games
- An **advanced stats table** with metrics like PER, TS%, BPM, etc.

### Compare Shot Charts

Try visiting other players to see different shot patterns:

- **Giannis Antetokounmpo** — Heat map should be concentrated near the basket (he rarely shoots 3s)
- **Luka Doncic** — Balanced chart with mid-range and three-point shots
- **Jayson Tatum** — Even three-point distribution from all areas of the arc

---

## Troubleshooting

### "Internal server error" on the homepage

The APIs can't connect to Supabase. Check that:
1. `.env.local` exists in the project root
2. The `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values are correct
3. You **restarted the dev server** after creating `.env.local` (press Ctrl+C then `npm run dev` again)

### "No leader data available" on the homepage

The database tables exist but have no data. Run the seed script (Step 7).

### Search returns no results

Same as above — the `players` table is empty. Run the seed script.

### Port 3000 won't load / page hangs

Another process may be stuck on port 3000. Kill it and restart:

```bash
# Find what's using port 3000
lsof -i :3000

# Kill it (replace PID with the actual number)
kill -9 <PID>

# Restart
npm run dev
```

### Python script fails with "Missing SUPABASE_URL"

Make sure you're passing the environment variables when running the script:

```bash
SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=your_key python3 seed_mock_data.py
```

### Shot chart is empty on a player page

The `shot_chart_data` table might not have data for that player. The seed script only creates shots for 5 players: Curry, LeBron, Giannis, Luka, and Tatum.

---

## What's Next?

The seed data is realistic but fake. To get **real NBA data**, you'll need to run the full data pipeline via GitHub Actions. See the workflow files in `.github/workflows/` for details.
