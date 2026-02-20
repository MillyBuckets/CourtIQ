import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/queries";
import type { PlayerSearchResponse } from "@/types";

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function usePlayerSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  return useQuery<PlayerSearchResponse, ApiError>({
    queryKey: ["playerSearch", debouncedQuery],
    queryFn: () =>
      apiFetch<PlayerSearchResponse>(
        `/api/players/search?q=${encodeURIComponent(debouncedQuery)}`
      ),
    enabled: debouncedQuery.length >= 2,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}
