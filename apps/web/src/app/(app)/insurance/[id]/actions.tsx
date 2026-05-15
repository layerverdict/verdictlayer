"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { type Address, decodeEventLog } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EvidenceUploader } from "@/components/verdict/evidence-uploader";
import { FlightOracle } from "@/components/verdict/flight-oracle";
import { LoginButton } from "@/components/verdict/login-button";
import { OutcomeBadge } from "@/components/verdict/outcome-badge";
import { ReasoningStream } from "@/components/verdict/reasoning-stream";
import { attachEvidence, getFeatures, type ApiFeatures } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { abis } from "@/lib/web3/abis";
import {
  POLICY_STATUS,
  decodePolicyStatusLabel,
  type PolicyStatus,
} from "@/lib/web3/insurance";
import { runTx } from "@/lib/web3/tx";

export interface InsuranceActionsInput {
  id: number;
  chainId: number;
  insuranceAddress: Address;
  insurer: Address;
  holder: Address;
  statusLabel: string;
  premium: string;
  coverageStart: string;
  coverageEnd: string;
  /** When the RSC already rendered a ReasoningStream (assertionId known at page load), pass it here to avoid rendering a duplicate. */
  serverAssertionId?: `0x${string}` | null;
}

export function InsuranceActions(props: InsuranceActionsInput) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [claimedAssertionId, setClaimedAssertionId] = useState<`0x${string}` | null>(null);
  const status = decodePolicyStatusLabel(props.statusLabel);

  const bondRead = useReadContract({
    address: props.insuranceAddress,
    abi: abis.parametricInsurance,
    functionName: "assertionBond",
    chainId: props.chainId,
  }) as { data: bigint | undefined };

  const isInsurer = isConnected && address?.toLowerCase() === props.insurer.toLowerCase();
  const isHolder = isConnected && address?.toLowerCase() === props.holder.toLowerCase();
  const role: "insurer" | "holder" | "both" | "observer" = !isConnected
    ? "observer"
    : isInsurer && isHolder
      ? "both"
      : isHolder
        ? "holder"
        : isInsurer
          ? "insurer"
          : "observer";

  const terminal =
    status === POLICY_STATUS.PAID || status === POLICY_STATUS.EXPIRED;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your move</CardTitle>
          <CardDescription>
            {!isConnected
              ? "Sign in to see the actions available to you on this policy."
              : terminal
                ? "This policy is closed."
                : claimedAssertionId
                  ? "Claim filed — the TEE judge is working on the verdict below."
                  : role === "observer"
                    ? "You're observing this policy. Only the insurer or holder can act."
                    : "Actions below are what the contract allows for your role right now."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isConnected ? (
            <div className="flex justify-center">
              <LoginButton />
            </div>
          ) : (
            <InsuranceActionButtons
              {...props}
              status={status}
              role={role}
              bond={bondRead.data ?? 0n}
              terminal={terminal}
              claimInProgress={!!claimedAssertionId}
              onClaimFiled={setClaimedAssertionId}
            />
          )}
        </CardContent>
      </Card>
      {claimedAssertionId && claimedAssertionId !== props.serverAssertionId ? (
        <ReasoningStream assertionId={claimedAssertionId} onDone={() => router.refresh()} />
      ) : null}
    </>
  );
}

function InsuranceActionButtons({
  id,
  chainId,
  insuranceAddress,
  holder,
  premium,
  coverageStart,
  coverageEnd,
  status,
  role,
  bond,
  terminal,
  claimInProgress,
  onClaimFiled,
}: InsuranceActionsInput & {
  status: PolicyStatus;
  role: "insurer" | "holder" | "both" | "observer";
  bond: bigint;
  terminal: boolean;
  claimInProgress: boolean;
  onClaimFiled: (assertionId: `0x${string}`) => void;
}) {
  const { writeContractAsync } = useWriteContract();

  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = Math.floor(new Date(coverageStart).getTime() / 1000);
  const endSec = Math.floor(new Date(coverageEnd).getTime() / 1000);
  const inCoverage = nowSec >= startSec && nowSec <= endSec;
  const afterEnd = nowSec > endSec;
  const premiumWei = premium ? BigInt(premium) : 0n;
  const premiumPayable = status === POLICY_STATUS.ACTIVE && premiumWei > 0n;

  async function onPayPremium() {
    await runTx(
      writeContractAsync({
        address: insuranceAddress,
        abi: abis.parametricInsurance,
        functionName: "payPremium",
        args: [BigInt(id)],
        value: premiumWei,
      }),
      { chainId, pending: "Paying premium…", success: "Premium paid" },
    );
  }

  async function onReclaim() {
    await runTx(
      writeContractAsync({
        address: insuranceAddress,
        abi: abis.parametricInsurance,
        functionName: "reclaim",
        args: [BigInt(id)],
      }),
      { chainId, pending: "Reclaiming collateral…", success: "Collateral returned" },
    );
  }

  async function onRescueInvalid() {
    await runTx(
      writeContractAsync({
        address: insuranceAddress,
        abi: abis.parametricInsurance,
        functionName: "rescueInvalidClaim",
        args: [BigInt(id)],
      }),
      { chainId, pending: "Rescuing stuck claim…", success: "Policy reopened" },
    );
  }

  return (
    <>
      {(role === "holder" || role === "both") && premiumPayable ? (
        <Button className="w-full" onClick={onPayPremium}>
          Pay premium ({formatAmount(premiumWei)} 0G)
        </Button>
      ) : null}

      {(role === "holder" || role === "both") && status === POLICY_STATUS.ACTIVE && inCoverage && !claimInProgress ? (
        <ClaimDialog
          id={BigInt(id)}
          insuranceAddress={insuranceAddress}
          chainId={chainId}
          bond={bond}
          holder={holder}
          onClaimFiled={onClaimFiled}
        />
      ) : null}

      {(role === "holder" || role === "both") && status === POLICY_STATUS.CLAIM_PENDING ? (
        <Button variant="outline" className="w-full" onClick={onRescueInvalid}>
          Rescue INVALID claim
        </Button>
      ) : null}

      {(role === "insurer" || role === "both") && status === POLICY_STATUS.ACTIVE && afterEnd ? (
        <Button variant="outline" className="w-full" onClick={onReclaim}>
          Reclaim collateral
        </Button>
      ) : null}

      {terminal ? (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/50">
          <OutcomeBadge
            outcome={status === POLICY_STATUS.PAID ? "TRUE" : "PENDING"}
          />
          {status === POLICY_STATUS.PAID
            ? "Payout delivered to holder."
            : "Coverage ended without a triggered claim."}
        </div>
      ) : null}
    </>
  );
}

function ClaimDialog({
  id,
  insuranceAddress,
  chainId,
  bond,
  holder,
  onClaimFiled,
}: {
  id: bigint;
  insuranceAddress: Address;
  chainId: number;
  bond: bigint;
  holder: Address;
  onClaimFiled: (assertionId: `0x${string}`) => void;
}) {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [open, setOpen] = useState(false);
  const [rootHash, setRootHash] = useState<`0x${string}` | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [features, setFeatures] = useState<ApiFeatures | null>(null);

  useEffect(() => {
    let alive = true;
    getFeatures()
      .then((f) => {
        if (alive) setFeatures(f);
      })
      .catch(() => {
        if (alive) setFeatures({ oracles: { flight: false } });
      });
    return () => {
      alive = false;
    };
  }, []);

  async function submit() {
    if (!rootHash || !publicClient) return;
    try {
      setSubmitting(true);
      const hash = await runTx(
        writeContractAsync({
          address: insuranceAddress,
          abi: abis.parametricInsurance,
          functionName: "claim",
          args: [id, rootHash],
          value: bond,
        }),
        {
          chainId,
          pending: "Filing claim + opening verdict…",
          success: "Claim filed",
        },
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      let assertionId: `0x${string}` | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: abis.parametricInsurance,
            topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]],
            data: log.data,
          });
          if (
            decoded.eventName === "ClaimOpened" &&
            decoded.args &&
            "assertionId" in decoded.args
          ) {
            assertionId = (decoded.args as { assertionId: `0x${string}` })
              .assertionId;
            break;
          }
        } catch {
          // Not a ParametricInsurance log — skip.
        }
      }

      if (assertionId) {
        onClaimFiled(assertionId);
        attachEvidence({ rootHash, assertionId, uploader: holder }).catch(
          (err) => console.warn("attachEvidence failed", err),
        );
      }

      setOpen(false);
      setRootHash(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">File claim</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File a parametric claim</DialogTitle>
          <DialogDescription>
            Upload evidence of the trigger (oracle snapshot, flight data, on-chain
            feed dump — whatever the condition cited). Bond is{" "}
            <span className="font-mono text-white/80">{formatAmount(bond)} 0G</span>.
          </DialogDescription>
        </DialogHeader>
        {features?.oracles.flight ? (
          <Tabs defaultValue="upload" className="space-y-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">Upload file</TabsTrigger>
              <TabsTrigger value="flight">Flight oracle</TabsTrigger>
            </TabsList>
            <TabsContent value="upload">
              <EvidenceUploader
                uploader={holder}
                onUploaded={(res) => setRootHash(res.rootHash)}
              />
            </TabsContent>
            <TabsContent value="flight">
              <FlightOracle
                uploader={holder}
                onSnapshot={(res) => setRootHash(res.rootHash)}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <EvidenceUploader
            uploader={holder}
            onUploaded={(res) => setRootHash(res.rootHash)}
          />
        )}
        <DialogFooter>
          <Button
            disabled={!rootHash || submitting}
            onClick={submit}
            className="w-full sm:w-auto"
          >
            {submitting ? "Submitting…" : `File claim · ${formatAmount(bond)} bond`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
