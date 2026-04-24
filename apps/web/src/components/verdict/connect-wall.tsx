"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Guards children behind a connected wallet. Replace with a more
 * nuanced gate once we split reader-only pages.
 */
export function ConnectWall({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  if (isConnected) return <>{children}</>;
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader className="items-center">
          <CardTitle>Wallet required</CardTitle>
          <CardDescription>
            Connect a wallet on 0G Mainnet or the Galileo Testnet to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <ConnectButton showBalance={false} />
        </CardContent>
      </Card>
    </div>
  );
}
