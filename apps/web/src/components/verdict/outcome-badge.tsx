import { Badge } from "@/components/ui/badge";

type Outcome = "PENDING" | "TRUE" | "FALSE" | "INVALID" | "ESCALATED";

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  switch (outcome) {
    case "TRUE":
      return <Badge variant="success">Asserter won</Badge>;
    case "FALSE":
      return <Badge variant="danger">Asserter lost</Badge>;
    case "INVALID":
      return <Badge variant="warning">Invalid</Badge>;
    case "ESCALATED":
      return <Badge variant="info">Escalated</Badge>;
    case "PENDING":
    default:
      return (
        <Badge variant="outline" className="gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          Pending
        </Badge>
      );
  }
}
