"use client";

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Counter, Stagger } from "@/components/verdict/motion";
import type { DashboardStats } from "@/lib/api-server";

interface StatCard {
  key: "escrow" | "insurance" | "milestones" | "authenticity";
  label: string;
  description: string;
  href: string;
}

interface Props {
  initialStats: DashboardStats | null;
  cards: StatCard[];
}

/**
 * Tiny client island — just the stagger + counter animation for the
 * four stat cards. Numbers come pre-rendered from the server, so if
 * JS fails to hydrate the user still sees the right totals.
 */
export function DashboardIsland({ initialStats, cards }: Props) {
  const counts = initialStats?.counts ?? {
    escrows: 0,
    policies: 0,
    grants: 0,
    checks: 0,
  };

  const countFor = (k: StatCard["key"]): number => {
    switch (k) {
      case "escrow":
        return counts.escrows;
      case "insurance":
        return counts.policies;
      case "milestones":
        return counts.grants;
      case "authenticity":
        return counts.checks;
    }
  };

  return (
    <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const n = countFor(card.key);
        return (
          <Link key={card.key} href={card.href} className="group block">
            <Card className="transition-colors group-hover:border-white/20 group-hover:bg-white/[0.07]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{card.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Counter
                  value={n}
                  className="font-mono text-4xl font-medium tracking-tight text-white"
                />
                <p className="text-xs font-light text-white/50">{card.description}</p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </Stagger>
  );
}
