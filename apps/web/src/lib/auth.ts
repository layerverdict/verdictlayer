"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

/**
 * Whether Privy is wired up in this deployment. Read at module scope so
 * the value is stable across renders and so the guard runs before any
 * Privy hook is invoked — keeps Rules of Hooks happy in the no-Privy
 * scaffolding path.
 */
export const PRIVY_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

export interface AuthState {
  /** Auth layer has finished initialising; UI can read other fields. */
  ready: boolean;
  /** True when the user has either a Privy session or a raw wallet connection. */
  signedIn: boolean;
  /** Trigger the sign-in modal. No-op when Privy isn't configured. */
  login: () => void;
  /** End the session. Drops Privy first (logs out embedded/social), wagmi's
   *  disconnect runs implicitly via Privy teardown. */
  logout: () => void | Promise<void>;
}

/**
 * Single source of truth for "is the visitor authenticated?".
 *
 * In the Privy path `ready` flips true after Privy restores its cached
 * session; `signedIn` is the union of Privy auth + any external wagmi
 * wallet connection. In the scaffolding path (no Privy) we only look at
 * wagmi so the app still renders against a raw MetaMask.
 */
// Pick the implementation at module load, not on every render: React's
// Rules of Hooks forbid conditional hook calls, so we export whichever
// variant matches the build-time env and keep call-site invocation flat.
export const useAuth: () => AuthState = PRIVY_CONFIGURED
  ? usePrivyAuth
  : useWagmiOnlyAuth;

function usePrivyAuth(): AuthState {
  const { ready, authenticated, login, logout } = usePrivy();
  const { isConnected } = useAccount();
  return {
    ready,
    signedIn: authenticated || isConnected,
    login,
    logout,
  };
}

function useWagmiOnlyAuth(): AuthState {
  const { isConnected } = useAccount();
  return {
    ready: true,
    signedIn: isConnected,
    login: () => {
      // No login modal when Privy isn't configured; the header's
      // LoginButton falls back to a "Login unavailable" stub.
    },
    logout: () => {},
  };
}
