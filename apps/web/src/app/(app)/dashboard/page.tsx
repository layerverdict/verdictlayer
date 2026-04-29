import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AssertionRowCard, type AssertionRow } from "@/components/verdict/assertion-row";
import { EmptyState } from "@/components/verdict/empty-state";
import { PageHeader } from "@/components/verdict/page-header";
import { DashboardIsland } from "@/components/verdict/dashboard-island";
import {
  getDashboardStats,
  type DashboardStats,
} from "@/lib/api-server";
import { cn } from "@/lib/utils";

type AppKey = "escrow" | "insurance" | "milestones" | "authenticity";

const APP_META: Record<
  AppKey,
  {
    label: string;
    description: string;
    href: string;
    newHref: string;
  }
> = {
  escrow: {
    label: "Escrow cases",
    description: "Funds locked against a scope — disputed or delivered.",
    href: "/escrow",
    newHref: "/escrow/new",
  },
  insurance: {
    label: "Insurance policies",
    description: "Collateralised payouts waiting on a parametric trigger.",
    href: "/insurance",
    newHref: "/insurance/new",
  },
  milestones: {
    label: "DAO grants",
    description: "Milestone vaults releasing slices on verified evidence.",
    href: "/milestones",
    newHref: "/milestones/new",
  },
  authenticity: {
    label: "Authenticity checks",
    description: "Assets matched against their canonical reference.",
    href: "/authenticity",
    newHref: "/authenticity",
  },
};

const ORDER: AppKey[] = ["escrow", "insurance", "milestones", "authenticity"];

export default async function DashboardPage() {
  // RSC path: pull the mirror's aggregates + latest assertions server-side,
  // so the HTML already carries the numbers by the time it reaches the
  // browser. Revalidate every 5s via the api-server cache tags.
  let stats: DashboardStats | null = null;
  let error: string | null = null;
  try {
    stats = await getDashboardStats();
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Protocol · Dashboard"
        title="Across every app"
        description="Live totals from each application contract plus the latest assertions the indexer has mirrored from chain."
        action={
          <Button variant="ghost" asChild>
            <Link href="/history">Full history</Link>
          </Button>
        }
      />

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Indexer catching up</CardTitle>
            <CardDescription>
              The dashboard API is temporarily unavailable ({error}). Numbers
              will appear as soon as the indexer backfills.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <DashboardIsland
        initialStats={stats}
        cards={ORDER.map((key) => ({
          key,
          label: APP_META[key].label,
          description: APP_META[key].description,
          href: APP_META[key].href,
        }))}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Latest assertions</h2>
            <Button variant="ghost" asChild size="sm">
              <Link href="/history">View all</Link>
            </Button>
          </div>
          {!stats || stats.latestAssertions.length === 0 ? (
            <EmptyState
              title="No assertions yet"
              description="As soon as an app opens a case, it shows up here — streamed from the on-chain indexer."
            />
          ) : (
            <div className="grid gap-3">
              {stats.latestAssertions.map((a) => (
                <AssertionRowCard key={a.id} row={a as AssertionRow} />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Judge reputation</CardTitle>
              <CardDescription>
                The three-of-three track record for every TEE judge that&apos;s
                adjudicated on-chain.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild className="w-full">
                <Link href="/judges">Browse judges</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open a case</CardTitle>
              <CardDescription>
                Pick the application whose callback matches your flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {ORDER.map((key) => (
                <Button
                  key={key}
                  variant="ghost"
                  asChild
                  className={cn("w-full justify-between")}
                >
                  <Link href={APP_META[key].newHref}>
                    <span>{APP_META[key].label.split(" ")[0]}</span>
                    <span className="font-mono text-[11px] text-white/40">
                      new →
                    </span>
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
          {stats ? (
            <Card>
              <CardContent className="flex items-center justify-between p-4 text-xs text-white/40">
                <span>Chain</span>
                <Badge variant="outline">chainId {stats.chainId}</Badge>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
