import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/queries";
import type { PlayerProfileResponse } from "@/types";

export function usePlayerProfile(slug: string) {
  return useQuery<PlayerProfileResponse, ApiError>({
    queryKey: ["player", slug],
    queryFn: () => apiFetch<PlayerProfileResponse>(`/api/players/${slug}`),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
