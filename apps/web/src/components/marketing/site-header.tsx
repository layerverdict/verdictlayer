"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { VerdictLogo } from "@/components/verdict/logo";
import { cn } from "@/lib/utils";

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 z-50 w-full border-b transition-[background-color,backdrop-filter,box-shadow] duration-500",
        scrolled
          ? "border-white/[0.12] bg-white/[0.06] shadow-[0_4px_40px_rgba(0,0,0,0.4)] backdrop-blur-2xl saturate-150"
          : "border-transparent bg-transparent",
      )}
    >
      <div
        className={cn(
          "absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent transition-opacity duration-500",
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />

      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <VerdictLogo className="text-white" />
            <span className="text-xl font-semibold tracking-tight text-white">
              Verdict
            </span>
          </Link>
        </div>

        <div className="hidden items-center gap-10 text-sm font-medium text-white/60 md:flex">
          <a href="#how-it-works" className="transition-colors duration-200 hover:text-white">
            How it works
          </a>
          <a href="#features" className="transition-colors duration-200 hover:text-white">
            Features
          </a>
          <a href="#use-cases" className="transition-colors duration-200 hover:text-white">
            Use cases
          </a>
          <a
            href="https://github.com/qvkare/verdict"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-200 hover:text-white"
          >
            GitHub
          </a>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/escrow"
            className="hidden text-sm font-medium text-white/60 transition-colors duration-200 hover:text-white sm:block"
          >
            Launch App
          </Link>
          <Link
            href="/escrow"
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all duration-200 hover:bg-white/90"
          >
            Open a case
          </Link>
        </div>
      </div>
    </nav>
  );
}
