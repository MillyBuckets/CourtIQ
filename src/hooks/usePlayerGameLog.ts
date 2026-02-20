import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/queries";
import type { GameLogResponse } from "@/types";

export function usePlayerGameLog(slug: string, season: string) {
  return useQuery<GameLogResponse, ApiError>({
    queryKey: ["gameLog", slug, season],
    queryFn: () =>
      apiFetch<GameLogResponse>(
        `/api/players/${slug}/game-log?season=${season}`
      ),
    enabled: !!slug && !!season,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}
