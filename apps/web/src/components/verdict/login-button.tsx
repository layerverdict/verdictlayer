"use client";

import { Copy, ExternalLink, LogOut, User } from "lucide-react";
import { toast } from "sonner";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRIVY_CONFIGURED, useAuth, usePrivyAuth } from "@/lib/auth";
import { truncateAddress } from "@/lib/format";
import {
  explorerAddress,
  supportedChains,
  zgMainnet,
  zgTestnet,
} from "@/lib/web3/chains";
import { cn } from "@/lib/utils";

/**
 * The single auth surface shown in every header.
 *
 * Implementation detail: this is a pure client component but it does
 * not import `@privy-io/react-auth` directly — the heavy Privy chunk
 * stays out of the critical render path. Auth state comes from
 * `useAuth` (which picks between Privy context + wagmi) and
 * `usePrivyAuth` (extra fields — label, address — that only Privy
 * can populate; returns null until the lazy PrivyLayer mounts).
 */
export function LoginButton({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const privy = usePrivyAuth();
  const { address: wagmiAddress } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  // Render the disabled stub when neither Privy nor any wagmi connector
  // can produce a sign-in flow. PRIVY_CONFIGURED gates Privy; wagmi's
  // injected connector is always present, so in practice we show
  // "Loading…" rather than "unavailable" while Privy's chunk lands.
  if (!PRIVY_CONFIGURED && !wagmiAddress) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Set NEXT_PUBLIC_PRIVY_APP_ID"
      >
        Login unavailable
      </Button>
    );
  }

  if (!auth.ready) {
    return (
      <Button variant="ghost" size="sm" disabled>
        Loading…
      </Button>
    );
  }

  if (!auth.signedIn) {
    return (
      <Button
        variant="default"
        size={compact ? "sm" : "default"}
        onClick={() => auth.login()}
      >
        Sign in
      </Button>
    );
  }

  const address = privy?.address ?? wagmiAddress;
  const label = privy?.label ?? (address ? truncateAddress(address, 4) : "Wallet");
  const explorerChainId = chainId || zgTestnet.id;

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    toast.success("Address copied");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2 pr-3">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              chainId === zgMainnet.id ? "bg-green-400" : "bg-sky-400",
            )}
          />
          <span className="font-mono text-xs">
            {address ? truncateAddress(address, 4) : "No wallet"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Signed in</DropdownMenuLabel>
        <div className="px-2.5 pb-2 text-xs text-white/70">
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 opacity-60" />
            <span className="truncate">{label}</span>
          </div>
          {address ? (
            <div className="mt-1 font-mono text-[11px] text-white/50">
              {truncateAddress(address, 6)}
            </div>
          ) : null}
        </div>
        <DropdownMenuSeparator />

        {address ? (
          <>
            <DropdownMenuItem onSelect={copyAddress}>
              <Copy className="h-3.5 w-3.5 opacity-70" />
              Copy address
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={explorerAddress(explorerChainId, address)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                View on explorer
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuLabel>Network</DropdownMenuLabel>
        {supportedChains.map((chain) => {
          const active = chainId === chain.id;
          return (
            <DropdownMenuItem
              key={chain.id}
              onSelect={() => {
                if (!active) switchChain({ chainId: chain.id });
              }}
              disabled={switching}
            >
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  active ? "bg-green-400" : "bg-white/30",
                )}
              />
              {chain.name}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void auth.logout();
          }}
          className="text-red-300 focus:text-red-200"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
