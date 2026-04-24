/**
 * Escrow contract helpers.
 *
 * EscrowRecord struct layout from Escrow.sol — kept in sync manually
 * since ABI JSON doesn't export TS types.
 */

export const ESCROW_STATUS = {
  NONE: 0,
  FUNDED: 1,
  DELIVERED: 2,
  ACCEPTED: 3,
  DISPUTED: 4,
  RESOLVED_CLIENT: 5,
  RESOLVED_FREELANCER: 6,
  EXPIRED: 7,
} as const;

export type EscrowStatus = (typeof ESCROW_STATUS)[keyof typeof ESCROW_STATUS];

export const ESCROW_STATUS_LABEL: Record<EscrowStatus, string> = {
  0: "Unknown",
  1: "Funded",
  2: "Delivered",
  3: "Accepted",
  4: "Disputed",
  5: "Resolved · client",
  6: "Resolved · freelancer",
  7: "Expired",
};

export interface EscrowRecord {
  client: `0x${string}`;
  freelancer: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  deadline: bigint;
  disputeResponseDeadline: bigint;
  status: EscrowStatus;
  scope: string;
  deliveryEvidence: `0x${string}`;
  clientEvidence: `0x${string}`;
  freelancerEvidence: `0x${string}`;
  assertionId: `0x${string}`;
}

export function decodeStatus(raw: number | bigint): EscrowStatus {
  const n = Number(raw);
  if (n >= 0 && n <= 7) return n as EscrowStatus;
  return 0;
}
