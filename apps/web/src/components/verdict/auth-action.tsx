"use client";

import { type ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { PRIVY_CONFIGURED, useAuth } from "@/lib/auth";

interface AuthActionProps extends ButtonProps {
  /** Called when the user is authenticated AND has an address. */
  onAction: () => void | Promise<void>;
  /** Button label shown when signed in. */
  children: ReactNode;
  /** Label shown to unauthenticated users. Defaults to "Sign in to continue". */
  signInLabel?: string;
}

/**
 * Drop-in replacement for an action `Button` that requires a connected
 * wallet. When the user isn't signed in, the button becomes a Privy
 * login trigger so authentication happens inline without a route change.
 */
export function AuthAction({
  onAction,
  children,
  signInLabel,
  ...rest
}: AuthActionProps) {
  const { ready, signedIn, login } = useAuth();

  if (!ready) {
    return (
      <Button disabled {...rest}>
        Loading…
      </Button>
    );
  }

  if (!signedIn) {
    const label = signInLabel ?? (PRIVY_CONFIGURED ? "Sign in to continue" : "Connect wallet");
    return (
      <Button
        {...rest}
        disabled={!PRIVY_CONFIGURED}
        title={PRIVY_CONFIGURED ? undefined : "Set NEXT_PUBLIC_PRIVY_APP_ID to enable sign-in"}
        onClick={(event) => {
          event.preventDefault();
          if (PRIVY_CONFIGURED) login();
        }}
      >
        {label}
      </Button>
    );
  }

  return (
    <Button
      {...rest}
      onClick={() => {
        void onAction();
      }}
    >
      {children}
    </Button>
  );
}
