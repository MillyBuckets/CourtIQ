"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePlayerSearch } from "@/hooks/usePlayerSearch";
import type { PlayerSearchResult } from "@/types";

// ============================================================
// Component
// ============================================================

export default function PlayerSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = usePlayerSearch(query);
  const players = data?.players ?? [];
  const showDropdown = open && query.trim().length >= 2;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(-1);
  }, [players.length]);

  const navigateToPlayer = useCallback(
    (slug: string) => {
      setOpen(false);
      setQuery("");
      router.push(`/player/${slug}`);
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, players.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && players[activeIndex]) {
        navigateToPlayer(players[activeIndex].slug);
      } else if (players.length > 0) {
        navigateToPlayer(players[0].slug);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      {/* Search input */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search for any NBA player..."
          className="w-full rounded-lg border border-[#334155] bg-[#0F0F23] py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-secondary/60 outline-none transition-colors focus:border-court-accent"
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-autocomplete="list"
        />
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-[#334155] bg-card shadow-lg shadow-black/30"
          role="listbox"
        >
          {isLoading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-text-secondary">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-secondary [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-secondary [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-secondary [animation-delay:300ms]" />
              </span>
              Searching
            </div>
          )}

          {!isLoading && players.length === 0 && (
            <div className="px-4 py-3 text-sm text-text-secondary">
              No players found
            </div>
          )}

          {!isLoading &&
            players.map((player, index) => (
              <SearchResult
                key={player.nbaPlayerId}
                player={player}
                isActive={index === activeIndex}
                onClick={() => navigateToPlayer(player.slug)}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Result row
// ============================================================

function SearchResult({
  player,
  isActive,
  onClick,
}: {
  player: PlayerSearchResult;
  isActive: boolean;
  onClick: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      role="option"
      aria-selected={isActive}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        isActive
          ? "bg-court-accent-alt/30"
          : "hover:bg-court-secondary/60"
      }`}
    >
      {/* Headshot */}
      {player.headshotUrl && !imgFailed ? (
        <Image
          src={player.headshotUrl}
          alt={player.fullName}
          width={32}
          height={32}
          loading="lazy"
          className="h-8 w-8 rounded-full bg-court-secondary object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-court-secondary">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-4 w-4 text-text-secondary"
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

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text-primary">
          {player.fullName}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          {player.teamAbbr && <span>{player.teamAbbr}</span>}
          {player.teamAbbr && player.position && (
            <span className="text-text-secondary/40">·</span>
          )}
          {player.position && <span>{player.position}</span>}
        </div>
      </div>
    </button>
  );
}
