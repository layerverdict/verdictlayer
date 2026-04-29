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
import { formatAmount, truncateAddress } from "@/lib/format";
import { ESCROW_STATUS_LABEL, decodeEscrowStatusLabel } from "@/lib/web3/escrow";
import { listEscrows, type EscrowRow } from "@/lib/api-server";

export const dynamic = "force-dynamic";

interface SearchParams {
  mine?: string;
  account?: string;
}

export default async function EscrowListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const account = sp.mine === "1" && sp.account ? sp.account : undefined;

  let rows: EscrowRow[] = [];
  let error: string | null = null;
  try {
    const res = await listEscrows({ limit: 50, account });
    rows = res.escrows;
  } catch (err) {
    error = (err as Error).message;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Escrow"
        title="Freelance Escrow"
        description="Lock funds, publish a scope, and let a TEE-attested judge settle disputes in seconds. Every verdict is replayable from on-chain evidence."
        action={
          <Button asChild>
            <Link href="/escrow/new">New escrow</Link>
          </Button>
        }
      />

      <OwnToggle active={Boolean(account)} param="mine" />

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Indexer catching up</CardTitle>
            <CardDescription>
              Escrow list is temporarily unavailable ({error}). It will appear
              as soon as the indexer backfills.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No escrows yet"
          description="Create one to lock funds against a scope. Freelancers get paid on delivery, or dispute gets routed to a TEE judge."
          action={
            <Button asChild>
              <Link href="/escrow/new">Create escrow</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {rows.map((row) => (
            <EscrowListRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function EscrowListRow({ row }: { row: EscrowRow }) {
  const statusEnum = decodeEscrowStatusLabel(row.status);
  const label = ESCROW_STATUS_LABEL[statusEnum];
  return (
    <Link href={`/escrow/${row.id}`} className="group block">
      <Card className="transition-colors group-hover:border-white/20 group-hover:bg-white/[0.07]">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">Escrow #{row.id}</CardTitle>
              <Badge variant="outline">{label}</Badge>
            </div>
            <CardDescription className="line-clamp-2 max-w-xl">
              {row.scope || "No scope provided"}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="font-mono text-lg text-white">
              {formatAmount(BigInt(row.amount))}{" "}
              <span className="text-xs text-white/40">tokens</span>
            </div>
            <div className="font-mono text-[11px] text-white/40">
              {truncateAddress(row.token as `0x${string}`, 4)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 pt-0 text-xs text-white/50">
          <span>
            Client{" "}
            <span className="font-mono text-white/70">
              {truncateAddress(row.client as `0x${string}`, 4)}
            </span>
          </span>
          <span>
            Freelancer{" "}
            <span className="font-mono text-white/70">
              {truncateAddress(row.freelancer as `0x${string}`, 4)}
            </span>
          </span>
          <span>
            Deadline{" "}
            <span className="font-mono text-white/70">
              {new Date(row.deadline).toLocaleDateString()}
            </span>
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
