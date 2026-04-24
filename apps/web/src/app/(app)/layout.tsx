import type { ReactNode } from "react";

import { AppShell } from "@/components/verdict/app-shell";

// The app shell depends on live wallet / chain state, so there's no
// useful pre-rendered version. Marking the group dynamic keeps Next
// from trying to SSG any /escrow/* page (which crashes WalletConnect's
// IndexedDB init).
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
