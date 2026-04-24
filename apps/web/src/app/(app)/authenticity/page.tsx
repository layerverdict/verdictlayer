import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/verdict/page-header";

export default function AuthenticityPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Application · Authenticity"
        title="NFT Authenticity Certifier"
        description="Upload an image; a vision-capable TEE judge compares perceptual hashes and on-chain metadata, then mints a signed attestation."
      />
      <Card>
        <CardHeader>
          <CardTitle>Coming next</CardTitle>
          <CardDescription>
            Vision-model integration + ERC-7857 attestation mint land next.
            Contract is deployed and ready.
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
