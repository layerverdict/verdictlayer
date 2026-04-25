"use client";

import { toast } from "sonner";
import type { Hex, PublicClient } from "viem";

import { explorerTx } from "./chains";

export interface TxOpts {
  chainId?: number;
  pending?: string;
  success?: string;
  error?: string;
  /** When set, the promise only resolves after the tx lands in a block.
   *  Guarantees downstream reads see the tx's state. Callers that need
   *  the receipt itself should grab it from the same public client. */
  waitFor?: PublicClient;
  /** Confirmations to wait for when `waitFor` is set. Defaults to 1. */
  confirmations?: number;
}

/**
 * Wrap a wagmi `writeContractAsync` call with a toast lifecycle.
 * Returns the tx hash. When `opts.waitFor` is set, the promise also
 * awaits the receipt before resolving so the caller can rely on
 * read-after-write consistency (e.g. approve → create chains).
 */
export async function runTx<T extends Hex | undefined>(
  promise: Promise<T>,
  opts: TxOpts = {},
): Promise<T> {
  const pendingMsg = opts.pending ?? "Transaction pending…";
  const id = toast.loading(pendingMsg);

  try {
    const hash = await promise;

    if (hash && opts.waitFor) {
      const receipt = await opts.waitFor.waitForTransactionReceipt({
        hash,
        confirmations: opts.confirmations ?? 1,
      });
      if (receipt.status !== "success") {
        throw new Error("transaction reverted on-chain");
      }
    }

    toast.success(opts.success ?? "Transaction confirmed", {
      id,
      description: hash && opts.chainId ? truncateHashLocal(hash) : undefined,
      action:
        hash && opts.chainId
          ? {
              label: "View",
              onClick: () => {
                window.open(explorerTx(opts.chainId!, hash), "_blank", "noopener");
              },
            }
          : undefined,
    });
    return hash;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transaction failed";
    toast.error(opts.error ?? "Transaction failed", {
      id,
      description: message.slice(0, 280),
    });
    throw err;
  }
}

function truncateHashLocal(h: string): string {
  return h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}
