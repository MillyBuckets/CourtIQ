"use client";

import React, { useState } from "react";
import Image from "next/image";
import type { PlayerProfileResponse, WindowSelection } from "@/types";

// ============================================================
// Types
// ============================================================

type Player = PlayerProfileResponse["player"];

interface PlayerHeaderProps {
  player: Player;
  currentSeason: string;
  availableSeasons: string[];
  activeWindow: WindowSelection;
  onSeasonChange: (season: string) => void;
  onWindowChange: (window: WindowSelection) => void;
}

// ============================================================
// Window Toggle (segmented control)
// ============================================================

const WINDOW_OPTIONS: { value: WindowSelection; label: string }[] = [
  { value: "season", label: "Season" },
  { value: "last10", label: "Last 10" },
  { value: "last5", label: "Last 5" },
];

function WindowToggle({
  active,
  onChange,
}: {
  active: WindowSelection;
  onChange: (w: WindowSelection) => void;
}) {
  return (
    <div className="flex rounded-lg bg-court-primary p-0.5">
      {WINDOW_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`min-h-[44px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0 ${
            active === opt.value
              ? "bg-court-accent text-white"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Headshot with fallback
// ============================================================

function PlayerHeadshot({
  url,
  name,
}: {
  url: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-court-secondary sm:h-[80px] sm:w-[80px]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-8 w-8 text-text-secondary sm:h-10 sm:w-10"
        >
          <circle cx="12" cy="8" r="4" fill="currentColor" />
          <path
            d="M4 20c0-3.3 2.7-6 6-6h4c3.3 0 6 2.7 6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={name}
      width={80}
      height={80}
      priority
      className="h-[60px] w-[60px] rounded-full bg-court-secondary object-cover sm:h-[80px] sm:w-[80px]"
      onError={() => setFailed(true)}
    />
  );
}

// ============================================================
// Component
// ============================================================

export default function PlayerHeader({
  player,
  currentSeason,
  availableSeasons,
  activeWindow,
  onSeasonChange,
  onWindowChange,
}: PlayerHeaderProps) {
  return (
    <div className="rounded-xl bg-card px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Headshot + Player info */}
        <div className="flex items-center gap-4">
          <PlayerHeadshot url={player.headshotUrl} name={player.fullName} />

          <div>
            <h1 className="text-xl font-bold text-text-primary sm:text-2xl">
              {player.fullName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              {player.teamAbbr && (
                <span className="rounded bg-court-accent-alt/40 px-1.5 py-0.5 text-xs font-medium text-text-primary">
                  {player.teamAbbr}
                </span>
              )}
              {player.teamName && <span>{player.teamName}</span>}
              {player.position && (
                <>
                  <span className="text-text-secondary/40">|</span>
                  <span>{player.position}</span>
                </>
              )}
              {player.jerseyNumber && (
                <>
                  <span className="text-text-secondary/40">|</span>
                  <span>#{player.jerseyNumber}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Season selector + Window toggle */}
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
          <select
            value={currentSeason}
            onChange={(e) => onSeasonChange(e.target.value)}
            className="min-h-[44px] rounded-md border border-[#334155] bg-court-secondary px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors focus:border-court-accent sm:min-h-0"
          >
            {availableSeasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <WindowToggle active={activeWindow} onChange={onWindowChange} />
        </div>
      </div>
    </div>
  );
}
