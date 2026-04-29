"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { LoginButton } from "@/components/verdict/login-button";
import { VerdictLogo } from "@/components/verdict/logo";
import { cn } from "@/lib/utils";

const LINKS: Array<{ href: string; label: string; external?: boolean }> = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#use-cases", label: "Use cases" },
  { href: "/architecture", label: "Architecture" },
  { href: "https://github.com/qvkare/verdictlayer", label: "GitHub", external: true },
];

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

      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-3">
          <MarketingMobileNav />
          <Link href="/" className="flex items-center gap-3">
            <VerdictLogo size={40} className="text-white" />
            <span className="text-xl font-semibold tracking-tight text-white">
              Verdict Layer
            </span>
          </Link>
        </div>

        <div className="hidden items-center gap-10 text-sm font-medium text-white/60 md:flex">
          {LINKS.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </Link>
            ),
          )}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="hidden text-sm font-medium text-white/60 transition-colors duration-200 hover:text-white sm:block"
          >
            Launch app
          </Link>
          <LoginButton compact />
        </div>
      </div>
    </nav>
  );
}

function MarketingMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className="md:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-[#0a0a0a] p-6 shadow-[20px_0_80px_-20px_rgba(0,0,0,0.8)] md:hidden",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-left",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
          )}
          aria-label="Navigation"
        >
          <div className="mb-8 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
              <VerdictLogo size={32} className="text-white" />
              <span className="text-base font-semibold tracking-tight">Verdict Layer</span>
            </Link>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close menu">
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <nav className="flex flex-col gap-1 text-sm font-medium">
            {LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
          <div className="mt-auto space-y-2">
            <Link
              href="/escrow"
              onClick={() => setOpen(false)}
              className="block rounded-xl bg-white px-5 py-3 text-center text-sm font-medium text-black hover:bg-white/90"
            >
              Open a case
            </Link>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="block rounded-xl border border-white/20 px-5 py-3 text-center text-sm font-medium text-white/80 hover:border-white/50 hover:text-white"
            >
              Launch app
            </Link>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
