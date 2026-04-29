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
import { listPolicies, type PolicyRow } from "@/lib/api-server";
import {
  POLICY_STATUS_LABEL,
  decodePolicyStatusLabel,
} from "@/lib/web3/insurance";

export const dynamic = "force-dynamic";

interface SearchParams {
  mine?: string;
  account?: string;
}

export default async function InsuranceListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const account = sp.mine === "1" && sp.account ? sp.account : undefined;

  let rows: PolicyRow[] = [];
  let error: string | null = null;
  try {
    const res = await listPolicies({ limit: 50, account });
    rows = res.policies;
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Insurance"
        title="Parametric Insurance"
        description="Issue a policy, lock a payout, and let the judge verify the trigger condition from oracle evidence. Claims settle in seconds — no adjuster, no paperwork."
        action={
          <Button asChild>
            <Link href="/insurance/new">Underwrite policy</Link>
          </Button>
        }
      />

      <OwnToggle active={Boolean(account)} />

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Indexer catching up</CardTitle>
            <CardDescription>
              Policy list is temporarily unavailable ({error}).
            </CardDescription>
          </CardHeader>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No policies yet"
          description="Underwrite a policy to lock a payout against a parametric trigger. Holders claim the moment evidence lands on-chain."
          action={
            <Button asChild>
              <Link href="/insurance/new">Underwrite policy</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => (
            <PolicyListRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyListRow({ row }: { row: PolicyRow }) {
  const statusEnum = decodePolicyStatusLabel(row.status);
  return (
    <Link href={`/insurance/${row.id}`} className="group block">
      <Card className="transition-colors group-hover:border-white/20 group-hover:bg-white/[0.07]">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">Policy #{row.id}</CardTitle>
              <Badge variant="outline">{POLICY_STATUS_LABEL[statusEnum]}</Badge>
            </div>
            <CardDescription className="line-clamp-2 max-w-xl">
              {row.condition || "No trigger specified"}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg text-white">
              {formatAmount(BigInt(row.payout))} 0G
            </div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-white/40">
              Premium {formatAmount(BigInt(row.premium))} 0G
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 pt-0 text-xs text-white/50">
          <span>
            Insurer{" "}
            <span className="font-mono text-white/70">
              {truncateAddress(row.insurer as `0x${string}`, 4)}
            </span>
          </span>
          <span>
            Holder{" "}
            <span className="font-mono text-white/70">
              {truncateAddress(row.holder as `0x${string}`, 4)}
            </span>
          </span>
          <span>
            Coverage{" "}
            <span className="font-mono text-white/70">
              {formatTimestamp(new Date(row.coverageStart).getTime())} →{" "}
              {formatTimestamp(new Date(row.coverageEnd).getTime())}
            </span>
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
