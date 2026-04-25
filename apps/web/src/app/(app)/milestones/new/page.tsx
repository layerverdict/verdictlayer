"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { type Address, decodeEventLog, erc20Abi, parseUnits } from "viem";
import {
  useAccount,
  useChainId,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConnectWall } from "@/components/verdict/connect-wall";
import { PageHeader } from "@/components/verdict/page-header";
import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { runTx } from "@/lib/web3/tx";

type MilestoneDraft = { amount: string; criteria: string };

export default function NewGrantPage() {
  const vaultAddress = maybeContractAddress("milestoneVault");
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Milestones · Create"
        title="Create a grant"
        description="Define milestones with explicit acceptance criteria. The DAO locks the full amount up front; the vault releases each slice only when the judge verifies the matching evidence."
        action={
          <Button variant="ghost" asChild>
            <Link href="/milestones">Cancel</Link>
          </Button>
        }
      />
      {!vaultAddress ? (
        <Card>
          <CardHeader>
            <CardTitle>Contracts not deployed on this chain</CardTitle>
            <CardDescription>
              Set <code className="font-mono text-white/70">NEXT_PUBLIC_MILESTONE_VAULT</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ConnectWall>
          <CreateGrantForm vaultAddress={vaultAddress} />
        </ConnectWall>
      )}
    </div>
  );
}

function CreateGrantForm({ vaultAddress }: { vaultAddress: Address }) {
  const router = useRouter();
  const chainId = useChainId();
  const { address: account } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [grantee, setGrantee] = useState("");
  const [token, setToken] = useState("");
  const [expires, setExpires] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 16);
  });
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { amount: "", criteria: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const decimals = useReadContract({
    address: token && /^0x[0-9a-fA-F]{40}$/.test(token) ? (token as Address) : undefined,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: /^0x[0-9a-fA-F]{40}$/.test(token) },
  });

  const tokenDecimals = decimals.data ?? 18;

  function addMilestone() {
    setMilestones((prev) => [...prev, { amount: "", criteria: "" }]);
  }

  function updateMilestone(i: number, patch: Partial<MilestoneDraft>) {
    setMilestones((prev) =>
      prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    );
  }

  function removeMilestone(i: number) {
    setMilestones((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!publicClient || !account) {
      toast.error("Wallet not ready");
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(grantee)) {
      toast.error("Grantee address is malformed");
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
      toast.error("Token address is malformed");
      return;
    }
    if (milestones.length === 0) {
      toast.error("Add at least one milestone");
      return;
    }
    if (milestones.some((m) => !m.amount || !m.criteria.trim())) {
      toast.error("Each milestone needs an amount and acceptance criteria");
      return;
    }

    const expiresTs = Math.floor(new Date(expires).getTime() / 1000);
    if (Number.isNaN(expiresTs) || expiresTs <= Math.floor(Date.now() / 1000)) {
      toast.error("Expiry must be a future date");
      return;
    }

    let amounts: bigint[];
    try {
      amounts = milestones.map((m) => parseUnits(m.amount, tokenDecimals));
    } catch {
      toast.error("A milestone amount is not a valid number");
      return;
    }
    if (amounts.some((a) => a <= 0n)) {
      toast.error("Milestone amounts must be greater than zero");
      return;
    }
    const criteria = milestones.map((m) => m.criteria);
    const total = amounts.reduce((acc, v) => acc + v, 0n);

    try {
      setSubmitting(true);

      // Wait for the approve receipt so the subsequent createGrant
      // doesn't race an unconfirmed allowance.
      const allowance = await publicClient.readContract({
        address: token as Address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, vaultAddress],
      });
      if ((allowance ?? 0n) < total) {
        await runTx(
          writeContractAsync({
            address: token as Address,
            abi: erc20Abi,
            functionName: "approve",
            args: [vaultAddress, total],
          }),
          {
            chainId,
            pending: "Approving vault to pull funds…",
            success: "Approval confirmed",
            waitFor: publicClient,
          },
        );
      }

      const hash = await runTx(
        writeContractAsync({
          address: vaultAddress,
          abi: abis.milestoneVault,
          functionName: "createGrant",
          args: [
            grantee as Address,
            token as Address,
            amounts,
            criteria,
            BigInt(expiresTs),
          ],
        }),
        {
          chainId,
          pending: "Locking funds into vault…",
          success: "Grant created",
        },
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        toast.error("Create grant reverted on-chain");
        return;
      }

      let newId: bigint | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: abis.milestoneVault,
            topics: [...log.topics] as [`0x${string}`, ...`0x${string}`[]],
            data: log.data,
          });
          if (
            decoded.eventName === "GrantCreated" &&
            decoded.args &&
            "grantId" in decoded.args
          ) {
            newId = (decoded.args as { grantId: bigint }).grantId;
            break;
          }
        } catch {
          // Not a MilestoneVault log — skip.
        }
      }

      router.push(newId ? `/milestones/${newId.toString()}` : "/milestones");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6 md:grid-cols-[1fr_320px]"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Grant basics</CardTitle>
            <CardDescription>
              The token must already exist on-chain. The vault will pull the
              full grant amount at creation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="grantee">Grantee address</Label>
              <Input
                id="grantee"
                placeholder="0x…"
                value={grantee}
                onChange={(e) => setGrantee(e.target.value.trim())}
                className="font-mono"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
              <div className="space-y-2">
                <Label htmlFor="token">Token address</Label>
                <Input
                  id="token"
                  placeholder="0x… USDC / custom ERC-20"
                  value={token}
                  onChange={(e) => setToken(e.target.value.trim())}
                  className="font-mono"
                  required
                />
                {decimals.data !== undefined ? (
                  <p className="text-xs text-white/40">
                    Decimals: {decimals.data}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expires">Expires at</Label>
                <Input
                  id="expires"
                  type="datetime-local"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Milestones</CardTitle>
              <CardDescription>
                Each milestone is a distinct assertion at submission time.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMilestone}
            >
              Add milestone
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {milestones.map((m, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-white/40">
                    Milestone #{i + 1}
                  </span>
                  {milestones.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove milestone"
                      onClick={() => removeMilestone(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor={`m-amount-${i}`}>Amount</Label>
                    <Input
                      id={`m-amount-${i}`}
                      inputMode="decimal"
                      placeholder="2500"
                      value={m.amount}
                      onChange={(e) =>
                        updateMilestone(i, { amount: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`m-criteria-${i}`}>Acceptance criteria</Label>
                    <Textarea
                      id={`m-criteria-${i}`}
                      placeholder="e.g. Milestone 1: user auth + dashboard. Deliverable: GitHub repo with 80%+ test coverage on auth flow + hosted demo."
                      value={m.criteria}
                      onChange={(e) =>
                        updateMilestone(i, { criteria: e.target.value })
                      }
                      rows={4}
                      required
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Before you sign</CardTitle>
            <CardDescription>
              Two txs: ERC-20 approval, then{" "}
              <span className="font-mono text-white/70">createGrant</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-white/60">
            <ul className="ml-4 list-disc space-y-1 text-white/50">
              <li>Vault takes custody of the full grant amount.</li>
              <li>Grantee submits evidence per milestone.</li>
              <li>TRUE outcomes auto-release the matching slice.</li>
              <li>After expiry, DAO reclaims residue.</li>
            </ul>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? "Submitting…" : "Lock funds + create grant"}
        </Button>
        <Button variant="ghost" asChild className="w-full">
          <Link href="/milestones">Back to list</Link>
        </Button>
      </aside>
    </form>
  );
}
