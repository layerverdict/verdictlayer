"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PRIVY_CONFIGURED, useAuth } from "@/lib/auth";

/**
 * Page-level auth gate for routes that can't do anything without a
 * signed-in user (primarily the /new create flows). List and detail
 * routes should NOT use this — they render read-only content for
 * visitors and reserve auth prompts for specific actions (see
 * `AuthAction`).
 */
export function ConnectWall({ children }: { children: ReactNode }) {
  const { ready, signedIn, login } = useAuth();

  if (!ready) {
    return <GateCard title="Loading…" description="Reading your session." />;
  }
  if (signedIn) return <>{children}</>;

  if (!PRIVY_CONFIGURED) {
    return (
      <GateCard
        title="Wallet required"
        description="Connect an EVM wallet to use this flow. Configure Privy (NEXT_PUBLIC_PRIVY_APP_ID) to enable email / social sign-in."
      />
    );
  }

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
          <Button onClick={() => login()}>Sign in</Button>
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
