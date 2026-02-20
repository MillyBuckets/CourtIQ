export default function Footer() {
  return (
    <footer className="border-t border-[#334155]/50 bg-court-primary">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-text-secondary sm:flex-row lg:px-6">
        <p>
          Data provided by{" "}
          <a
            href="https://www.nba.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-court-accent transition-colors hover:text-court-accent/80"
          >
            NBA.com
          </a>{" "}
          via nba_api. Not affiliated with the NBA.
        </p>
        <p className="text-text-secondary/60">
          Updated daily at 6 AM ET &middot; CourtIQ &copy;{" "}
          {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
