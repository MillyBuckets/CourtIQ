"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";

// ============================================================
// Types
// ============================================================

interface PlayerCardProps {
  player: {
    slug: string;
    fullName: string;
    teamAbbr: string | null;
    position: string | null;
    headshotUrl: string | null;
  };
  highlightStat: {
    label: string;
    value: string | number;
  };
}

// ============================================================
// Component
// ============================================================

export default function PlayerCard({ player, highlightStat }: PlayerCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <Link
      href={`/player/${player.slug}`}
      className="flex items-center gap-2 rounded-xl border border-transparent bg-card p-3 transition-all duration-200 hover:scale-[1.02] hover:border-[#334155] sm:gap-4 sm:p-4"
    >
      {/* Headshot */}
      {player.headshotUrl && !imgFailed ? (
        <Image
          src={player.headshotUrl}
          alt={player.fullName}
          width={64}
          height={64}
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-full bg-court-secondary object-cover sm:h-16 sm:w-16"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-court-secondary sm:h-16 sm:w-16">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5 text-text-secondary sm:h-7 sm:w-7"
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
      )}

      {/* Player info */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-text-primary">
          {player.fullName}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
          {player.teamAbbr && (
            <span className="rounded bg-court-accent-alt/40 px-1.5 py-0.5 text-[10px] font-medium text-text-primary">
              {player.teamAbbr}
            </span>
          )}
          {player.position && <span>{player.position}</span>}
        </div>
      </div>

      {/* Highlight stat */}
      <div className="shrink-0 text-right">
        <div className="font-mono text-base font-bold text-text-stat sm:text-lg">
          {highlightStat.value}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-text-secondary">
          {highlightStat.label}
        </div>
      </div>
    </Link>
  );
}
