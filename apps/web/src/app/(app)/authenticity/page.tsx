"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type Address } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";

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
import { ConnectWall } from "@/components/verdict/connect-wall";
import { EmptyState } from "@/components/verdict/empty-state";
import { EvidenceUploader } from "@/components/verdict/evidence-uploader";
import { PageHeader } from "@/components/verdict/page-header";
import {
  formatAmount,
  formatRelative,
  truncateAddress,
  truncateHash,
} from "@/lib/format";
import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import {
  CHECK_STATUS,
  CHECK_STATUS_LABEL,
  decodeCheckStatus,
  type Check,
  type CheckStatus,
} from "@/lib/web3/authenticity";
import { explorerAddress } from "@/lib/web3/chains";
import { runTx } from "@/lib/web3/tx";

export default function AuthenticityPage() {
  const chainId = useChainId();
  const certifier = maybeContractAddress("authenticityCertifier");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Authenticity"
        title="NFT Authenticity Certifier"
        description="Prove an image, document, or token URI matches its canonical reference. A vision-aware TEE judge compares perceptual hashes + metadata, and issues an on-chain certificate."
      />
      {!certifier ? (
        <NotDeployed chainId={chainId} />
      ) : (
        <ConnectWall>
          <AuthenticityInner certifier={certifier} chainId={chainId} />
        </ConnectWall>
      )}
    </div>
  );
}

function NotDeployed({ chainId }: { chainId: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contracts not deployed on this chain</CardTitle>
        <CardDescription>
          Set{" "}
          <code className="font-mono text-white/70">
            NEXT_PUBLIC_AUTHENTICITY_CERTIFIER
          </code>{" "}
          for chain {chainId}.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function AuthenticityInner({
  certifier,
  chainId,
}: {
  certifier: Address;
  chainId: number;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <RecentChecks certifier={certifier} chainId={chainId} />
      <SubmitPanel certifier={certifier} chainId={chainId} />
    </div>
  );
}

function SubmitPanel({
  certifier,
  chainId,
}: {
  certifier: Address;
  chainId: number;
}) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const bond = useReadContract({
    address: certifier,
    abi: abis.authenticityCertifier,
    functionName: "assertionBond",
  }) as { data: bigint | undefined };

  const [assetHash, setAssetHash] = useState<`0x${string}` | null>(null);
  const [referenceHash, setReferenceHash] = useState<`0x${string}` | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assetHash || !referenceHash || !bond.data || !address || !publicClient) return;
    try {
      setSubmitting(true);
      const hash = await runTx(
        writeContractAsync({
          address: certifier,
          abi: abis.authenticityCertifier,
          functionName: "submitCheck",
          args: [assetHash, referenceHash],
          value: bond.data,
        }),
        {
          chainId,
          pending: "Opening authenticity check…",
          success: "Check submitted",
        },
      );
      await publicClient.waitForTransactionReceipt({ hash });
      setAssetHash(null);
      setReferenceHash(null);
    } finally {
      setSubmitting(false);
    }
  }

  // Authenticity's `submitCheck` only takes the two hashes directly —
  // there's no pre-registered assertion to attach the upload to. Use a
  // deterministic pseudo-assertion so the backend FK resolves; the real
  // verdict assertion is created synchronously inside the submit tx.
  const pseudoAssertion = useMemo(() => {
    if (!address) return null;
    return (
      "0x" +
      BigInt(address)
        .toString(16)
        .padStart(64, "0")
    ) as `0x${string}`;
  }, [address]);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asset</CardTitle>
          <CardDescription>
            The file under scrutiny. We upload it to 0G Storage; the root hash
            goes on-chain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {address && pseudoAssertion ? (
            <EvidenceUploader
              assertionId={pseudoAssertion}
              uploader={address}
              onUploaded={(r) => setAssetHash(r.rootHash)}
              helper="Image, document, signature — the artefact you want certified."
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reference</CardTitle>
          <CardDescription>
            The canonical source (original mint artwork, notarised document) the
            asset must match.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {address && pseudoAssertion ? (
            <EvidenceUploader
              assertionId={pseudoAssertion}
              uploader={address}
              onUploaded={(r) => setReferenceHash(r.rootHash)}
              helper="The ground truth — what the asset is being compared against."
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="text-xs text-white/50">
            Bond:{" "}
            <span className="font-mono text-white">
              {bond.data ? formatAmount(bond.data) : "…"} 0G
            </span>
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!assetHash || !referenceHash || submitting || !bond.data}
          >
            {submitting ? "Submitting…" : "Submit check"}
          </Button>
          <p className="text-xs text-white/40">
            The judge opens an INSTANT assertion and decides inline; certified
            checks are queryable by any integrator.
          </p>
        </CardContent>
      </Card>
    </form>
  );
}

function RecentChecks({
  certifier,
  chainId,
}: {
  certifier: Address;
  chainId: number;
}) {
  const total = useReadContract({
    address: certifier,
    abi: abis.authenticityCertifier,
    functionName: "totalChecks",
  }) as { data: bigint | undefined; isLoading: boolean };

  const totalCount = total.data ? Number(total.data) : 0;

  // Show the most recent 20.
  const ids = useMemo(() => {
    const out: bigint[] = [];
    for (let i = totalCount; i > Math.max(0, totalCount - 20); i--) {
      out.push(BigInt(i));
    }
    return out;
  }, [totalCount]);

  const { data, isLoading, refetch } = useReadContracts({
    contracts: ids.map((id) => ({
      address: certifier,
      abi: abis.authenticityCertifier,
      functionName: "getCheck",
      args: [id],
    })),
    query: { enabled: ids.length > 0 },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Recent checks</h2>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <a
            href={explorerAddress(chainId, certifier)}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:text-white/70"
          >
            {truncateAddress(certifier, 6)}
          </a>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {total.isLoading || isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : ids.length === 0 ? (
        <EmptyState
          title="No checks yet"
          description="Drop in an asset and a reference on the right to open the first check."
        />
      ) : (
        <div className="grid gap-3">
          {ids.map((id, idx) => {
            const res = data?.[idx];
            if (!res || res.status !== "success") return null;
            const check = res.result as unknown as Check;
            return <CheckRow key={id.toString()} id={id} check={check} />;
          })}
        </div>
      )}
    </div>
  );
}

function CheckRow({ id, check }: { id: bigint; check: Check }) {
  const status = decodeCheckStatus(check.status);
  return (
    <Link href={`/authenticity/${id.toString()}`} className="group block">
      <Card className="transition-colors group-hover:border-white/20 group-hover:bg-white/[0.07]">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white">
                Check #{id.toString()}
              </span>
              <StatusBadge status={status} />
            </div>
            <div className="font-mono text-[11px] text-white/50">
              asset · {truncateHash(check.assetHash, 10, 6)}
            </div>
            <div className="font-mono text-[11px] text-white/40">
              ref · {truncateHash(check.referenceHash, 10, 6)}
            </div>
          </div>
          <div className="text-right text-xs text-white/40">
            <div>by {truncateAddress(check.submitter, 4)}</div>
            <div>
              {check.submittedAt > 0n
                ? formatRelative(Number(check.submittedAt) * 1000)
                : "—"}
            </div>
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
