"use client";

import { Typewriter } from "@/components/ui/typewriter";

export function HeroHeading() {
  return (
    <h1 className="text-5xl font-semibold leading-[1.15] tracking-tight text-white sm:text-6xl lg:text-7xl">
      Decide Any
      {/* Fixed height = 2 lines × line-height(1.15) → prevents layout jump */}
      <span className="block min-h-[2.3em]">
        <Typewriter
          text={[
            "Freelance Dispute",
            "Insurance Claim",
            "DAO Milestone",
            "NFT Authenticity",
            "Prediction Market",
            "On-Chain Fact",
          ]}
          speed={60}
          deleteSpeed={35}
          waitTime={2200}
          className="text-white/40"
          cursorChar="_"
          cursorClassName="ml-0.5 text-white/30"
        />
      </span>
    </h1>
  );
}
