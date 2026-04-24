"use client";

import { usePrivy } from "@privy-io/react-auth";
import type { ReactNode } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PRIVY_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

/**
 * Page-level auth gate for routes that can't do anything without a
 * signed-in user (primarily the /new create flows). List and detail
 * routes should NOT use this — they render read-only content for
 * visitors and reserve auth prompts for specific actions (see
 * `AuthAction`).
 */
export function ConnectWall({ children }: { children: ReactNode }) {
  if (!PRIVY_CONFIGURED) {
    return <WagmiOnlyGate>{children}</WagmiOnlyGate>;
  }
  return <PrivyGate>{children}</PrivyGate>;
}

function WagmiOnlyGate({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  if (isConnected) return <>{children}</>;
  return (
    <GateCard
      title="Wallet required"
      description="Connect an EVM wallet to use this flow. Once sign-in is configured (NEXT_PUBLIC_PRIVY_APP_ID), email / social options become available."
    />
  );
}

function PrivyGate({ children }: { children: ReactNode }) {
  const { ready, authenticated, login } = usePrivy();
  const { isConnected } = useAccount();

  if (!ready) {
    return <GateCard title="Loading…" description="Reading your session." />;
  }
  if (authenticated || isConnected) return <>{children}</>;

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader className="items-center">
          <CardTitle>Sign in to continue</CardTitle>
          <CardDescription>
            Use an email, a social account, or connect an existing wallet. An
            embedded wallet is created for email/social logins automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={login}>Sign in</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function GateCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardHeader className="items-center">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
