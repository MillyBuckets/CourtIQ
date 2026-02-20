import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Providers from "./providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CourtIQ — NBA Player Analytics & Shot Charts",
    template: "%s", // child pages set full title via generateMetadata
  },
  description:
    "Explore interactive shot charts, advanced stats, and performance analytics for every NBA player. Free and updated daily.",
  openGraph: {
    type: "website",
    siteName: "CourtIQ",
    title: "CourtIQ — NBA Player Analytics & Shot Charts",
    description:
      "Explore interactive shot charts, advanced stats, and performance analytics for every NBA player. Free and updated daily.",
  },
  twitter: {
    card: "summary",
    title: "CourtIQ — NBA Player Analytics & Shot Charts",
    description:
      "Explore interactive shot charts, advanced stats, and performance analytics for every NBA player. Free and updated daily.",
  },
  // TODO: Add dynamic sitemap generation at src/app/sitemap.ts once player
  // count grows and pages are publicly indexed. Use generateSitemaps() to
  // enumerate all /player/[slug] routes from the `players` table.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <Providers>
          <div className="flex min-h-screen flex-col bg-court-primary">
            <Header />
            <div className="flex-1">{children}</div>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
