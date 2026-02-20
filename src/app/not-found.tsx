import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="text-6xl">🏀</div>
      <h1 className="text-2xl font-bold text-text-primary">
        Page not found
      </h1>
      <p className="max-w-md text-sm text-text-secondary">
        Head back to the court.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-court-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-court-accent/80"
      >
        Back to Home
      </Link>
    </div>
  );
}
