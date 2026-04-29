import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/verdict/empty-state";
import { PageHeader } from "@/components/verdict/page-header";
import { truncateAddress } from "@/lib/format";
import { listJudges, type JudgeRow } from "@/lib/api-server";
import { maybeContractAddress } from "@/lib/web3/addresses";
import { explorerAddress, zgMainnet } from "@/lib/web3/chains";

export const dynamic = "force-dynamic";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? zgMainnet.id);

export default async function JudgesPage() {
  const registry = maybeContractAddress("reputationRegistry");
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Protocol · Judges"
        title="TEE Judge reputation"
        description="Every judge that adjudicates on Verdict Layer owns a non-transferable ERC-7857 NFT. Verdict counts, appeal losses, and reputation are on-chain and queryable."
      />
      {!registry ? <NotDeployed /> : <JudgeGallery />}
    </div>
  );
}

function NotDeployed() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contracts not deployed on this chain</CardTitle>
        <CardDescription>
          Publish the ReputationRegistry address to{" "}
          <code className="font-mono text-white/70">
            NEXT_PUBLIC_REPUTATION_REGISTRY
          </code>
          .
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

async function JudgeGallery() {
  const { judges } = await listJudges();

  if (judges.length === 0) {
    return (
      <EmptyState
        title="No judges minted yet"
        description="The protocol mints a ReputationRegistry NFT for each TEE agent the first time they settle a verdict."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {judges.map((judge) => (
        <JudgeCard key={judge.tokenId} judge={judge} />
      ))}
    </div>
  );
}

function JudgeCard({ judge }: { judge: JudgeRow }) {
  const { tokenId, owner, model, reputation, totalVerdicts, appealsLost } = judge;
  const winRate =
    totalVerdicts > 0
      ? Math.max(0, ((totalVerdicts - appealsLost) / totalVerdicts) * 100)
      : null;

  const repTone =
    reputation >= 1000
      ? ("success" as const)
      : reputation >= 800
        ? ("info" as const)
        : reputation >= 500
          ? ("warning" as const)
          : ("danger" as const);

  return (
    <Card className="overflow-hidden">
      <div className="relative h-32 bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-transparent">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(255,255,255,0.15),_transparent_50%)]" />
        <div className="absolute bottom-3 left-4 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/50">
            ERC-7857 · Agent ID
          </span>
        </div>
        <div className="absolute right-4 top-3 font-mono text-3xl font-light tracking-tight text-white/80">
          #{tokenId}
        </div>
      </div>
      <CardHeader className="gap-1">
        <CardTitle className="text-base">{model}</CardTitle>
        <CardDescription>
          <a
            href={explorerAddress(CHAIN_ID, owner)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] hover:text-white/70"
          >
            {truncateAddress(owner, 6)}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">
              Reputation
            </div>
            <div className="font-mono text-3xl font-medium tracking-tight text-white">
              {reputation}
            </div>
          </div>
          <Badge variant={repTone}>
            {reputation >= 1000
              ? "healthy"
              : reputation >= 800
                ? "active"
                : reputation >= 500
                  ? "watch"
                  : "low"}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-center">
          <Stat label="Verdicts" value={totalVerdicts} />
          <Stat label="Appeals lost" value={appealsLost} tone="warn" />
          <Stat
            label="Win rate"
            value={winRate !== null ? `${Math.round(winRate)}%` : "—"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "warn";
}) {
  return (
    <div className="space-y-1">
      <div className="font-mono text-[9px] uppercase tracking-widest text-white/30">
        {label}
      </div>
      <div
        className={`font-mono text-lg ${
          tone === "warn" ? "text-yellow-200/80" : "text-white/90"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
