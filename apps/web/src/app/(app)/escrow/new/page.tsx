"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Address, erc20Abi, parseUnits } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";

import { abis } from "@/lib/web3/abis";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { runTx } from "@/lib/web3/tx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConnectWall } from "@/components/verdict/connect-wall";
import { PageHeader } from "@/components/verdict/page-header";

export default function NewEscrowPage() {
  const escrowAddress = maybeContractAddress("escrow");
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Escrow · Create"
        title="Open a new escrow"
        description="Lock funds against a scope. The freelancer has until the deadline to deliver; the client can accept, open a dispute, or expire for a refund."
        action={
          <Button variant="ghost" asChild>
            <Link href="/escrow">Cancel</Link>
          </Button>
        }
      />
      {!escrowAddress ? (
        <Card>
          <CardHeader>
            <CardTitle>Contracts not deployed on this chain</CardTitle>
            <CardDescription>
              Switch to a chain where Verdict is live, or run the deploy script
              and publish the address to <code className="font-mono text-white/70">NEXT_PUBLIC_ESCROW</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ConnectWall>
          <NewEscrowForm escrowAddress={escrowAddress} />
        </ConnectWall>
      )}
    </div>
  );
}

function NewEscrowForm({ escrowAddress }: { escrowAddress: Address }) {
  const router = useRouter();
  const chainId = useChainId();
  const { address: account } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [freelancer, setFreelancer] = useState("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 16);
  });
  const [scope, setScope] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const decimals = useReadContract({
    address: token && /^0x[0-9a-fA-F]{40}$/.test(token) ? (token as Address) : undefined,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: Boolean(token && /^0x[0-9a-fA-F]{40}$/.test(token)) },
  });

  const tokenDecimals = decimals.data ?? 18;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !account) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(freelancer)) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) return;
    if (!amount || !scope) return;
    const deadlineTs = Math.floor(new Date(deadline).getTime() / 1000);
    if (deadlineTs <= Math.floor(Date.now() / 1000)) return;

    let amountBi: bigint;
    try {
      amountBi = parseUnits(amount, tokenDecimals);
    } catch {
      return;
    }

    try {
      setSubmitting(true);

      // Approve the escrow to pull `amount` tokens.
      const allowance = await publicClient.readContract({
        address: token as Address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, escrowAddress],
      });
      if ((allowance ?? 0n) < amountBi) {
        await runTx(
          writeContractAsync({
            address: token as Address,
            abi: erc20Abi,
            functionName: "approve",
            args: [escrowAddress, amountBi],
          }),
          {
            chainId,
            pending: "Approving token transfer…",
            success: "Approval confirmed",
            error: "Approval failed",
          },
        );
      }

      const hash = await runTx(
        writeContractAsync({
          address: escrowAddress,
          abi: abis.escrow,
          functionName: "createEscrow",
          args: [
            freelancer as Address,
            token as Address,
            amountBi,
            BigInt(deadlineTs),
            scope,
          ],
        }),
        {
          chainId,
          pending: "Locking funds into escrow…",
          success: "Escrow created",
          error: "Create escrow failed",
        },
      );

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // `createEscrow` returns the new ID; derive it from `totalEscrows`
      // after the tx confirms — simplest way without decoding the event.
      const total = (await publicClient.readContract({
        address: escrowAddress,
        abi: abis.escrow,
        functionName: "totalEscrows",
      })) as bigint;

      if (receipt.status === "success") {
        router.push(`/escrow/${total.toString()}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Escrow details</CardTitle>
          <CardDescription>
            The freelancer delivers against the scope text. Disputes are routed
            to a TEE judge that reads both sides&apos; evidence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="freelancer">Freelancer address</Label>
            <Input
              id="freelancer"
              placeholder="0x…"
              value={freelancer}
              onChange={(e) => setFreelancer(e.target.value.trim())}
              className="font-mono"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
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
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deadline">Delivery deadline</Label>
            <Input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scope">Scope</Label>
            <Textarea
              id="scope"
              placeholder="Landing page redesign — hero, features grid, pricing. Mobile-responsive."
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              rows={6}
              required
            />
            <p className="text-xs text-white/40">
              The judge reads this verbatim. Be explicit about acceptance
              criteria — it decides what the freelancer owed you.
            </p>
          </div>
        </CardContent>
      </Card>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Before you sign</CardTitle>
            <CardDescription>
              This tx calls <span className="font-mono text-white/70">createEscrow</span> and
              transfers tokens to the contract.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-white/60">
            <div>
              Funds stay locked until:
              <ul className="ml-4 mt-2 list-disc space-y-1 text-white/50">
                <li>You accept the delivery</li>
                <li>Verdict resolves a dispute</li>
                <li>30 days past deadline — you expire and reclaim</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? "Submitting…" : "Create escrow"}
        </Button>
        <Button variant="ghost" asChild className="w-full">
          <Link href="/escrow">Back to list</Link>
        </Button>
      </aside>
    </form>
  );
}
