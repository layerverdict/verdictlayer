import Link from "next/link";

import { HeroHeading } from "@/components/marketing/HeroHeading";

/* ─────────────────── Hero ─────────────────── */

function HeroSection() {
  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-40">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-20 lg:grid-cols-2">
        <div className="relative z-10 space-y-10">
          <HeroHeading />

          <p className="max-w-lg text-xl font-light leading-relaxed text-white/60">
            Verdict Layer is a verifiable AI decision layer on 0G. TEE-attested judges
            read your evidence, reason in the open, and publish a signed verdict
            on-chain in seconds.
          </p>

          <div className="flex flex-col items-start gap-4 pt-4 sm:flex-row sm:items-center">
            <Link
              href="/escrow"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 font-medium text-black shadow-[0_0_30px_rgba(255,255,255,0.15)] transition-all hover:bg-white/90 sm:w-auto"
            >
              Open a case
              <svg
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <a
              href="#how-it-works"
              className="w-full rounded-xl border border-white/20 px-8 py-4 text-center font-medium text-white/80 backdrop-blur-sm transition-colors hover:border-white/50 hover:text-white sm:w-auto"
            >
              How it works
            </a>
          </div>
        </div>

        {/* Protocol flow diagram */}
        <div className="relative flex h-[450px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:24px_24px]" />
          <svg
            viewBox="0 0 520 340"
            className="relative z-10 h-full w-full p-4"
            role="img"
            aria-label="Verdict protocol: evidence uploaded to 0G Storage is read by a TEE-attested judge which publishes a signed outcome on 0G Chain"
          >
            {/* ── NODES: Top Row ── */}

            {/* Asserter */}
            <g>
              <circle cx="65" cy="100" r="32" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <path d="M53,92 H77 M53,100 H77 M53,108 H69" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" />
              <text x="65" y="150" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="12" fill="rgba(255,255,255,0.8)">
                Asserter
              </text>
              <text x="65" y="164" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">
                client / dApp
              </text>
            </g>

            {/* Verdict Judge (TEE) */}
            <g>
              <rect x="174" y="58" width="92" height="84" rx="14" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <g transform="translate(194, 78)">
                <rect x="6" y="6" width="40" height="40" rx="6" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
                <path d="M16 22 L24 36 L34 14" stroke="rgba(255,255,255,0.9)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="26" cy="26" r="1.8" fill="white">
                  <animate attributeName="r" values="1.5;2.8;1.5" dur="3s" repeatCount="indefinite" />
                </circle>
              </g>
              <text x="220" y="162" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="12" fill="rgba(255,255,255,0.8)">
                Judge
              </text>
              <text x="220" y="176" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">
                TEE · sealed
              </text>
            </g>

            {/* Application contract */}
            <g>
              <rect x="364" y="62" width="72" height="76" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <line x1="376" y1="80" x2="424" y2="80" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <line x1="376" y1="92" x2="418" y2="92" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <line x1="376" y1="104" x2="408" y2="104" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <line x1="376" y1="116" x2="414" y2="116" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <text x="400" y="158" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="12" fill="rgba(255,255,255,0.8)">
                Callback
              </text>
              <text x="400" y="172" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">
                escrow / policy
              </text>
            </g>

            {/* ── FLOW LINES ── */}
            <line x1="97" y1="100" x2="174" y2="100" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="4 4" />
            <rect x="113" y="82" width="44" height="14" rx="3" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
            <text x="135" y="92" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(255,255,255,0.4)">
              evidence
            </text>

            <circle cx="97" cy="100" r="11" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
              <animate attributeName="cx" values="97;174;174" keyTimes="0;0.7;1" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="3s" repeatCount="indefinite" />
            </circle>

            <line x1="266" y1="100" x2="364" y2="100" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeDasharray="4 4" />
            <rect x="297" y="84" width="36" height="16" rx="4" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
            <text x="315" y="96" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.6)">
              verdict
            </text>

            <circle cx="266" cy="100" r="4" fill="white">
              <animate attributeName="cx" values="266;364;364" keyTimes="0;0.7;1" dur="2.5s" begin="1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="2.5s" begin="1s" repeatCount="indefinite" />
            </circle>

            <path d="M400 138 C400 210, 65 210, 65 132" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 4">
              <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="2s" repeatCount="indefinite" />
            </path>
            <text x="232" y="216" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.25)">
              auto-settle · payout
            </text>

            {/* ── BOTTOM: 0G Storage + 0G Chain ── */}

            <line x1="220" y1="142" x2="220" y2="240" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 4" />
            <text x="234" y="195" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(255,255,255,0.35)">
              reasoning
            </text>

            <circle cx="220" cy="142" r="3" fill="rgba(255,255,255,0.5)">
              <animate attributeName="cy" values="142;240;240" keyTimes="0;0.7;1" dur="2s" begin="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="2s" begin="1.5s" repeatCount="indefinite" />
            </circle>

            {/* 0G Storage */}
            <g>
              <polygon points="220,240 248,256 248,288 220,304 192,288 192,256" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <circle cx="220" cy="272" r="5" fill="white" />
              <text x="220" y="322" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="11" fill="rgba(255,255,255,0.8)">
                0G Storage
              </text>
              <text x="220" y="335" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">
                evidence · reasoning
              </text>
            </g>

            <line x1="248" y1="272" x2="370" y2="272" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 4" />
            <text x="309" y="262" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(255,255,255,0.35)">
              anchor
            </text>

            <circle cx="248" cy="272" r="9" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
              <animate attributeName="cx" values="248;370;370" keyTimes="0;0.7;1" dur="3s" begin="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="3s" begin="2s" repeatCount="indefinite" />
            </circle>

            {/* 0G Chain */}
            <g>
              <circle cx="400" cy="272" r="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <rect x="387" y="261" width="26" height="20" rx="3" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              <line x1="387" y1="267" x2="413" y2="267" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <circle cx="407" cy="274" r="2" fill="white" />
              <text x="400" y="318" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="11" fill="rgba(255,255,255,0.8)">
                0G Chain
              </text>
              <text x="400" y="331" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">
                AssertionRegistry
              </text>
            </g>

            <path d="M400 138 L400 244" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3 3" />
            <text x="412" y="195" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="rgba(255,255,255,0.1)">
              log
            </text>
          </svg>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── Stats ─────────────────── */

function StatsSection() {
  return (
    <section className="border-y border-white/10 bg-white/[0.03] backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="flex flex-col items-center space-y-1 text-center">
            <span className="font-mono text-4xl font-medium tracking-tighter text-white">
              ~30s
            </span>
            <span className="text-xs font-medium uppercase tracking-widest text-white/40">
              Time to verdict
            </span>
          </div>
          <div className="flex flex-col items-center space-y-1 text-center md:border-x md:border-white/10 md:px-12">
            <span className="font-mono text-4xl font-medium tracking-tighter text-white">
              3×
            </span>
            <span className="text-xs font-medium uppercase tracking-widest text-white/40">
              Panel swarm on appeal
            </span>
          </div>
          <div className="flex flex-col items-center space-y-1 text-center">
            <span className="font-mono text-4xl font-medium tracking-tighter text-white">
              ERC-792
            </span>
            <span className="text-xs font-medium uppercase tracking-widest text-white/40">
              Arbitrator compatible
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── Features ─────────────────── */

function FeatureCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group cursor-default">
      <div className="relative mb-8 flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-sm transition-all duration-300 group-hover:border-white/20 group-hover:bg-white/[0.07]">
        {children}
      </div>
      <h3 className="mb-3 text-xl font-medium text-white">{title}</h3>
      <p className="text-sm font-light leading-relaxed text-white/50">{description}</p>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="px-6 py-32">
      <div className="mx-auto max-w-7xl">
        <div className="mb-20 max-w-2xl">
          <h2 className="mb-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Three verifications,
            <br /> one assertion primitive.
          </h2>
          <p className="text-lg font-light text-white/50">
            Verdict Layer stitches 0G Compute, Storage, and Chain into a single on-chain
            resource. Judges inherit the guarantees of the TEE they run in; every
            outcome is cryptographically traceable from evidence to payout.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-16 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            title="Sealed Inference"
            description="Judges run in TEE enclaves on 0G Compute. The model never sees your data outside the attested boundary; every completion ships with a provider signature."
          >
            <svg width="200" height="120" viewBox="0 0 200 120" className="relative z-10 transition-transform duration-500 group-hover:scale-105" aria-hidden="true">
              <rect x="60" y="30" width="80" height="60" rx="8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
              <rect x="70" y="40" width="60" height="40" rx="3" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3 3" />
              <path d="M82 50 L90 60 L118 40" stroke="rgba(255,255,255,0.9)" strokeWidth="2" fill="none" strokeLinecap="round" />
              <circle cx="150" cy="60" r="6" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              <path d="M148 60 L149 62 L152 57" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <text x="100" y="104" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">
                TEE · attested
              </text>
            </svg>
          </FeatureCard>

          <FeatureCard
            title="Auditable Reasoning"
            description="Every chain-of-thought is written to 0G Storage. Its root hash is anchored in the verdict event, so any third party can replay the decision."
          >
            <svg width="200" height="120" viewBox="0 0 200 120" className="relative z-10 transition-transform duration-500 group-hover:-translate-y-1" aria-hidden="true">
              <rect x="30" y="30" width="140" height="60" rx="6" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <line x1="45" y1="45" x2="140" y2="45" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="45" y1="55" x2="120" y2="55" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="45" y1="65" x2="130" y2="65" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="45" y1="75" x2="110" y2="75" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" />
              <rect x="150" y="73" width="16" height="14" rx="2" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
              <text x="158" y="83" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="rgba(255,255,255,0.8)">
                0x
              </text>
            </svg>
          </FeatureCard>

          <FeatureCard
            title="ERC-792 Compatible"
            description="AssertionRegistry implements the ERC-792 arbitrator interface. Kleros-integrated dApps can swap Verdict Layer in without touching their application layer."
          >
            <div className="relative z-10 w-full max-w-[220px] rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm transition-transform duration-500 group-hover:-translate-y-2">
              <div className="mb-3 flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
              </div>
              <div className="font-mono text-[11px] leading-5 text-white/40">
                <span className="text-white">import</span>{" "}
                {`{ IArbitrator }`}{" "}
                <span className="text-white">from</span>{" "}
                {`'@kleros'`};
                <br />
                <br />
                <span className="text-white/30">{"// Drop-in replacement"}</span>
                <br />
                <span className="text-white">IArbitrator</span> v ={" "}
                <span className="text-sky-300">Verdict</span>(reg);
              </div>
            </div>
          </FeatureCard>

          <FeatureCard
            title="Reputation NFTs"
            description="Each judge owns an ERC-7857 Agent ID. Verdict counts, appeal losses, and reputation score are all on-chain, queryable, and non-transferable."
          >
            <svg width="200" height="120" viewBox="0 0 200 120" className="relative z-10 transition-transform duration-500 group-hover:scale-105" aria-hidden="true">
              <rect x="75" y="35" width="50" height="50" rx="10" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <circle cx="100" cy="52" r="7" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
              <path d="M88 74 Q100 66 112 74" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M75 45 H60 M75 60 H60 M75 75 H60" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              <path d="M125 45 H140 M125 60 H140 M125 75 H140" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              <circle cx="60" cy="45" r="2" fill="white" />
              <circle cx="140" cy="75" r="2" fill="white" />
              <text x="100" y="104" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">
                ERC-7857 Agent ID
              </text>
            </svg>
          </FeatureCard>

          <FeatureCard
            title="Appeal Swarm"
            description="AUDITED assertions can be challenged during a bond-backed window. Three distinct models (GLM-5, DeepSeek v3, Qwen3) vote in parallel; the majority wins."
          >
            <svg width="200" height="120" viewBox="0 0 200 120" className="relative z-10 transition-transform duration-700 group-hover:rotate-1" aria-hidden="true">
              <circle cx="50" cy="60" r="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
              <path d="M42 58 L48 66 L60 52" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="100" cy="60" r="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
              <path d="M92 58 L98 66 L110 52" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="150" cy="60" r="18" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
              <path d="M144 56 L156 68 M156 56 L144 68" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" />
              <text x="100" y="104" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">
                majority · 2 of 3
              </text>
            </svg>
          </FeatureCard>

          <FeatureCard
            title="Real-Time Reasoning"
            description="Clients stream tokens over SSE as the judge thinks. Users watch the chain-of-thought form before the on-chain transaction even lands."
          >
            <svg width="200" height="120" viewBox="0 0 200 120" className="relative z-10 transition-transform duration-500 group-hover:scale-105" aria-hidden="true">
              <line x1="20" y1="100" x2="180" y2="100" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
              <polyline points="20,85 45,75 70,78 95,50 120,55 145,32 170,20" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="45" cy="75" r="3" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="70" cy="78" r="3" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="95" cy="50" r="3" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="120" cy="55" r="3" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="145" cy="32" r="3" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="170" cy="20" r="4" fill="white" />
              <path d="M20 100 L20 85 L45 75 L70 78 L95 50 L120 55 L145 32 L170 20 V100 H20 Z" fill="white" fillOpacity="0.05" />
            </svg>
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── Use Cases ─────────────────── */

const useCases = [
  {
    href: "/escrow",
    title: "Freelance Escrow",
    description:
      "Client and freelancer lock funds against a scope. If they disagree, Verdict reads both sides of the story and auto-settles the payout in under a minute.",
    accent: "clause · evidence · verdict",
  },
  {
    href: "/insurance",
    title: "Parametric Insurance",
    description:
      "Policy holders file a claim. The judge pulls the underlying oracle feed, verifies the trigger, and releases the payout — no adjuster, no paperwork.",
    accent: "oracle · policy · payout",
  },
  {
    href: "/milestones",
    title: "DAO Milestone Vault",
    description:
      "Grant recipients submit proof against pre-approved milestone criteria. The treasury auto-releases the slice the judge confirms — no manual voting loop.",
    accent: "proof · criteria · release",
  },
  {
    href: "/authenticity",
    title: "NFT Authenticity",
    description:
      "A vision-capable judge compares perceptual hashes and on-chain metadata. Verdict mints a non-transferable attestation NFT as the signed certificate.",
    accent: "hash · metadata · attest",
  },
] as const;

function UseCasesSection() {
  return (
    <section id="use-cases" className="border-y border-white/10 bg-white/[0.02] py-32 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 max-w-2xl">
          <h2 className="mb-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Four apps. <br /> One primitive.
          </h2>
          <p className="text-lg font-light text-white/50">
            Every app on Verdict Layer is a thin shell over the same{" "}
            <span className="font-mono text-white/70">AssertionRegistry</span>.
            Change the claim template, keep the guarantees.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {useCases.map((u) => (
            <Link
              key={u.href}
              href={u.href}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/[0.07]"
            >
              <div className="mb-6 inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-white/40">
                {u.accent}
              </div>
              <h3 className="mb-3 text-2xl font-semibold text-white">{u.title}</h3>
              <p className="mb-6 font-light leading-relaxed text-white/55">{u.description}</p>
              <div className="flex items-center gap-2 text-sm font-medium text-white/60 transition-colors group-hover:text-white">
                Open app
                <svg
                  className="h-4 w-4 transition-transform group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── How It Works ─────────────────── */

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="overflow-hidden border-y border-white/10 bg-white/[0.02] py-32 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-24 text-center">
          <h2 className="mb-4 text-3xl font-semibold text-white">How it works</h2>
          <p className="text-white/50">From claim to payout in three steps</p>
        </div>

        <div className="relative">
          <div className="absolute bottom-0 left-6 top-0 -ml-[0.5px] w-px border-l border-dashed border-white/20 bg-transparent md:left-1/2" />

          {/* Step 01 */}
          <div className="group relative mb-32 flex flex-col items-center justify-between md:flex-row">
            <div className="hidden w-5/12 pr-16 text-right md:block">
              <h3 className="mb-3 text-2xl font-medium text-white">Open a case</h3>
              <p className="font-light leading-relaxed text-white/50">
                A dApp (or user directly) writes an assertion to the registry.
                Claim text, evidence root hashes, bond, and a callback selector go in.
              </p>
            </div>
            <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] font-mono text-lg font-medium text-white shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:border-white group-hover:bg-white group-hover:text-black">
              01
            </div>
            <div className="-mt-10 mb-10 w-full pl-20 md:hidden">
              <h3 className="mb-2 text-xl font-medium text-white">Open a case</h3>
              <p className="text-sm font-light text-white/50">
                A dApp writes an assertion to the registry.
              </p>
            </div>
            <div className="w-full pl-0 md:w-5/12 md:pl-16">
              <div className="mx-auto w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-sm transition-transform duration-500 group-hover:translate-x-2 md:mx-0">
                <div className="mb-4 flex items-center gap-4 border-b border-white/10 pb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.08] text-white/60">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="h-2 w-32 rounded-full bg-white/10" />
                    <div className="h-2 w-20 rounded-full bg-white/[0.06]" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between font-mono text-xs text-white/40">
                    <span>MODE</span>
                    <span className="rounded bg-white/10 px-2 py-0.5 text-white">AUDITED</span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-xs text-white/40">
                    <span>WINDOW</span>
                    <span className="text-white">30 min</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 02 */}
          <div className="group relative mb-32 flex flex-col items-center justify-between md:flex-row-reverse">
            <div className="hidden w-5/12 pl-16 text-left md:block">
              <h3 className="mb-3 text-2xl font-medium text-white">Judge reasons in TEE</h3>
              <p className="font-light leading-relaxed text-white/50">
                Evidence is pulled from 0G Storage. A sealed-inference model reads
                the claim, cites each root hash it uses, and streams the reasoning
                back as it forms.
              </p>
            </div>
            <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] font-mono text-lg font-medium text-white shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:border-white group-hover:bg-white group-hover:text-black">
              02
            </div>
            <div className="-mt-10 mb-10 w-full pl-20 md:hidden">
              <h3 className="mb-2 text-xl font-medium text-white">Judge reasons in TEE</h3>
              <p className="text-sm font-light text-white/50">Sealed inference reads evidence.</p>
            </div>
            <div className="flex w-full justify-end pr-0 md:w-5/12 md:pr-16">
              <div className="mx-auto w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-sm transition-transform duration-500 group-hover:-translate-x-2 md:mx-0">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-white/30">
                  Reasoning · streaming
                </div>
                <div className="space-y-2 font-mono text-xs">
                  <div className="rounded border border-white/10 bg-white/[0.04] p-3 text-white/60">
                    Clause 3 requires responsive CSS.{" "}
                    <span className="text-white/30">Bob&apos;s file contains</span>{" "}
                    <span className="text-white">@media(...)</span>{" "}
                    <span className="text-white/30">at 640/768/1024px.</span>
                  </div>
                  <div className="rounded border border-white/10 bg-white/[0.04] p-3 text-white/60">
                    <span className="text-white">outcome</span>:{" "}
                    <span className="text-emerald-300">FALSE</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 03 */}
          <div className="group relative flex flex-col items-center justify-between md:flex-row">
            <div className="hidden w-5/12 pr-16 text-right md:block">
              <h3 className="mb-3 text-2xl font-medium text-white">Verdict settles on-chain</h3>
              <p className="font-light leading-relaxed text-white/50">
                The outcome, reasoning root, and TEE attestation are submitted
                to the registry. The enforcer dispatches the callback — funds
                move, claims pay out, vaults unlock.
              </p>
            </div>
            <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] font-mono text-lg font-medium text-white shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:border-white group-hover:bg-white group-hover:text-black">
              03
            </div>
            <div className="-mt-10 mb-10 w-full pl-20 md:hidden">
              <h3 className="mb-2 text-xl font-medium text-white">Verdict settles on-chain</h3>
              <p className="text-sm font-light text-white/50">Enforcer dispatches the callback.</p>
            </div>
            <div className="w-full pl-0 md:w-5/12 md:pl-16">
              <div className="mx-auto w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-sm transition-transform duration-500 group-hover:translate-x-2 md:mx-0">
                <div className="mb-6 flex items-end gap-3">
                  <span className="font-mono text-3xl font-medium tracking-tight text-white">
                    38s
                  </span>
                  <div className="mb-1 flex items-center rounded border border-green-400/20 bg-green-400/10 px-2 py-1 font-mono text-xs text-green-400">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true" className="mr-1">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    resolved
                  </div>
                </div>
                <div className="flex h-16 items-end gap-2 px-2">
                  <div className="h-[40%] flex-1 rounded-t-sm bg-white/10 transition-colors hover:bg-white/20" />
                  <div className="h-[60%] flex-1 rounded-t-sm bg-white/10 transition-colors hover:bg-white/20" />
                  <div className="h-[30%] flex-1 rounded-t-sm bg-white/10 transition-colors hover:bg-white/20" />
                  <div className="h-[80%] flex-1 rounded-t-sm bg-white/10 transition-colors hover:bg-white/20" />
                  <div className="h-[50%] flex-1 rounded-t-sm bg-white/10 transition-colors hover:bg-white/20" />
                  <div className="h-[90%] flex-1 rounded-t-sm bg-white shadow-lg shadow-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── CTA ─────────────────── */

function CTASection() {
  return (
    <section className="px-6 py-32">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="mb-8 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Ready to settle <br />
          your first dispute?
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-lg font-light text-white/50 sm:text-xl">
          The hackathon runs on 0G Mainnet. Spin up an escrow, upload evidence,
          and watch the verdict ship on-chain in real time.
        </p>

        <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
          <Link
            href="/escrow"
            className="w-full rounded-xl bg-white px-10 py-4 font-medium text-black shadow-[0_0_40px_rgba(255,255,255,0.15)] transition-all hover:bg-white/90 sm:w-auto"
          >
            Open a case
          </Link>
          <a
            href="https://github.com/qvkare/verdict#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl border border-white/20 px-10 py-4 text-center font-medium text-white/70 transition-colors hover:border-white/50 hover:text-white sm:w-auto"
          >
            Read the docs
          </a>
        </div>

        <div className="mt-24 border-t border-white/10 pt-16">
          <p className="mb-8 font-mono text-xs uppercase tracking-widest text-white/30">
            Powered by 0G
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 opacity-30 transition-all duration-700 hover:opacity-70 md:gap-14">
            <span className="font-sans text-xl font-bold tracking-tight text-white">
              Compute · TEE
            </span>
            <span className="font-sans text-xl font-bold tracking-tight text-white">
              Storage
            </span>
            <span className="font-sans text-xl font-bold tracking-tight text-white">
              Chain · EVM
            </span>
            <span className="font-sans text-xl font-bold tracking-tight text-white">
              Agent ID · ERC-7857
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── Page ─────────────────── */

export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <UseCasesSection />
      <HowItWorksSection />
      <CTASection />
    </>
  );
}
