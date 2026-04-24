/**
 * ParametricInsurance contract helpers.
 */

export const POLICY_STATUS = {
  NONE: 0,
  ACTIVE: 1,
  CLAIM_PENDING: 2,
  PAID: 3,
  EXPIRED: 4,
} as const;

export type PolicyStatus = (typeof POLICY_STATUS)[keyof typeof POLICY_STATUS];

export const POLICY_STATUS_LABEL: Record<PolicyStatus, string> = {
  0: "Unknown",
  1: "Active",
  2: "Claim pending",
  3: "Paid",
  4: "Expired",
};

export interface Policy {
  insurer: `0x${string}`;
  holder: `0x${string}`;
  premium: bigint;
  payout: bigint;
  coverageStart: bigint;
  coverageEnd: bigint;
  status: PolicyStatus;
  condition: string;
  evidenceSpec: `0x${string}`;
  claimEvidence: `0x${string}`;
  assertionId: `0x${string}`;
}

export function decodePolicyStatus(raw: number | bigint): PolicyStatus {
  const n = Number(raw);
  if (n >= 0 && n <= 4) return n as PolicyStatus;
  return 0;
}
