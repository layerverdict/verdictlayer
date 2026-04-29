import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/verdict/empty-state";
import { PageHeader } from "@/components/verdict/page-header";
import { AssertionRowCard, type AssertionRow } from "@/components/verdict/assertion-row";
import {
  listAssertions,
  type AssertionListRow,
} from "@/lib/api-server";
import { appSlugForCallback, type AppSlug } from "@/lib/web3/routing";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

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

function parseOutcome(raw: string | undefined): Outcome {
  return (OUTCOMES as string[]).includes(raw ?? "") ? (raw as Outcome) : "ALL";
}
function parseApp(raw: string | undefined): AppFilter {
  return (APPS as string[]).includes(raw ?? "") ? (raw as AppFilter) : "ALL";
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string; app?: string }>;
}) {
  const sp = await searchParams;
  const outcome = parseOutcome(sp.outcome);
  const app = parseApp(sp.app);

  let rows: AssertionListRow[] = [];
  let error: string | null = null;
  try {
    const res = await listAssertions({
      limit: 200,
      outcome: outcome === "ALL" ? undefined : outcome,
    });
    rows = res.assertions;
  } catch (err) {
    error = (err as Error).message;
  }

  // App filter is a client-side JOIN on callback → app — cheap to do
  // here since we've already got the list in memory.
  const filtered = rows.filter(
    (row) => app === "ALL" || appSlugForCallback(row.callback) === app,
  );

  const buildHref = (nextOutcome: Outcome, nextApp: AppFilter) => {
    const params: string[] = [];
    if (nextOutcome !== "ALL") params.push(`outcome=${nextOutcome}`);
    if (nextApp !== "ALL") params.push(`app=${nextApp}`);
    return params.length ? `/history?${params.join("&")}` : "/history";
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Protocol · History"
        title="Assertion history"
        description="Every assertion the indexer has mirrored, across the four applications. Filter by outcome or app."
      />

      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
          <span className="px-2 font-mono text-[10px] uppercase tracking-widest text-white/40">
            App
          </span>
          {APPS.map((a) => (
            <Link
              key={a}
              href={buildHref(outcome, a)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                app === a
                  ? "bg-white text-black"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {APP_LABEL_FILTER[a]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
          <span className="px-2 font-mono text-[10px] uppercase tracking-widest text-white/40">
            Outcome
          </span>
          {OUTCOMES.map((o) => (
            <Link
              key={o}
              href={buildHref(o, app)}
              className={cn(
                "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                outcome === o
                  ? "bg-white text-black"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {o}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Indexer catching up</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No assertions match the filters"
          description="Try a wider outcome or switch to All apps."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{filtered.length} results</Badge>
            {outcome !== "ALL" ? <Badge variant="outline">{outcome}</Badge> : null}
            {app !== "ALL" ? (
              <Badge variant="outline">{APP_LABEL_FILTER[app]}</Badge>
            ) : null}
          </div>
          <div className="grid gap-3">
            {filtered.map((row) => (
              <AssertionRowCard key={row.id} row={row as unknown as AssertionRow} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
