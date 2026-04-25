"use client";

import type { AssertionOutcomeLabel } from "@verdict/shared/types";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { OutcomeBadge } from "@/components/verdict/outcome-badge";
import { formatRelative, truncateAddress, truncateHash } from "@/lib/format";
import { explorerTx } from "@/lib/web3/chains";
import { APP_LABEL, appSlugForCallback, type AppSlug } from "@/lib/web3/routing";

export type AssertionRow = {
  id: string;
  chainId: number;
  claim: string;
  mode: "INSTANT" | "AUDITED";
  asserter: string;
  bond: string;
  callback: string;
  callbackSelector: string;
  challengePeriod: number;
  outcome: AssertionOutcomeLabel;
  reasoningRoot: string | null;
  verdictTx: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export function AssertionRowCard({ row }: { row: AssertionRow }) {
  const slug: AppSlug = appSlugForCallback(row.callback);

  return (
    <Card className="transition-colors hover:border-white/20 hover:bg-white/[0.07]">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{APP_LABEL[slug]}</Badge>
            <Badge variant="outline">{row.mode}</Badge>
            <OutcomeBadge outcome={row.outcome} />
          </div>
          <div className="truncate text-sm text-white/80">{row.claim}</div>
          <div className="font-mono text-[11px] text-white/40">
            id · {truncateHash(row.id, 10, 6)} ·{" "}
            asserter {truncateAddress(row.asserter, 4)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-xs text-white/40">
            {formatRelative(row.createdAt)}
          </span>
          {row.verdictTx ? (
            <a
              href={explorerTx(row.chainId, row.verdictTx)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] text-white/50 hover:text-white"
            >
              tx {truncateHash(row.verdictTx, 6, 4)}
            </a>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
