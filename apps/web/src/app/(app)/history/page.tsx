"use client";

import useSWR from "swr";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/verdict/empty-state";
import { Stagger } from "@/components/verdict/motion";
import { PageHeader } from "@/components/verdict/page-header";
import { AssertionRowCard, type AssertionRow } from "@/components/verdict/assertion-row";
import { fetcher } from "@/lib/api";
import { appSlugForCallback, type AppSlug } from "@/lib/web3/routing";
import { cn } from "@/lib/utils";

type Outcome = "ALL" | "PENDING" | "TRUE" | "FALSE" | "INVALID" | "ESCALATED";
type AppFilter = "ALL" | AppSlug;

const OUTCOMES: Outcome[] = ["ALL", "PENDING", "TRUE", "FALSE", "INVALID", "ESCALATED"];
const APPS: AppFilter[] = ["ALL", "escrow", "insurance", "milestones", "authenticity"];

const APP_LABEL_FILTER: Record<AppFilter, string> = {
  ALL: "All apps",
  escrow: "Escrow",
  insurance: "Insurance",
  milestones: "Milestones",
  authenticity: "Authenticity",
  unknown: "Unknown",
};

export default function HistoryPage() {
  const [outcome, setOutcome] = useState<Outcome>("ALL");
  const [app, setApp] = useState<AppFilter>("ALL");

  const query = outcome === "ALL" ? "?limit=200" : `?limit=200&outcome=${outcome}`;
  const { data, error, isLoading, mutate } = useSWR<{ assertions: AssertionRow[] }>(
    `/api/assertions${query}`,
    fetcher,
  );

  const rows = (data?.assertions ?? []).filter(
    (row) => app === "ALL" || appSlugForCallback(row.callback) === app,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Protocol · History"
        title="Assertion history"
        description="Every assertion the indexer has mirrored, across the four applications. Filter by outcome or app."
        action={
          <Button variant="ghost" onClick={() => mutate()}>
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
          <span className="px-2 font-mono text-[10px] uppercase tracking-widest text-white/40">
            App
          </span>
          {APPS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setApp(a)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                app === a
                  ? "bg-white text-black"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {APP_LABEL_FILTER[a]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
          <span className="px-2 font-mono text-[10px] uppercase tracking-widest text-white/40">
            Outcome
          </span>
          {OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                outcome === o
                  ? "bg-white text-black"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Couldn&apos;t reach the API</CardTitle>
            <CardDescription>
              {(error as Error).message}. Check{" "}
              <code className="font-mono text-white/70">NEXT_PUBLIC_API_URL</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No assertions match the filters"
          description="Try a wider outcome or switch to All apps."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{rows.length} results</Badge>
            {outcome !== "ALL" ? <Badge variant="outline">{outcome}</Badge> : null}
            {app !== "ALL" ? (
              <Badge variant="outline">{APP_LABEL_FILTER[app]}</Badge>
            ) : null}
          </div>
          <Stagger className="grid gap-3" step={0.03}>
            {rows.map((row) => (
              <AssertionRowCard key={row.id} row={row} />
            ))}
          </Stagger>
        </div>
      )}
    </div>
  );
}
