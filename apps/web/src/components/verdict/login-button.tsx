"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Copy, ExternalLink, LogOut, User } from "lucide-react";
import { toast } from "sonner";
import { useChainId, useSwitchChain } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { truncateAddress } from "@/lib/format";
import { explorerAddress, supportedChains } from "@/lib/web3/chains";
import { cn } from "@/lib/utils";

const PRIVY_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

/**
 * The single auth surface. When NEXT_PUBLIC_PRIVY_APP_ID isn't set,
 * the PrivyProvider isn't mounted — we can't call Privy hooks in that
 * case, so we short-circuit to a disabled stub. Splitting the branches
 * into separate components keeps React's Rules of Hooks intact.
 */
export function LoginButton({ compact = false }: { compact?: boolean }) {
  if (!PRIVY_CONFIGURED) {
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
  return <PrivyLoginButton compact={compact} />;
}

function PrivyLoginButton({ compact }: { compact: boolean }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!ready) {
    return (
      <Button variant="ghost" size="sm" disabled>
        Loading…
      </Button>
    );
  }

  if (!authenticated || !user) {
    return (
      <Button variant="default" size={compact ? "sm" : "default"} onClick={login}>
        Sign in
      </Button>
    );
  }

  const wallet = wallets[0];
  const address = (wallet?.address ?? user.wallet?.address) as
    | `0x${string}`
    | undefined;
  const loginLabel = pickLoginLabel(user);

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
              chainId === 16661 ? "bg-green-400" : "bg-sky-400",
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
            <span className="truncate">{loginLabel}</span>
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
                href={explorerAddress(chainId || supportedChains[0].id, address)}
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
        <DropdownMenuItem onSelect={logout} className="text-red-300 focus:text-red-200">
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function pickLoginLabel(user: ReturnType<typeof usePrivy>["user"]): string {
  if (!user) return "";
  if (user.email?.address) return user.email.address;
  if (user.google?.email) return user.google.email;
  if (user.twitter?.username) return `@${user.twitter.username}`;
  if (user.github?.username) return user.github.username;
  if (user.wallet?.address) return truncateAddress(user.wallet.address, 4);
  return "Anonymous";
}
