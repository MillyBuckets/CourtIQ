// ============================================================
// CourtIQ — Shared API Fetcher
// Used by all React Query hooks in src/hooks/
// ============================================================

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}
