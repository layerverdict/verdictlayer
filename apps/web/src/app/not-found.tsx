import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-black px-6 py-20 text-center text-white">
      <div className="pointer-events-none absolute inset-0 grid-pattern opacity-40" />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <span className="font-mono text-8xl font-light tracking-tighter text-white/30">
          404
        </span>
        <p className="max-w-md text-white/50">
          This page is off-chain. Head back to the home page to pick up an app.
        </p>
        <Button asChild>
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </main>
  );
}
