/**
 * MilestoneVault contract helpers.
 */

export const MILESTONE_STATUS = {
  PENDING: 0,
  SUBMITTED: 1,
  RELEASED: 2,
  REJECTED: 3,
} as const;

export type MilestoneStatus =
  (typeof MILESTONE_STATUS)[keyof typeof MILESTONE_STATUS];

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  0: "Pending",
  1: "Submitted",
  2: "Released",
  3: "Rejected",
};

export interface Milestone {
  amount: bigint;
  status: MilestoneStatus;
  criteria: string;
  evidenceRoot: `0x${string}`;
  assertionId: `0x${string}`;
}

export interface GrantSummary {
  dao: `0x${string}`;
  grantee: `0x${string}`;
  token: `0x${string}`;
  totalAmount: bigint;
  releasedAmount: bigint;
  grantExpiresAt: bigint;
  reclaimed: boolean;
  milestoneCount: bigint;
}

export function decodeMilestoneStatus(raw: number | bigint): MilestoneStatus {
  const n = Number(raw);
  if (n >= 0 && n <= 3) return n as MilestoneStatus;
  return 0;
}
