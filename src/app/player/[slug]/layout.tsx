import type { Metadata } from "next";
import { supabaseServer as supabase } from "@/lib/supabase";
import type { PlayerRow } from "@/types";

// ============================================================
// Dynamic metadata for player pages
// ============================================================

interface LayoutProps {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  // Lightweight query — only fetch what we need for SEO
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("slug", slug)
    .limit(1)
    .single();

  if (error || !data) {
    return {
      title: "Player Not Found | CourtIQ",
      description: "This player could not be found on CourtIQ.",
    };
  }

  const player = data as PlayerRow;
  const name = player.full_name;
  const team = player.team_abbr ?? "";
  const position = player.position ?? "";
  const teamLabel = [team, position].filter(Boolean).join(" · ");

  const title = `${name} Stats & Shot Chart | CourtIQ`;
  const description = `Interactive shot chart, advanced stats, and performance analytics for ${name}${teamLabel ? ` (${teamLabel})` : ""}. Updated daily.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      siteName: "CourtIQ",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default function PlayerLayout({ children }: LayoutProps) {
  return children;
}
