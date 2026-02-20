"use client";

import React, { useState, use, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { usePlayerProfile } from "@/hooks/usePlayerProfile";
import { usePlayerShots } from "@/hooks/usePlayerShots";
import { usePlayerGameLog } from "@/hooks/usePlayerGameLog";
import { usePlayerRadar } from "@/hooks/usePlayerRadar";
import { ApiError } from "@/lib/queries";
import type { WindowSelection } from "@/types";

import PlayerHeader from "@/components/layout/PlayerHeader";
import StatSummaryBar from "@/components/dashboard/StatSummaryBar";
import PlayerRadarChart from "@/components/dashboard/PlayerRadarChart";
import FormTracker from "@/components/dashboard/FormTracker";
import AdvancedStatsTable from "@/components/dashboard/AdvancedStatsTable";
import ErrorState from "@/components/ui/ErrorState";
import PlayerSearch from "@/components/layout/PlayerSearch";

// D3-based court visualization — dynamically imported to avoid blocking
// initial page load and because D3 doesn't work with SSR.
const CourtCanvas = dynamic(
  () => import("@/components/court/CourtCanvas"),
  {
    ssr: false,
    loading: () => <CourtSkeleton />,
  }
);

// ============================================================
// Skeleton components
// ============================================================

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-card ${className ?? ""}`}
    />
  );
}

function HeaderSkeleton() {
  return (
    <div className="animate-pulse rounded-xl bg-card px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-[60px] w-[60px] rounded-full bg-court-secondary sm:h-[80px] sm:w-[80px]" />
          <div className="space-y-2">
            <div className="h-6 w-48 rounded bg-court-secondary" />
            <div className="h-4 w-32 rounded bg-court-secondary" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="h-8 w-24 rounded-md bg-court-secondary" />
          <div className="h-8 w-48 rounded-lg bg-court-secondary" />
        </div>
      </div>
    </div>
  );
}

function StatBarSkeleton() {
  return (
    <div className="animate-pulse rounded-xl bg-card px-4 py-3">
      <div className="grid grid-cols-3 gap-y-4 sm:grid-cols-6 sm:gap-y-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="h-3 w-8 rounded bg-court-secondary" />
            <div className="h-6 w-12 rounded bg-court-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CourtSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Control bar placeholder */}
      <div className="flex gap-3">
        <div className="h-8 w-40 animate-pulse rounded-full bg-court-secondary" />
        <div className="h-8 w-36 animate-pulse rounded-full bg-court-secondary" />
      </div>
      {/* Court area placeholder — matches ~500x470 aspect ratio */}
      <div className="aspect-[500/470] w-full animate-pulse rounded-lg bg-court-secondary" />
    </div>
  );
}

// ============================================================
// Fade wrapper — briefly fades children when `triggerKey` changes
// ============================================================

function FadeOnChange({
  triggerKey,
  children,
}: {
  triggerKey: string;
  children: React.ReactNode;
}) {
  const [opacity, setOpacity] = useState(1);
  const prevKey = useRef(triggerKey);

  useEffect(() => {
    if (triggerKey !== prevKey.current) {
      prevKey.current = triggerKey;
      setOpacity(0);
      const t = requestAnimationFrame(() => setOpacity(1));
      return () => cancelAnimationFrame(t);
    }
  }, [triggerKey]);

  return (
    <div
      style={{ opacity, transition: "opacity 200ms ease" }}
    >
      {children}
    </div>
  );
}

// ============================================================
// Player not found — with search bar
// ============================================================

function PlayerNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <div className="text-5xl">🏀</div>
      <h1 className="text-xl font-bold text-text-primary">
        Player not found
      </h1>
      <p className="max-w-md text-center text-sm text-text-secondary">
        They might be on the bench. Try searching for another player.
      </p>
      <div className="mt-2 w-full max-w-md">
        <PlayerSearch />
      </div>
      <a
        href="/"
        className="text-sm text-text-secondary underline underline-offset-2 transition-colors hover:text-text-primary"
      >
        Back to Home
      </a>
    </div>
  );
}

// ============================================================
// Full-page error — for catastrophic profile failures
// ============================================================

function ProfileError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-12 w-12 text-text-secondary"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
      </svg>
      <h1 className="text-xl font-bold text-text-primary">
        Something went wrong
      </h1>
      <p className="max-w-md text-center text-sm text-text-secondary">
        Unable to load player data. Please try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-lg bg-court-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-court-accent/80"
      >
        Try again
      </button>
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export default function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  // ---- Primary query: player profile ----
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = usePlayerProfile(slug);

  // ---- Derived state ----
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [activeWindow, setActiveWindow] = useState<WindowSelection>("season");

  // Resolve season: use user selection if set, else default from profile
  const season =
    selectedSeason ?? profile?.currentSeason.season ?? "";

  // ---- Secondary queries (depend on season) ----
  const lastN =
    activeWindow === "last5" ? 5 : activeWindow === "last10" ? 10 : null;

  const {
    data: shotData,
    isLoading: shotsLoading,
    error: shotsError,
    refetch: refetchShots,
  } = usePlayerShots(slug, season, lastN);

  const {
    data: gameLogData,
    isLoading: gameLogLoading,
    error: gameLogError,
    refetch: refetchGameLog,
  } = usePlayerGameLog(slug, season);

  const {
    data: radarData,
    isLoading: radarLoading,
    error: radarError,
    refetch: refetchRadar,
  } = usePlayerRadar(slug, season);

  // ---- Error handling: profile ----
  if (profileError) {
    if (profileError instanceof ApiError && profileError.status === 404) {
      return <PlayerNotFound />;
    }
    return <ProfileError onRetry={() => refetchProfile()} />;
  }

  // ---- Loading state for profile ----
  if (profileLoading || !profile) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-2 py-4 sm:px-4 lg:p-6">
        <HeaderSkeleton />
        <StatBarSkeleton />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <SkeletonBlock className="h-[500px] lg:col-span-3" />
          <div className="space-y-4 lg:col-span-2">
            <SkeletonBlock className="h-[350px]" />
            <SkeletonBlock className="h-[280px]" />
            <SkeletonBlock className="h-[400px]" />
          </div>
        </div>
      </div>
    );
  }

  // ---- Data ready ----
  const { player, currentSeason, availableSeasons } = profile;
  const basicStats = currentSeason.basic;
  const advancedStats = currentSeason.advanced;
  const percentiles = currentSeason.percentiles;

  return (
    <div className="animate-page-enter mx-auto max-w-7xl space-y-4 px-2 py-4 sm:px-4 lg:p-6">
      {/* Row 1: Player Header (full width) */}
      <PlayerHeader
        player={player}
        currentSeason={season}
        availableSeasons={availableSeasons}
        activeWindow={activeWindow}
        onSeasonChange={(s) => setSelectedSeason(s)}
        onWindowChange={setActiveWindow}
      />

      {/* Row 2: Stat Summary Bar (full width) */}
      <FadeOnChange triggerKey={activeWindow}>
        {gameLogError ? (
          <ErrorState
            section="stats"
            onRetry={() => refetchGameLog()}
            compact
          />
        ) : gameLogData ? (
          <StatSummaryBar
            basicStats={basicStats}
            rollingStats={gameLogData.rolling}
            activeWindow={activeWindow}
          />
        ) : (
          <StatBarSkeleton />
        )}
      </FadeOnChange>

      {/* Row 3: Two-column layout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* Left column: Court (~60%) */}
        <div className="lg:col-span-3">
          <div className="rounded-xl bg-card p-1 sm:p-4">
            {shotsError ? (
              <ErrorState
                section="shot chart"
                onRetry={() => refetchShots()}
              />
            ) : (
              <CourtCanvas
                shots={shotData?.shots ?? []}
                zoneSummary={shotData?.zoneSummary ?? []}
                loading={shotsLoading}
                playerName={player.fullName}
              />
            )}
          </div>
        </div>

        {/* Right column: Radar, Form Tracker, Advanced Stats (~40%) */}
        <div className="space-y-4 md:col-span-1 lg:col-span-2">
          {/* Radar Chart */}
          {radarError ? (
            <ErrorState
              section="player radar"
              onRetry={() => refetchRadar()}
              compact
            />
          ) : radarLoading || !radarData ? (
            <SkeletonBlock className="h-[350px]" />
          ) : (
            <PlayerRadarChart radarData={radarData} />
          )}

          {/* Form Tracker */}
          <FadeOnChange triggerKey={activeWindow}>
            {gameLogError ? (
              <ErrorState
                section="game log"
                onRetry={() => refetchGameLog()}
                compact
              />
            ) : gameLogLoading || !gameLogData ? (
              <SkeletonBlock className="h-[280px]" />
            ) : (
              <FormTracker
                games={gameLogData.games}
                activeWindow={activeWindow}
              />
            )}
          </FadeOnChange>

          {/* Advanced Stats Table */}
          <AdvancedStatsTable
            advancedStats={advancedStats}
            percentiles={percentiles}
          />
        </div>
      </div>
    </div>
  );
}
