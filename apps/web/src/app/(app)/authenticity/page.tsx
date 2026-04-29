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
import { AuthenticitySubmitPanel } from "@/components/verdict/authenticity-submit-panel";
import { formatRelative, truncateAddress, truncateHash } from "@/lib/format";
import { listChecks, type CheckRow } from "@/lib/api-server";
import {
  CHECK_STATUS,
  CHECK_STATUS_LABEL,
  decodeCheckStatusLabel,
  type CheckStatus,
} from "@/lib/web3/authenticity";
import { maybeContractAddress } from "@/lib/web3/addresses";

export const dynamic = "force-dynamic";

export default async function AuthenticityListPage() {
  const certifier = maybeContractAddress("authenticityCertifier");

  let rows: CheckRow[] = [];
  let error: string | null = null;
  if (certifier) {
    try {
      const res = await listChecks({ limit: 20 });
      rows = res.checks;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Authenticity"
        title="NFT Authenticity Certifier"
        description="Prove an image, document, or token URI matches its canonical reference. A vision-aware TEE judge compares perceptual hashes + metadata, and issues an on-chain certificate."
      />

      {!certifier ? (
        <Card>
          <CardHeader>
            <CardTitle>Contracts not deployed on this chain</CardTitle>
            <CardDescription>
              Set{" "}
              <code className="font-mono text-white/70">
                NEXT_PUBLIC_AUTHENTICITY_CERTIFIER
              </code>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Recent checks</h2>
              <span className="font-mono text-[11px] text-white/40">
                {truncateAddress(certifier, 6)}
              </span>
            </div>

            {error ? (
              <Card>
                <CardHeader>
                  <CardTitle>Indexer catching up</CardTitle>
                  <CardDescription>{error}</CardDescription>
                </CardHeader>
              </Card>
            ) : rows.length === 0 ? (
              <EmptyState
                title="No checks yet"
                description="Drop in an asset and a reference on the right to open the first check."
              />
            ) : (
              <div className="grid gap-3">
                {rows.map((row) => (
                  <CheckListRow key={row.id} row={row} />
                ))}
              </div>
            )}
          </section>

          <AuthenticitySubmitPanel certifier={certifier} />
        </div>
      )}
    </div>
  );
}

function CheckListRow({ row }: { row: CheckRow }) {
  const statusEnum = decodeCheckStatusLabel(row.status);
  return (
    <Link href={`/authenticity/${row.id}`} className="group block">
      <Card className="transition-colors group-hover:border-white/20 group-hover:bg-white/[0.07]">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white">
                Check #{row.id}
              </span>
              <StatusBadge status={statusEnum} />
            </div>
            <div className="font-mono text-[11px] text-white/50">
              asset · {truncateHash(row.assetHash, 10, 6)}
            </div>
            <div className="font-mono text-[11px] text-white/40">
              ref · {truncateHash(row.referenceHash, 10, 6)}
            </div>
          </div>
          <div className="text-right text-xs text-white/40">
            <div>by {truncateAddress(row.submitter as `0x${string}`, 4)}</div>
            <div>{formatRelative(new Date(row.submittedAt).getTime())}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  switch (status) {
    case CHECK_STATUS.CERTIFIED:
      return <Badge variant="success">{CHECK_STATUS_LABEL[status]}</Badge>;
    case CHECK_STATUS.REJECTED:
      return <Badge variant="danger">{CHECK_STATUS_LABEL[status]}</Badge>;
    case CHECK_STATUS.PENDING:
      return <Badge variant="info">{CHECK_STATUS_LABEL[status]}</Badge>;
    default:
      return <Badge variant="outline">{CHECK_STATUS_LABEL[status]}</Badge>;
  }
}
