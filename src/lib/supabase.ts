import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

// ============================================================
// Anon client — safe for client-side / public usage
// Uses the publishable NEXT_PUBLIC_SUPABASE_ANON_KEY
// ============================================================

let _supabase: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
    }
    _supabase = createClient<Database>(url, key);
  }
  return _supabase;
}

/** Lazy-initialized anon client for client-side usage. */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string, unknown>)[prop as string];
  },
});

// ============================================================
// Server client — uses SUPABASE_SERVICE_ROLE_KEY
// Only import this in server-side code (API routes, server components)
// ============================================================

let _supabaseServer: SupabaseClient<Database> | null = null;

function getSupabaseServer(): SupabaseClient<Database> {
  if (!_supabaseServer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }
    _supabaseServer = createClient<Database>(url, key);
  }
  return _supabaseServer;
}

/** Lazy-initialized server client for API routes & server components. */
export const supabaseServer = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    return (getSupabaseServer() as unknown as Record<string, unknown>)[
      prop as string
    ];
  },
});
