import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/queries";
import type { ShotChartResponse } from "@/types";

export function usePlayerShots(
  slug: string,
  season: string,
  lastN: number | null
) {
  const params = new URLSearchParams({ season });
  if (lastN) params.set("last_n", String(lastN));

  return useQuery<ShotChartResponse, ApiError>({
    queryKey: ["shots", slug, season, lastN],
    queryFn: () =>
      apiFetch<ShotChartResponse>(`/api/players/${slug}/shots?${params}`),
    enabled: !!slug && !!season,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
