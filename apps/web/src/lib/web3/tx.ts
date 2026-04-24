"use client";

import { toast } from "sonner";

import { explorerTx } from "./chains";

type TxOpts = {
  chainId?: number;
  pending?: string;
  success?: string;
  error?: string;
};

/**
 * Wrap a wagmi `writeContractAsync` (or any promise of a tx hash) with a
 * toast lifecycle. Returns the hash on success.
 */
export async function runTx<T extends string | undefined>(
  promise: Promise<T>,
  opts: TxOpts = {},
): Promise<T> {
  const pendingMsg = opts.pending ?? "Transaction pending…";
  const id = toast.loading(pendingMsg);

  try {
    const hash = await promise;
    toast.success(opts.success ?? "Transaction confirmed", {
      id,
      description: hash && opts.chainId ? truncateHash(hash) : undefined,
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

function truncateHash(h: string): string {
  return h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}
