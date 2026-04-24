"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Address, parseEther, keccak256, stringToBytes } from "viem";
import {
  useChainId,
  usePublicClient,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConnectWall } from "@/components/verdict/connect-wall";
import { PageHeader } from "@/components/verdict/page-header";
import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { runTx } from "@/lib/web3/tx";

export default function NewPolicyPage() {
  const insuranceAddress = maybeContractAddress("parametricInsurance");
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Insurance · Underwrite"
        title="Underwrite a policy"
        description="Lock the payout in the vault as native 0G. The holder can file a claim any time during the coverage window; Verdict settles instantly on a valid trigger."
        action={
          <Button variant="ghost" asChild>
            <Link href="/insurance">Cancel</Link>
          </Button>
        }
      />
      {!insuranceAddress ? (
        <Card>
          <CardHeader>
            <CardTitle>Contracts not deployed on this chain</CardTitle>
            <CardDescription>
              Set <code className="font-mono text-white/70">NEXT_PUBLIC_PARAMETRIC_INSURANCE</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ConnectWall>
          <UnderwriteForm insuranceAddress={insuranceAddress} />
        </ConnectWall>
      )}
    </div>
  );
}

function UnderwriteForm({ insuranceAddress }: { insuranceAddress: Address }) {
  const router = useRouter();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [holder, setHolder] = useState("");
  const [premium, setPremium] = useState("");
  const [payout, setPayout] = useState("");
  const [coverageStart, setCoverageStart] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [coverageEnd, setCoverageEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 16);
  });
  const [condition, setCondition] = useState("");
  const [evidenceSpec, setEvidenceSpec] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(holder)) return;
    if (!premium || !payout || !condition) return;

    const startTs = Math.floor(new Date(coverageStart).getTime() / 1000);
    const endTs = Math.floor(new Date(coverageEnd).getTime() / 1000);
    if (endTs <= startTs) return;

    let premiumWei: bigint;
    let payoutWei: bigint;
    try {
      premiumWei = parseEther(premium);
      payoutWei = parseEther(payout);
    } catch {
      return;
    }

    // evidenceSpec is stored as a bytes32 hash. Users may paste a
    // 0x-prefixed 32-byte hash directly; otherwise we hash whatever
    // free-form spec they enter.
    let spec: `0x${string}`;
    if (/^0x[0-9a-fA-F]{64}$/.test(evidenceSpec)) {
      spec = evidenceSpec as `0x${string}`;
    } else if (evidenceSpec.trim().length > 0) {
      spec = keccak256(stringToBytes(evidenceSpec.trim()));
    } else {
      spec = ("0x" + "0".repeat(64)) as `0x${string}`;
    }

    try {
      setSubmitting(true);
      const hash = await runTx(
        writeContractAsync({
          address: insuranceAddress,
          abi: abis.parametricInsurance,
          functionName: "underwrite",
          args: [
            holder as Address,
            premiumWei,
            payoutWei,
            BigInt(startTs),
            BigInt(endTs),
            condition,
            spec,
          ],
          value: payoutWei,
        }),
        {
          chainId,
          pending: "Locking payout + underwriting policy…",
          success: "Policy created",
          error: "Underwrite failed",
        },
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        const total = (await publicClient.readContract({
          address: insuranceAddress,
          abi: abis.parametricInsurance,
          functionName: "totalPolicies",
        })) as bigint;
        router.push(`/insurance/${total.toString()}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Policy terms</CardTitle>
          <CardDescription>
            The trigger condition is read verbatim by the judge when the holder
            files a claim. Be explicit about the measurable threshold.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="holder">Holder address</Label>
            <Input
              id="holder"
              placeholder="0x…"
              value={holder}
              onChange={(e) => setHolder(e.target.value.trim())}
              className="font-mono"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="premium">Premium (0G)</Label>
              <Input
                id="premium"
                inputMode="decimal"
                placeholder="0.1"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout">Payout (0G)</Label>
              <Input
                id="payout"
                inputMode="decimal"
                placeholder="2.0"
                value={payout}
                onChange={(e) => setPayout(e.target.value)}
                required
              />
              <p className="text-xs text-white/40">
                This amount is sent with the tx as collateral.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="coverageStart">Coverage start</Label>
              <Input
                id="coverageStart"
                type="datetime-local"
                value={coverageStart}
                onChange={(e) => setCoverageStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coverageEnd">Coverage end</Label>
              <Input
                id="coverageEnd"
                type="datetime-local"
                value={coverageEnd}
                onChange={(e) => setCoverageEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="condition">Trigger condition</Label>
            <Textarea
              id="condition"
              placeholder={`Example: "Flight AA123 delayed 2h or more, verified against AviationStack snapshot at the scheduled departure time."`}
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              rows={5}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evidenceSpec">Evidence spec (optional)</Label>
            <Input
              id="evidenceSpec"
              placeholder="Oracle snapshot hash, or a free-form spec the claim must cite."
              value={evidenceSpec}
              onChange={(e) => setEvidenceSpec(e.target.value)}
            />
            <p className="text-xs text-white/40">
              Accepts a bytes32 hash or a free-form string (we&apos;ll hash it for you).
            </p>
          </div>
        </CardContent>
      </Card>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Before you sign</CardTitle>
            <CardDescription>
              This tx calls <span className="font-mono text-white/70">underwrite</span> and
              locks the full payout as native 0G collateral.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-white/60">
            <ul className="ml-4 list-disc space-y-1 text-white/50">
              <li>Holder files a claim with evidence during coverage.</li>
              <li>
                Verdict resolves INSTANT mode — payout fires in the enforcer
                callback tx.
              </li>
              <li>
                After coverage ends without a TRUE verdict, you can reclaim
                the locked payout.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? "Submitting…" : "Underwrite + lock payout"}
        </Button>
        <Button variant="ghost" asChild className="w-full">
          <Link href="/insurance">Back to list</Link>
        </Button>
      </aside>
    </form>
  );
}
