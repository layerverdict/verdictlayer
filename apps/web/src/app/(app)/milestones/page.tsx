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
import { EmptyState } from "@/components/verdict/empty-state";
import { PageHeader } from "@/components/verdict/page-header";
import { OwnToggle } from "@/components/verdict/own-toggle";
import { formatAmount, formatTimestamp, truncateAddress } from "@/lib/format";
import { listGrants, type GrantRow } from "@/lib/api-server";

export const dynamic = "force-dynamic";

interface SearchParams {
  mine?: string;
  account?: string;
}

export default async function MilestonesListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const account = sp.mine === "1" && sp.account ? sp.account : undefined;

  let rows: GrantRow[] = [];
  let error: string | null = null;
  try {
    const res = await listGrants({ limit: 50, account });
    rows = res.grants;
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Milestones"
        title="DAO Milestone Vault"
        description="Pre-approve acceptance criteria once. Grantees submit proof per milestone; the judge verifies, the vault releases the slice. No Snapshot loops."
        action={
          <Button asChild>
            <Link href="/milestones/new">Create grant</Link>
          </Button>
        }
      />

      <OwnToggle active={Boolean(account)} />

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Indexer catching up</CardTitle>
            <CardDescription>
              Grant list is temporarily unavailable ({error}).
            </CardDescription>
          </CardHeader>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No grants yet"
          description="DAOs define milestone criteria + amounts and pre-fund the vault. Grantees submit per-milestone evidence and funds auto-release on verification."
          action={
            <Button asChild>
              <Link href="/milestones/new">Create grant</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => (
            <GrantListRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function GrantListRow({ row }: { row: GrantRow }) {
  const total = BigInt(row.totalAmount);
  const released = BigInt(row.releasedAmount);
  const progress = total > 0n ? Number((released * 100n) / total) : 0;

  return (
    <Link href={`/milestones/${row.id}`} className="group block">
      <Card className="transition-colors group-hover:border-white/20 group-hover:bg-white/[0.07]">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">Grant #{row.id}</CardTitle>
              <Badge variant="outline">
                {row.milestonesReleased}/{row.milestoneCount} released
              </Badge>
            </div>
            <CardDescription className="max-w-xl">
              {formatAmount(released)} / {formatAmount(total)} released ·{" "}
              {truncateAddress(row.token as `0x${string}`, 4)}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg text-white">{progress}%</div>
            <div className="font-mono text-[11px] text-white/40">released</div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/50">
            <span>
              DAO{" "}
              <span className="font-mono text-white/70">
                {truncateAddress(row.dao as `0x${string}`, 4)}
              </span>
            </span>
            <span>
              Grantee{" "}
              <span className="font-mono text-white/70">
                {truncateAddress(row.grantee as `0x${string}`, 4)}
              </span>
            </span>
            <span>
              Expires{" "}
              <span className="font-mono text-white/70">
                {formatTimestamp(new Date(row.grantExpiresAt).getTime())}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
