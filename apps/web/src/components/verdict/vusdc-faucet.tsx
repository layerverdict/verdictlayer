"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";

import { Button } from "@/components/ui/button";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { runTx } from "@/lib/web3/tx";

/**
 * vUSDC faucet for the Escrow / Milestone demo forms. One-shot per
 * address: calls `VerdictUSDC.faucet()` which mints 1,000 vUSDC to
 * msg.sender and flips `hasClaimed[msg.sender] = true`.
 *
 * Passes the token address back to the parent via `onClaimed` so the
 * form can pre-fill the "Token address" field.
 */
const faucetAbi = [
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "hasClaimed",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export function VusdcFaucet({ onClaimed }: { onClaimed?: (address: `0x${string}`) => void }) {
  const usdcAddress = maybeContractAddress("verdictUsdc");
  const { address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState(false);

  const claimed = useReadContract({
    address: usdcAddress,
    abi: faucetAbi,
    functionName: "hasClaimed",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(usdcAddress && address) },
  });

  if (!usdcAddress) return null;

  const prefill = () => {
    if (onClaimed) onClaimed(usdcAddress);
    toast.success("Token address filled", {
      description: usdcAddress,
    });
  };

  if (!address) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/50">
        Sign in to claim 1,000 vUSDC from the demo faucet.
      </div>
    );
  }

  if (claimed.data === true) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
        <span>vUSDC already claimed by this wallet.</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={prefill}
        >
          Use demo token
        </Button>
      </div>
    );
  }

  const onClaim = async () => {
    if (!address || !usdcAddress) return;
    setPending(true);
    try {
      await runTx(
        writeContractAsync({
          address: usdcAddress,
          abi: faucetAbi,
          functionName: "faucet",
          args: [],
        }),
        {
          chainId,
          pending: "Claiming 1,000 vUSDC from the demo faucet…",
          success: "1,000 vUSDC minted to your wallet",
        },
      );
      claimed.refetch();
      prefill();
    } catch {
      // runTx already surfaces errors via toast.
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/70">
      <span>
        Need tokens?&nbsp;
        <span className="text-white/40">
          The demo vUSDC faucet mints 1,000 once per wallet.
        </span>
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onClaim}
        disabled={pending}
      >
        {pending ? "Claiming…" : "Claim 1,000 vUSDC"}
      </Button>
    </div>
  );
}
