/**
 * AuthenticityCertifier contract helpers.
 */

export const CHECK_STATUS = {
  NONE: 0,
  PENDING: 1,
  CERTIFIED: 2,
  REJECTED: 3,
} as const;

export type CheckStatus = (typeof CHECK_STATUS)[keyof typeof CHECK_STATUS];

export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  0: "Unknown",
  1: "Pending",
  2: "Certified",
  3: "Rejected",
};

export interface Check {
  submitter: `0x${string}`;
  assetHash: `0x${string}`;
  referenceHash: `0x${string}`;
  status: CheckStatus;
  assertionId: `0x${string}`;
  reasoningRoot: `0x${string}`;
  submittedAt: bigint;
  decidedAt: bigint;
}

export function decodeCheckStatus(raw: number | bigint): CheckStatus {
  const n = Number(raw);
  if (n >= 0 && n <= 3) return n as CheckStatus;
  return 0;
}

export function decodeCheckStatusLabel(label: string): CheckStatus {
  switch (label) {
    case "PENDING":
      return CHECK_STATUS.PENDING;
    case "CERTIFIED":
      return CHECK_STATUS.CERTIFIED;
    case "REJECTED":
      return CHECK_STATUS.REJECTED;
    default:
      return CHECK_STATUS.NONE;
  }
}
