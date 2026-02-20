// ============================================================
// CourtIQ — Constants & Design Tokens
// From PRD Sections 6 and 14
// ============================================================

// --- Design System Colors ---

export const colors = {
  primary: "#1A1A2E",
  secondary: "#16213E",
  accent: "#E94560",
  accentAlt: "#0F3460",

  heatMap: {
    cold: "#3B82F6",
    neutral: "#F8FAFC",
    hot: "#EF4444",
  },

  text: {
    primary: "#F8FAFC",
    secondary: "#94A3B8",
    stat: "#E2E8F0",
  },

  trend: {
    up: "#22C55E",
    down: "#EF4444",
    neutral: "#94A3B8",
  },
} as const;

// --- Stat Definitions with Tooltips ---

export const basicStats = [
  { key: "pts_pg", abbr: "PPG", label: "Points Per Game", tooltip: "Average points scored per game" },
  { key: "reb_pg", abbr: "RPG", label: "Rebounds Per Game", tooltip: "Average rebounds grabbed per game" },
  { key: "ast_pg", abbr: "APG", label: "Assists Per Game", tooltip: "Average assists (passes leading to baskets) per game" },
  { key: "stl_pg", abbr: "SPG", label: "Steals Per Game", tooltip: "Average times the player took the ball from an opponent" },
  { key: "blk_pg", abbr: "BPG", label: "Blocks Per Game", tooltip: "Average times the player blocked an opponent's shot" },
  { key: "fg_pct", abbr: "FG%", label: "Field Goal %", tooltip: "Percentage of all shot attempts made" },
  { key: "fg3_pct", abbr: "3P%", label: "3-Point %", tooltip: "Percentage of three-point attempts made" },
  { key: "ft_pct", abbr: "FT%", label: "Free Throw %", tooltip: "Percentage of free throw attempts made" },
  { key: "min_pg", abbr: "MPG", label: "Minutes Per Game", tooltip: "Average minutes played per game" },
  { key: "gp", abbr: "GP", label: "Games Played", tooltip: "Total games played this season" },
  { key: "tov_pg", abbr: "TOV", label: "Turnovers Per Game", tooltip: "Average times the player lost the ball to the opponent" },
] as const;

export const advancedStats = [
  { key: "per", abbr: "PER", label: "Player Efficiency Rating", tooltip: "A single number that tries to capture a player's total contribution. League average is 15. Above 20 is great. Above 25 is MVP-level." },
  { key: "ts_pct", abbr: "TS%", label: "True Shooting %", tooltip: "The most accurate measure of shooting efficiency — accounts for 2-pointers, 3-pointers, AND free throws. League average is ~57%." },
  { key: "efg_pct", abbr: "eFG%", label: "Effective FG%", tooltip: "Like FG%, but gives extra credit for 3-pointers since they're worth more." },
  { key: "usg_pct", abbr: "USG%", label: "Usage Rate", tooltip: "What percentage of team plays a player 'uses' (shots, free throws, turnovers) while on the court. High usage = the offense runs through them." },
  { key: "ast_pct", abbr: "AST%", label: "Assist %", tooltip: "What percentage of teammate field goals this player assisted while on the court." },
  { key: "trb_pct", abbr: "TRB%", label: "Rebound %", tooltip: "What percentage of available rebounds this player grabbed while on the court." },
  { key: "tov_pct", abbr: "TOV%", label: "Turnover %", tooltip: "How often this player turns the ball over per 100 plays. Lower is better." },
  { key: "ws", abbr: "WS", label: "Win Shares", tooltip: "An estimate of the number of wins a player contributes to their team." },
  { key: "ws_48", abbr: "WS/48", label: "Win Shares / 48", tooltip: "Win Shares normalized to a full 48-minute game. Allows fair comparison between starters and bench players." },
  { key: "bpm", abbr: "BPM", label: "Box Plus/Minus", tooltip: "Estimates how many points per 100 possessions a player contributes above a league-average player." },
  { key: "obpm", abbr: "OBPM", label: "Offensive BPM", tooltip: "The offensive portion of BPM." },
  { key: "dbpm", abbr: "DBPM", label: "Defensive BPM", tooltip: "The defensive portion of BPM." },
  { key: "vorp", abbr: "VORP", label: "Value Over Replacement", tooltip: "Total value a player provides over a theoretical 'replacement-level' player (a fringe NBA player)." },
  { key: "ortg", abbr: "ORtg", label: "Offensive Rating", tooltip: "Points produced per 100 possessions while this player is on the court." },
  { key: "drtg", abbr: "DRtg", label: "Defensive Rating", tooltip: "Points allowed per 100 possessions while this player is on the court. Lower is better." },
  { key: "net_rtg", abbr: "NetRtg", label: "Net Rating", tooltip: "Offensive Rating minus Defensive Rating. Positive = team outscores opponents when they play." },
  { key: "pace", abbr: "PACE", label: "Pace", tooltip: "Estimated possessions per 48 minutes. Higher pace = faster team." },
  { key: "three_par", abbr: "3PAr", label: "3-Point Attempt Rate", tooltip: "Percentage of field goal attempts that are 3-pointers. Shows how much a player relies on the three." },
  { key: "ftr", abbr: "FTr", label: "Free Throw Rate", tooltip: "Free throw attempts per field goal attempt. Higher = draws fouls often." },
] as const;

// --- Court Configuration ---

export const courtConfig = {
  viewBox: { width: 500, height: 470 },
  // Transform nba_api coordinates to SVG coordinates
  // nba_api: LOC_X ranges ~-250 to 250, LOC_Y ranges ~-50 to 420
  // SVG: x ranges 0 to 500, y ranges 0 to 470
  transform: {
    x: (locX: number) => locX + 250,
    y: (locY: number) => 420 - locY,
  },
  hexbin: {
    radius: 12,
    minShots: 3,
  },
} as const;

// --- Season Helpers ---

export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  if (month >= 10) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}
