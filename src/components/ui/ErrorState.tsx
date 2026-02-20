"use client";

import React from "react";

// ============================================================
// Reusable error UI for any section that fails to load.
// Shows a clean message + optional retry button.
// ============================================================

interface ErrorStateProps {
  /** Human-readable section name, e.g. "shot chart" */
  section: string;
  /** Called when the user clicks "Try again" */
  onRetry?: () => void;
  /** Render as a compact inline block (no min-height) */
  compact?: boolean;
}

export default function ErrorState({
  section,
  onRetry,
  compact = false,
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-[#334155] bg-card px-4 text-center ${
        compact ? "py-6" : "py-10"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-8 w-8 text-text-secondary"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M12 8v4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
      </svg>

      <p className="text-sm text-text-secondary">
        Unable to load {section}. Please try again.
      </p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-lg bg-court-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-court-accent/80"
        >
          Try again
        </button>
      )}
    </div>
  );
}
