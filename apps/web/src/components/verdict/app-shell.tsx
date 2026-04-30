"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LoginButton } from "./login-button";
import { VerdictLogo } from "./logo";
import { cn } from "@/lib/utils";

type NavIconName =
  | "dashboard"
  | "escrow"
  | "insurance"
  | "milestone"
  | "authenticity"
  | "judges"
  | "history";

type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/escrow", label: "Escrow", icon: "escrow" },
  { href: "/insurance", label: "Insurance", icon: "insurance" },
  { href: "/milestones", label: "Milestones", icon: "milestone" },
  { href: "/authenticity", label: "Authenticity", icon: "authenticity" },
  { href: "/judges", label: "Judges", icon: "judges" },
  { href: "/history", label: "History", icon: "history" },
];

const APPS_SET = new Set<NavIconName>([
  "escrow",
  "insurance",
  "milestone",
  "authenticity",
]);

function NavIcon({ name }: { name: NavIconName }) {
  const base = { className: "h-5 w-5", strokeWidth: 1.5 };
  switch (name) {
    case "dashboard":
      return (
        <svg {...base} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="3" width="8" height="10" rx="1" />
          <rect x="13" y="3" width="8" height="6" rx="1" />
          <rect x="13" y="11" width="8" height="10" rx="1" />
          <rect x="3" y="15" width="8" height="6" rx="1" />
        </svg>
      );
    case "escrow":
      return (
        <svg {...base} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 2 L3 7 v6 c0 5 4 9 9 9 s9-4 9-9 V7 z" strokeLinejoin="round" />
          <path d="M9 12 l2 2 l4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "insurance":
      return (
        <svg {...base} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 2 L4 6 v6 c0 5 3.5 9 8 10 c4.5-1 8-5 8-10 V6 z" strokeLinejoin="round" />
        </svg>
      );
    case "milestone":
      return (
        <svg {...base} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M4 22 V4 l9 3 v7 l7 3 z" strokeLinejoin="round" />
        </svg>
      );
    case "authenticity":
      return (
        <svg {...base} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="9" />
          <path d="M7.5 12 L11 15 L17 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "judges":
      return (
        <svg {...base} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" strokeLinecap="round" />
        </svg>
      );
    case "history":
      return (
        <svg {...base} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7 v5 l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="relative flex min-h-screen flex-col bg-black text-white">
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="flex h-20 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <MobileNav pathname={pathname} />
            <Link href="/" className="flex items-center gap-3">
              <VerdictLogo size={40} className="text-white" />
              <span className="text-xl font-semibold tracking-tight">Verdict Layer</span>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.filter((item) => APPS_SET.has(item.icon)).map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-white/[0.08] text-white"
                      : "text-white/50 hover:bg-white/[0.04] hover:text-white",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <LoginButton />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-white/10 bg-white/[0.02] p-4 md:block">
          <SidebarSection
            label="Overview"
            items={NAV.filter((n) => n.icon === "dashboard")}
            pathname={pathname}
          />
          <SidebarSection
            label="Applications"
            items={NAV.filter((n) => APPS_SET.has(n.icon))}
            pathname={pathname}
          />
          <SidebarSection
            label="Protocol"
            items={NAV.filter((n) => n.icon === "judges" || n.icon === "history")}
            pathname={pathname}
          />
        </aside>

        <main id="main" className="flex-1 overflow-x-hidden" tabIndex={-1}>
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarSection({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  pathname: string | null | undefined;
  onNavigate?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="mb-2 px-3 font-mono text-[10px] uppercase tracking-widest text-white/30">
        {label}
      </div>
      <nav className="space-y-1">
        {items.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-white/[0.08] text-white"
                  : "text-white/50 hover:bg-white/[0.04] hover:text-white",
              )}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function MobileNav({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);

  // Close drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className="md:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:hidden" />
        <DialogPrimitive.Content
          aria-label="Navigation"
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-[#0a0a0a] p-4 shadow-[20px_0_80px_-20px_rgba(0,0,0,0.8)] md:hidden",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-left",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
          )}
        >
          <div className="mb-6 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
              <VerdictLogo size={32} className="text-white" />
              <span className="text-base font-semibold tracking-tight">Verdict Layer</span>
            </Link>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close navigation">
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <div className="flex-1 overflow-y-auto">
            <SidebarSection
              label="Overview"
              items={NAV.filter((n) => n.icon === "dashboard")}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
            <SidebarSection
              label="Applications"
              items={NAV.filter((n) => APPS_SET.has(n.icon))}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
            <SidebarSection
              label="Protocol"
              items={NAV.filter((n) => n.icon === "judges" || n.icon === "history")}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
