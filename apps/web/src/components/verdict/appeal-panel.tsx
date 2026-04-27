"use client";

import { Gavel, ShieldAlert, Swords, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type Address } from "viem";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OutcomeBadge } from "@/components/verdict/outcome-badge";
import {
  ApiError,
  getAssertionDetail,
  type AssertionDetail,
  type AssertionReasoning,
} from "@/lib/api";
import { formatAmount, truncateHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { runTx } from "@/lib/web3/tx";

/**
 * On-chain AssertionRegistry returns a struct with these fields (see
 * IAssertionRegistry.sol). The `Status` enum maps 1:1 to its numeric
 * representation; we decode it to labels here.
 */
type RegistryStatus = "OPEN" | "VERDICTED" | "CHALLENGED" | "RESOLVED";
const STATUS_BY_INDEX: RegistryStatus[] = ["OPEN", "VERDICTED", "CHALLENGED", "RESOLVED"];

interface OnchainAssertion {
  id: `0x${string}`;
  claim: string;
  evidenceRoots: readonly `0x${string}`[];
  asserter: Address;
  challenger: Address;
  callback: Address;
  callbackSelector: `0x${string}`;
  mode: number;
  challengePeriod: bigint;
  bond: bigint;
  status: number;
  originalOutcome: number;
  outcome: number;
  reasoningRoot: `0x${string}`;
  attestationHash: `0x${string}`;
  judgeTokenId: bigint;
  createdAt: bigint;
  verdictedAt: bigint;
  resolvedAt: bigint;
}

const MODE_AUDITED = 1;

export interface AppealPanelProps {
  assertionId: `0x${string}`;
  /** Optional: suppress the Card chrome so it can sit inside another card. */
  plain?: boolean;
}

/**
 * Appeal UI for AUDITED assertions. Shows:
 *   - On-chain status + challenge-window countdown.
 *   - A "Challenge verdict" button when the viewer can post a bond.
 *   - Panelist list + individual reasonings once the swarm has voted.
 *   - Final outcome when the appeal closes.
 *
 * Reads the canonical state from AssertionRegistry on-chain so the UI
 * reflects the contract even before the indexer has caught up.
 * Panelist reasonings come from the API (reasoning_logs table), which
 * the backend populates as each panelist lands their vote.
 */
export function AppealPanel({ assertionId, plain = false }: AppealPanelProps) {
  const registry = maybeContractAddress("assertionRegistry");
  const chainId = useChainId();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const { data: onchain, refetch } = useReadContract({
    address: registry,
    abi: abis.assertionRegistry,
    functionName: "getAssertion",
    args: [assertionId],
    query: { enabled: Boolean(registry) },
  }) as { data: OnchainAssertion | undefined; refetch: () => void };

  const [detail, setDetail] = useState<AssertionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [challenging, setChallenging] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // Poll the API every 6s while the swarm is running, less often once
  // resolved — panelist reasonings arrive as the backend inserts rows.
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await getAssertionDetail(assertionId);
        if (alive) setDetail(res);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) {
          console.warn("getAssertionDetail failed", err);
        }
      } finally {
        if (alive) setLoadingDetail(false);
      }
    }
    void load();
    const interval = setInterval(() => {
      void load();
    }, 6000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [assertionId]);

  // Tick once a second so the challenge-window countdown stays fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const status = onchain ? STATUS_BY_INDEX[onchain.status] : undefined;
  const isAudited = onchain?.mode === MODE_AUDITED;
  const verdictedAt = onchain?.verdictedAt ?? 0n;
  const challengePeriod = onchain?.challengePeriod ?? 0n;
  const windowCloses = verdictedAt > 0n ? Number(verdictedAt + challengePeriod) : 0;
  const secondsLeft = Math.max(0, windowCloses - now);
  const canChallenge =
    Boolean(registry) &&
    isAudited &&
    status === "VERDICTED" &&
    secondsLeft > 0 &&
    Boolean(address) &&
    address?.toLowerCase() !== onchain?.asserter.toLowerCase();

  async function onChallenge() {
    if (!registry || !onchain) return;
    try {
      setChallenging(true);
      await runTx(
        writeContractAsync({
          address: registry,
          abi: abis.assertionRegistry,
          functionName: "challengeAssertion",
          args: [assertionId],
          value: onchain.bond,
        }),
        {
          chainId,
          pending: "Posting challenge bond…",
          success: "Challenge opened — swarm spinning up",
        },
      );
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Challenge failed");
    } finally {
      setChallenging(false);
    }
  }

  // INSTANT assertions skip this whole surface — there's no challenge
  // window and no appeal for them.
  if (onchain && !isAudited) return null;

  const body = (
    <div className="space-y-4">
      <StatusRow status={status} secondsLeft={secondsLeft} audited={isAudited} />

      {status === "VERDICTED" && secondsLeft > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="flex items-center gap-2 text-sm text-amber-100">
            <ShieldAlert className="h-4 w-4" />
            Challenge window open
          </div>
          <p className="text-xs text-amber-100/70">
            The judge&apos;s call stands unless someone posts a{" "}
            {onchain ? formatAmount(onchain.bond) : "—"} 0G bond before the
            countdown ends. A valid challenge triggers a 3-agent swarm.
          </p>
          <Button
            size="sm"
            className="self-start"
            disabled={!canChallenge || challenging}
            onClick={onChallenge}
          >
            {challenging
              ? "Submitting…"
              : canChallenge
                ? `Challenge verdict · ${formatAmount(onchain?.bond ?? 0n)} 0G`
                : address?.toLowerCase() === onchain?.asserter.toLowerCase()
                  ? "Asserter cannot self-challenge"
                  : "Connect wallet to challenge"}
          </Button>
        </div>
      ) : null}

      {status === "CHALLENGED" ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-xs text-red-100/80">
          <Swords className="h-4 w-4 flex-shrink-0" />
          <div>
            Challenge accepted — 3-agent appeal swarm is running. Each panelist
            reads the full evidence independently and writes a reasoning
            transcript to 0G Storage.
          </div>
        </div>
      ) : null}

      <PanelList
        reasonings={detail?.reasonings ?? []}
        loading={loadingDetail && !detail}
      />

      {status === "RESOLVED" && onchain ? (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <OutcomeBadge outcome={outcomeLabel(onchain.outcome)} />
          <div className="text-sm text-white/70">
            Appeal resolved. {outcomeHeadline(onchain.outcome, onchain.originalOutcome)}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (plain) return body;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">Appeal panel</CardTitle>
          <Badge variant="outline">AUDITED</Badge>
        </div>
        <CardDescription>
          AUDITED assertions get a challenge window, and any challenge spins up
          a 3-agent appeal swarm. Votes + reasonings land below in real time.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function StatusRow({
  status,
  secondsLeft,
  audited,
}: {
  status: RegistryStatus | undefined;
  secondsLeft: number;
  audited: boolean;
}) {
  if (!status) {
    return (
      <div className="flex items-center gap-3 text-sm text-white/50">
        <Users className="h-4 w-4" /> Loading on-chain state…
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <Badge variant="outline">{status}</Badge>
      {audited && status === "VERDICTED" ? (
        <span className="font-mono text-white/60">
          {secondsLeft > 0 ? `${fmtDuration(secondsLeft)} until final` : "window closed"}
        </span>
      ) : null}
    </div>
  );
}

function PanelList({
  reasonings,
  loading,
}: {
  reasonings: AssertionReasoning[];
  loading: boolean;
}) {
  const panel = useMemo(
    () => reasonings.filter((r) => r.judgeTokenId != null),
    [reasonings],
  );
  if (loading) {
    return <div className="text-sm text-white/40">Fetching panel state…</div>;
  }
  if (panel.length === 0) {
    return null;
  }
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-white/40">
        <Gavel className="h-3.5 w-3.5" />
        Panel votes
        <span className="font-mono text-white/30">
          ({panel.length}/3)
        </span>
      </div>
      <ol className="space-y-2">
        {panel.map((r) => (
          <li
            key={r.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-white/40">
                judge #{r.judgeTokenId}
              </span>
              <OutcomeBadge outcome={r.outcome === "PENDING" ? "PENDING" : r.outcome} />
              {r.confidence ? (
                <span className="font-mono text-[11px] text-white/40">
                  conf {Number(r.confidence).toFixed(2)}
                </span>
              ) : null}
            </div>
            <a
              href={`https://chainscan.0g.ai/tx/${r.storageRoot}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] text-white/40 hover:text-white/70"
            >
              {truncateHash(r.storageRoot, 8, 6)}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

function outcomeLabel(outcome: number): "TRUE" | "FALSE" | "INVALID" | "PENDING" {
  if (outcome === 1) return "TRUE";
  if (outcome === 2) return "FALSE";
  if (outcome === 3) return "INVALID";
  return "PENDING";
}

function outcomeHeadline(finalOutcome: number, originalOutcome: number): string {
  if (finalOutcome === originalOutcome) {
    return "Panel upheld the original verdict.";
  }
  return "Panel overturned the original verdict.";
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}
