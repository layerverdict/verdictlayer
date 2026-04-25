/**
 * Verdict Protocol Core Types — shared between contracts, api, web
 */

export enum AssertionMode {
  INSTANT = 0,
  AUDITED = 1,
}

export enum AssertionOutcome {
  PENDING = 0,
  TRUE = 1,
  FALSE = 2,
  INVALID = 3,
  ESCALATED = 4,
}

/**
 * String representation of `AssertionOutcome` — matches the `outcome`
 * varchar in Postgres + the SSE payload label. Prefer this over the
 * enum when the value will be serialised.
 */
export type AssertionOutcomeLabel =
  | "PENDING"
  | "TRUE"
  | "FALSE"
  | "INVALID"
  | "ESCALATED";

export type Hex = `0x${string}`;
export type Address = `0x${string}`;
export type Bytes32 = `0x${string}`;

export interface Assertion {
  id: Bytes32;
  claim: string;
  evidenceRoots: Bytes32[];
  bond: bigint;
  asserter: Address;
  callback: Address;
  callbackSelector: Hex;
  mode: AssertionMode;
  challengePeriod: number;
  outcome: AssertionOutcome;
  reasoning?: Bytes32;
  verdictTx?: Hex;
  createdAt: number;
  resolvedAt?: number;
}

export interface Evidence {
  rootHash: Bytes32;
  uploader: Address;
  mime: string;
  size: number;
  uploadedAt: number;
}

export interface JudgeAgent {
  tokenId: number;
  model: string;
  totalVerdicts: number;
  appealsLost: number;
  reputation: number;
}

/**
 * AI judge response schema (tail JSON in reasoning output).
 * Matches the prompt in plan.md Judgment Service section.
 */
export interface JudgeDecision {
  outcome: "TRUE" | "FALSE" | "INVALID";
  confidence: number;
  evidenceCited: Bytes32[];
}
