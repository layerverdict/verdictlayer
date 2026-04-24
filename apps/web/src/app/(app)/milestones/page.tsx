import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/verdict/page-header";

export default function MilestonesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Milestones"
        title="DAO Milestone Vault"
        description="Grant recipients submit proof against pre-approved acceptance criteria. The vault releases the slice the judge confirms."
      />
      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            Grant creation + milestone submission UI lands next. Smart contract
            and assertion pipeline are already live.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-white/50">
          For now, try the <code className="font-mono text-white/70">/escrow</code> flow
          end-to-end.
        </CardContent>
      </Card>
    </div>
  );
}
