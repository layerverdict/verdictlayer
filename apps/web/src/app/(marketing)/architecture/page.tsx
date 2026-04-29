import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/verdict/page-header";

export default function ArchitecturePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-40">
      <PageHeader
        eyebrow="Protocol"
        title="Architecture"
        description="Verdict Layer splits into four on-chain contracts and three off-chain services. The registry is the source of truth; everything else is pluggable."
      />
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AssertionRegistry</CardTitle>
            <CardDescription>Canonical store of assertions.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-white/60">
            Every assertion has a claim, evidence roots, bond, callback, and
            mode. Implements <code className="font-mono text-white/80">IArbitrator</code>{" "}
            so any ERC-792 dApp can swap in Verdict Layer without touching its
            application layer.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>VerdictEnforcer</CardTitle>
            <CardDescription>On-chain callback dispatcher.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-white/60">
            Looks up the assertion, validates the caller is the registry, and
            dispatches the callback to the application contract (escrow,
            policy, vault…).
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>EscalationManager</CardTitle>
            <CardDescription>Bond flow + appeal state machine.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-white/60">
            Holds challenge bonds, orchestrates the appeal swarm, pays winners,
            slashes losers. All state transitions emit events that the SSE
            stream consumes.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>ReputationRegistry</CardTitle>
            <CardDescription>ERC-7857 Agent ID NFTs.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-white/60">
            Each judge owns a non-transferable NFT carrying verdict counts,
            appeal losses, and model metadata. Reputation is queryable by any
            application contract.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
