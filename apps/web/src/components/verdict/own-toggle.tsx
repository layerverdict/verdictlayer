"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";

interface Props {
  /** Current active state — driven by the URL, passed in from the server. */
  active: boolean;
  /** Query param flipped on toggle. */
  param?: string;
}

/**
 * "Show mine" filter. Puts `?{param}=1&account={addr}` on the URL which
 * the server RSC picks up as a filter on subsequent renders. Hides
 * itself when no wallet is connected — nothing to filter against.
 */
export function OwnToggle({ active, param = "mine" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { address } = useAccount();

  const toggle = useCallback(() => {
    if (!address) return;
    const next = new URLSearchParams(search.toString());
    if (active) {
      next.delete(param);
      next.delete("account");
    } else {
      next.set(param, "1");
      next.set("account", address);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [active, address, param, pathname, router, search]);

  if (!address) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={active ? "default" : "outline"}
        onClick={toggle}
      >
        {active ? "✓ Mine only" : "Show mine only"}
      </Button>
      {active ? (
        <span className="font-mono text-[11px] text-white/40">
          filtering by {address.slice(0, 6)}…{address.slice(-4)}
        </span>
      ) : null}
    </div>
  );
}
