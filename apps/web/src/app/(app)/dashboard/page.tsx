"use client";

import Link from "next/link";
import useSWR from "swr";
import { useReadContracts } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AssertionRowCard, type AssertionRow } from "@/components/verdict/assertion-row";
import { EmptyState } from "@/components/verdict/empty-state";
import { Counter, Stagger } from "@/components/verdict/motion";
import { PageHeader } from "@/components/verdict/page-header";
import { fetcher } from "@/lib/api";
import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { cn } from "@/lib/utils";

type AppKey = "escrow" | "insurance" | "milestones" | "authenticity";

const APP_META: Record<
  AppKey,
  {
    label: string;
    description: string;
    href: string;
    newHref: string;
    totalFn: string;
  }
> = {
  escrow: {
    label: "Escrow cases",
    description: "Funds locked against a scope — disputed or delivered.",
    href: "/escrow",
    newHref: "/escrow/new",
    totalFn: "totalEscrows",
  },
  insurance: {
    label: "Insurance policies",
    description: "Collateralised payouts waiting on a parametric trigger.",
    href: "/insurance",
    newHref: "/insurance/new",
    totalFn: "totalPolicies",
  },
  milestones: {
    label: "DAO grants",
    description: "Milestone vaults releasing slices on verified evidence.",
    href: "/milestones",
    newHref: "/milestones/new",
    totalFn: "totalGrants",
  },
  authenticity: {
    label: "Authenticity checks",
    description: "Assets matched against their canonical reference.",
    href: "/authenticity",
    newHref: "/authenticity",
    totalFn: "totalChecks",
  },
};

export default function DashboardPage() {
  const escrowAddress = maybeContractAddress("escrow");
  const insuranceAddress = maybeContractAddress("parametricInsurance");
  const milestoneAddress = maybeContractAddress("milestoneVault");
  const authenticityAddress = maybeContractAddress("authenticityCertifier");

  // Batched totals read. undefined addresses are filtered from the
  // contracts list and handled gracefully by useReadContracts.
  const contracts: Array<{
    address: `0x${string}`;
    abi: typeof abis[keyof typeof abis];
    functionName: string;
  }> = [];
  if (escrowAddress)
    contracts.push({
      address: escrowAddress,
      abi: abis.escrow,
      functionName: APP_META.escrow.totalFn,
    });
  if (insuranceAddress)
    contracts.push({
      address: insuranceAddress,
      abi: abis.parametricInsurance,
      functionName: APP_META.insurance.totalFn,
    });
  if (milestoneAddress)
    contracts.push({
      address: milestoneAddress,
      abi: abis.milestoneVault,
      functionName: APP_META.milestones.totalFn,
    });
  if (authenticityAddress)
    contracts.push({
      address: authenticityAddress,
      abi: abis.authenticityCertifier,
      functionName: APP_META.authenticity.totalFn,
    });

  const { data: totals, isLoading } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0 },
  });

  const appData: Record<AppKey, { count: number | null; deployed: boolean }> = {
    escrow: { count: null, deployed: Boolean(escrowAddress) },
    insurance: { count: null, deployed: Boolean(insuranceAddress) },
    milestones: { count: null, deployed: Boolean(milestoneAddress) },
    authenticity: { count: null, deployed: Boolean(authenticityAddress) },
  };
  const order: AppKey[] = ["escrow", "insurance", "milestones", "authenticity"];
  const deployedApps = order.filter((k) => appData[k].deployed);
  deployedApps.forEach((app, i) => {
    const res = totals?.[i];
    if (res && res.status === "success") {
      appData[app].count = Number(res.result as unknown as bigint);
    }
  });

  const assertions = useSWR<{ assertions: AssertionRow[] }>(
    `/api/assertions?limit=8`,
    fetcher,
  );

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

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {order.map((key) => (
          <AppStatCard
            key={key}
            appKey={key}
            count={appData[key].count}
            deployed={appData[key].deployed}
            loading={isLoading && appData[key].deployed}
          />
        ))}
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Latest assertions
            </h2>
            <Button variant="ghost" asChild size="sm">
              <Link href="/history">View all</Link>
            </Button>
          </div>
          {assertions.error ? (
            <Card>
              <CardHeader>
                <CardTitle>API offline</CardTitle>
                <CardDescription>
                  {(assertions.error as Error).message}.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : assertions.isLoading ? (
            <div className="grid gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (assertions.data?.assertions?.length ?? 0) === 0 ? (
            <EmptyState
              title="No assertions yet"
              description="As soon as an app opens a case, it shows up here — streamed from the on-chain indexer."
            />
          ) : (
            <div className="grid gap-3">
              {assertions.data!.assertions.map((row) => (
                <AssertionRowCard key={row.id} row={row} />
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Judge reputation</CardTitle>
              <CardDescription>
                The three-of-three track record for every TEE judge that's
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
              {order.map((key) => (
                <Button
                  key={key}
                  variant="ghost"
                  asChild
                  className={cn(
                    "w-full justify-between",
                    !appData[key].deployed && "pointer-events-none opacity-40",
                  )}
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
        </aside>
      </div>
    </div>
  );
}

function AppStatCard({
  appKey,
  count,
  deployed,
  loading,
}: {
  appKey: AppKey;
  count: number | null;
  deployed: boolean;
  loading: boolean;
}) {
  const meta = APP_META[appKey];
  return (
    <Link href={meta.href} className="group block">
      <Card className="transition-colors group-hover:border-white/20 group-hover:bg-white/[0.07]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{meta.label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            {loading ? (
              <Skeleton className="h-9 w-16" />
            ) : !deployed || count === null ? (
              <span className="font-mono text-4xl font-medium tracking-tight text-white">
                —
              </span>
            ) : (
              <Counter
                value={count}
                className="font-mono text-4xl font-medium tracking-tight text-white"
              />
            )}
            {!deployed ? (
              <Badge variant="warning" className="mb-1">
                not deployed
              </Badge>
            ) : null}
          </div>
          <p className="text-xs font-light text-white/50">{meta.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
