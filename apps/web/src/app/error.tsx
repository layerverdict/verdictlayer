"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("verdict: root error", error);
  }, [error]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 py-20 text-white">
      <div className="pointer-events-none absolute inset-0 grid-pattern opacity-40" />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-sm">
        <h1 className="mb-2 text-xl font-semibold tracking-tight">
          Something broke
        </h1>
        <p className="mb-6 text-sm text-white/50">
          {error.message || "An unexpected error occurred."}
          {error.digest ? (
            <span className="mt-2 block font-mono text-xs text-white/30">
              digest: {error.digest}
            </span>
          ) : null}
        </p>
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
