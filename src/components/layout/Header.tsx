"use client";

import React, { useState } from "react";
import Link from "next/link";
import PlayerSearch from "./PlayerSearch";

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#334155]/50 bg-court-primary/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold text-text-primary transition-colors hover:text-court-accent"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-6 w-6 text-court-accent"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M12 2C12 2 12 22 12 22"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M2 12C2 12 22 12 22 12"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M4.93 4.93C8 8 12 12 12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M19.07 19.07C16 16 12 12 12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          CourtIQ
        </Link>

        {/* Desktop search bar */}
        <div className="hidden w-72 sm:block lg:w-80">
          <PlayerSearch />
        </div>

        {/* Mobile search icon / overlay */}
        <button
          type="button"
          onClick={() => setSearchOpen(!searchOpen)}
          className="rounded-lg p-3 text-text-secondary transition-colors hover:bg-court-secondary hover:text-text-primary sm:hidden"
          aria-label="Toggle search"
        >
          {searchOpen ? (
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile search dropdown */}
      {searchOpen && (
        <div className="border-t border-[#334155]/50 px-4 py-3 sm:hidden">
          <PlayerSearch />
        </div>
      )}
    </header>
  );
}
