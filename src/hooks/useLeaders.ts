import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/queries";
import type { LeadersResponse } from "@/types";

export function useLeaders(stat: string, limit = 8) {
  return useQuery<LeadersResponse, ApiError>({
    queryKey: ["leaders", stat, limit],
    queryFn: () =>
      apiFetch<LeadersResponse>(
        `/api/leaders?stat=${stat}&limit=${limit}`
      ),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
