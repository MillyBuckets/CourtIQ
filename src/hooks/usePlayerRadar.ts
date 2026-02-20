import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/queries";
import type { RadarResponse } from "@/types";

export function usePlayerRadar(slug: string, season: string) {
  return useQuery<RadarResponse, ApiError>({
    queryKey: ["radar", slug, season],
    queryFn: () =>
      apiFetch<RadarResponse>(
        `/api/players/${slug}/radar?season=${season}`
      ),
    enabled: !!slug && !!season,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
