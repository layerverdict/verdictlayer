import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/verdict/page-header";

export default function InsurancePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Insurance"
        title="Parametric Insurance"
        description="Policies pay out automatically when the judge confirms the trigger condition from an external oracle feed."
      />
      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            Policy issuance and one-click claim UI land in the next iteration.
            The backend + assertion flow already work — this screen will plug
            straight into it.
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
