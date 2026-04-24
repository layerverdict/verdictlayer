"use client";

import { usePrivy } from "@privy-io/react-auth";
import { type ReactNode } from "react";
import { useAccount } from "wagmi";

import { Button, type ButtonProps } from "@/components/ui/button";

const PRIVY_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

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
 * login trigger. Splits into two subcomponents so that Privy hooks
 * never execute when PrivyProvider isn't mounted.
 */
export function AuthAction(props: AuthActionProps) {
  if (!PRIVY_CONFIGURED) return <WagmiAuthAction {...props} />;
  return <PrivyAuthAction {...props} />;
}

function PrivyAuthAction({
  onAction,
  children,
  signInLabel = "Sign in to continue",
  ...rest
}: AuthActionProps) {
  const { ready, authenticated, login } = usePrivy();
  const { isConnected } = useAccount();
  const signedIn = authenticated || isConnected;

  if (!ready) {
    return (
      <Button disabled {...rest}>
        Loading…
      </Button>
    );
  }
  if (!signedIn) {
    return (
      <Button
        {...rest}
        onClick={(event) => {
          event.preventDefault();
          login();
        }}
      >
        {signInLabel}
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

function WagmiAuthAction({
  onAction,
  children,
  signInLabel = "Connect wallet",
  ...rest
}: AuthActionProps) {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <Button disabled {...rest} title="Set NEXT_PUBLIC_PRIVY_APP_ID to enable sign-in">
        {signInLabel}
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
