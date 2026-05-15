"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { type Address, decodeEventLog } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";

import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EvidenceUploader } from "@/components/verdict/evidence-uploader";
import { ReasoningStream } from "@/components/verdict/reasoning-stream";
import { attachEvidence } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { abis } from "@/lib/web3/abis";
import { runTx } from "@/lib/web3/tx";

const PRIVY_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

/**
 * Right-hand panel on the Authenticity page.
 *
 * Pure client component — it owns all the wallet / upload / tx plumbing.
 * When signed out it degrades to a "sign in to submit" prompt so the
 * server-rendered list on the left keeps working without any client JS.
 */
export function AuthenticitySubmitPanel({
  certifier,
}: {
  certifier: Address;
}) {
  const { address } = useAccount();
  if (!address) return <SignedOut />;
  return <SignedIn certifier={certifier} address={address} />;
}

function SignedOut() {
  if (!PRIVY_CONFIGURED) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wallet required</CardTitle>
          <CardDescription>
            Connect an EVM wallet to submit a check. You can browse the recent
            checks on the left without connecting.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <SignInPrompt />;
}

function SignInPrompt() {
  const { login } = useAuth();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sign in to submit</CardTitle>
        <CardDescription>
          Email, social, or wallet — we&apos;ll create an embedded wallet for
          you if you don&apos;t have one. You can still browse the recent
          checks without signing in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={login} className="w-full">
          Sign in
        </Button>
      </CardContent>
    </Card>
  );
}

function SignedIn({
  certifier,
  address,
}: {
  certifier: Address;
  address: `0x${string}`;
}) {
  const router = useRouter();
  const chainId = useChainId();
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
  const [streamAssertionId, setStreamAssertionId] = useState<`0x${string}` | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient) {
      toast.error("Wallet not ready");
      return;
    }
    if (!assetHash) {
      toast.error("Upload the asset before submitting");
      return;
    }
    if (!referenceHash) {
      toast.error("Upload the reference before submitting");
      return;
    }
    if (!bond.data) {
      toast.error("Couldn't read the assertion bond");
      return;
    }

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

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      let assertionId: `0x${string}` | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: abis.authenticityCertifier,
            topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]],
            data: log.data,
          });
          if (
            decoded.eventName === "CheckSubmitted" &&
            decoded.args &&
            "assertionId" in decoded.args
          ) {
            assertionId = (decoded.args as { assertionId: `0x${string}` }).assertionId;
            break;
          }
        } catch {
          // not our event
        }
      }

      if (assertionId) {
        setStreamAssertionId(assertionId);
        Promise.all([
          attachEvidence({ rootHash: assetHash, assertionId, uploader: address }),
          attachEvidence({ rootHash: referenceHash, assertionId, uploader: address }),
        ]).catch((err) => console.warn("attachEvidence failed", err));
      }

      setAssetHash(null);
      setReferenceHash(null);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
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
            <EvidenceUploader
              uploader={address}
              onUploaded={(r) => setAssetHash(r.rootHash)}
              helper="Image, document, signature — the artefact you want certified."
            />
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
            <EvidenceUploader
              uploader={address}
              onUploaded={(r) => setReferenceHash(r.rootHash)}
              helper="The ground truth — what the asset is being compared against."
            />
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

      {streamAssertionId ? (
        <ReasoningStream assertionId={streamAssertionId} />
      ) : null}
    </div>
  );
}
