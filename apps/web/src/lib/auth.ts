"use client";

import { createContext, useContext } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

/**
 * Whether Privy is wired up in this deployment. The root layout can
 * still decide to defer Privy's chunk; this flag just tells the UI
 * whether a sign-in button should ever light up.
 */
export const PRIVY_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export interface AuthState {
  /** Auth layer has finished initialising; UI can read other fields. */
  ready: boolean;
  /** True when the user has either a Privy session or a raw wallet connection. */
  signedIn: boolean;
  /** Trigger the sign-in modal or raw wallet connector. */
  login: () => void | Promise<void>;
  /** End the session. */
  logout: () => void | Promise<void>;
}

export interface PrivyAuthValue {
  ready: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => Promise<void> | void;
  /** Best-guess display string for the signed-in user. */
  label: string;
  /** First wallet address Privy knows about, if any. */
  address?: `0x${string}`;
}

/**
 * Context the PrivyLayer populates on mount.
 *
 * Rules of Hooks: `useAuth` calls a fixed set of hooks every render,
 * then selects between the Privy-aware value (when the PrivyLayer
 * provider is in the tree) and a wagmi-only fallback.
 */
export const PrivyAuthContext = createContext<PrivyAuthValue | null>(null);

/** Raw Privy value — null until the lazy PrivyLayer has mounted. */
export function usePrivyAuth(): PrivyAuthValue | null {
  return useContext(PrivyAuthContext);
}

export function useAuth(): AuthState {
  const { isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const privy = useContext(PrivyAuthContext);

  if (privy) {
    return {
      ready: privy.ready,
      signedIn: privy.authenticated || isConnected,
      login: privy.login,
      logout: async () => {
        await privy.logout();
        await disconnectAsync().catch(() => {});
      },
    };
  }

  // Privy either isn't configured, or its chunk hasn't mounted yet.
  // The wagmi injected connector covers "connect existing wallet" —
  // MetaMask and the like surface through it, so the UI still does
  // something useful during the brief window before Privy lands.
  const injected = connectors.find(
    (c) => c.id === "injected" || c.id === "metaMask",
  );
  return {
    ready: true,
    signedIn: isConnected,
    login: async () => {
      if (injected) await connectAsync({ connector: injected });
    },
    logout: () => disconnectAsync().catch(() => undefined),
  };
}
