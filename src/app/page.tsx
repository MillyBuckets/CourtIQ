"use client";

import React, { useState } from "react";
import PlayerSearch from "@/components/layout/PlayerSearch";
import PlayerCard from "@/components/ui/PlayerCard";
import ErrorState from "@/components/ui/ErrorState";
import { useLeaders } from "@/hooks/useLeaders";

// ============================================================
// Stat categories for the Top Performers tab bar
// ============================================================

const STAT_TABS = [
  { key: "pts", label: "PPG" },
  { key: "ast", label: "APG" },
  { key: "reb", label: "RPG" },
  { key: "fg3m", label: "3PM" },
] as const;

type StatKey = (typeof STAT_TABS)[number]["key"];

// Human-readable label for the stat value
const STAT_VALUE_LABELS: Record<StatKey, string> = {
  pts: "PPG",
  ast: "APG",
  reb: "RPG",
  fg3m: "3PM",
};

// ============================================================
// Skeleton for leader cards while loading
// ============================================================

function LeaderCardSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-4 rounded-xl bg-card p-4">
      <div className="h-16 w-16 shrink-0 rounded-full bg-court-secondary" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-28 rounded bg-court-secondary" />
        <div className="h-3 w-16 rounded bg-court-secondary" />
      </div>
      <div className="space-y-1 text-right">
        <div className="h-5 w-10 rounded bg-court-secondary" />
        <div className="h-2 w-8 rounded bg-court-secondary" />
      </div>
    </div>
  );
}

// ============================================================
// Top Performers section
// ============================================================

function TopPerformers() {
  const [activeStat, setActiveStat] = useState<StatKey>("pts");
  const { data, isLoading, error, refetch } = useLeaders(activeStat, 8);
  const leaders = data?.leaders ?? [];

  return (
    <section className="w-full">
      <h2 className="mb-4 text-lg font-bold text-text-primary">
        Top Performers
      </h2>

      {/* Tab bar */}
      <div className="mb-4 flex gap-1 rounded-lg bg-court-secondary/50 p-1">
        {STAT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveStat(tab.key)}
            className={`flex-1 rounded-md px-3 py-3 text-xs font-semibold transition-colors sm:py-1.5 ${
              activeStat === tab.key
                ? "bg-court-accent text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Leader cards grid */}
      {error ? (
        <ErrorState
          section="top performers"
          onRetry={() => refetch()}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <LeaderCardSkeleton key={i} />
              ))
            : leaders.map((leader, i) => (
                <div
                  key={leader.nbaPlayerId}
                  className="animate-card-enter"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <PlayerCard
                    player={{
                      slug: leader.slug,
                      fullName: leader.fullName,
                      teamAbbr: leader.teamAbbr,
                      position: leader.position,
                      headshotUrl: leader.headshotUrl,
                    }}
                    highlightStat={{
                      label: STAT_VALUE_LABELS[activeStat],
                      value: leader.value.toFixed(1),
                    }}
                  />
                </div>
              ))}
        </div>
      )}

      {/* Empty state — no data in DB yet */}
      {!isLoading && !error && leaders.length === 0 && (
        <div className="rounded-xl border border-[#334155] bg-card px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">
            No leader data available yet. Data will populate once the pipeline
            runs.
          </p>
        </div>
      )}
    </section>
  );
}

// ============================================================
// Home Page
// ============================================================

export default function Home() {
  return (
    <main className="animate-page-enter mx-auto max-w-7xl px-4 py-10 lg:px-6">
      {/* Hero */}
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          <span className="text-court-accent">Court</span>
          <span className="text-text-primary">IQ</span>
        </h1>
        <p className="max-w-lg text-base text-text-secondary">
          NBA Player Analytics &amp; Shot Charts
        </p>

        {/* Prominent search */}
        <div className="w-full max-w-xl">
          <PlayerSearch />
        </div>
      </div>

      {/* Top Performers */}
      <div className="mt-12">
        <TopPerformers />
      </div>
    </main>
  );
}
