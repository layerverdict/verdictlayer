import Link from "next/link";

import { VerdictLogo } from "@/components/verdict/logo";

export function MarketingFooter() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-white/[0.03] px-6 py-20 text-sm backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-16 lg:flex-row">
        <div className="space-y-6 lg:w-1/3">
          <div className="flex items-center gap-3">
            <VerdictLogo className="text-white" />
            <span className="text-lg font-bold tracking-tight text-white">
              Verdict
            </span>
          </div>
          <p className="font-light leading-relaxed text-white/40">
            The verifiable AI assertion layer. TEE-attested judges. On-chain
            enforcement. Every verdict cryptographically auditable. Built on 0G.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 lg:w-2/3">
          <div className="space-y-4">
            <h4 className="font-semibold text-white/80">Apps</h4>
            <ul className="space-y-3 text-white/40">
              <li>
                <Link href="/escrow" className="transition-colors hover:text-white">
                  Escrow
                </Link>
              </li>
              <li>
                <Link href="/insurance" className="transition-colors hover:text-white">
                  Insurance
                </Link>
              </li>
              <li>
                <Link href="/milestones" className="transition-colors hover:text-white">
                  Milestones
                </Link>
              </li>
              <li>
                <Link href="/authenticity" className="transition-colors hover:text-white">
                  Authenticity
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-semibold text-white/80">Protocol</h4>
            <ul className="space-y-3 text-white/40">
              <li>
                <Link href="/architecture" className="transition-colors hover:text-white">
                  Architecture
                </Link>
              </li>
              <li>
                <a
                  href="https://docs.0g.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  0G Docs
                </a>
              </li>
              <li>
                <a
                  href="https://chainscan.0g.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  Explorer
                </a>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-semibold text-white/80">Resources</h4>
            <ul className="space-y-3 text-white/40">
              <li>
                <a
                  href="https://github.com/qvkare/verdict"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/qvkare/verdict#readme"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  README
                </a>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-semibold text-white/80">Social</h4>
            <ul className="space-y-3 text-white/40">
              <li>
                <a
                  href="https://x.com/0G_labs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  0G on X
                </a>
              </li>
              <li>
                <a
                  href="https://hackquest.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-white"
                >
                  HackQuest
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-20 flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-white/30 md:flex-row">
        <p>&copy; {new Date().getFullYear()} Verdict. Built for the 0G APAC Hackathon 2026.</p>
        <div className="flex gap-6">
          <a
            href="https://chainscan.0g.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-white"
          >
            0G Mainnet
          </a>
          <a
            href="https://chainscan-galileo.0g.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-white"
          >
            Galileo Testnet
          </a>
        </div>
      </div>
    </footer>
  );
}
