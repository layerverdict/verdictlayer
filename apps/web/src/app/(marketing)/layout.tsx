import type { ReactNode } from "react";

import { BeamsBackground } from "@/components/marketing/BeamsBackground";
import { MarketingFooter } from "@/components/marketing/site-footer";
import { MarketingHeader } from "@/components/marketing/site-header";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <BeamsBackground />
      <MarketingHeader />
      <div className="relative z-10">
        <main>{children}</main>
        <MarketingFooter />
      </div>
    </div>
  );
}
