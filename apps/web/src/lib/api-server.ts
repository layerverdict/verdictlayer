/**
 * Server-side API helpers — for RSC + Route Handlers, NOT for client
 * components. The public `NEXT_PUBLIC_API_URL` is intended for browsers;
 * in production the Fastify API lives on the same VPS, so server reads
 * should go straight to the loopback interface to skip the TLS round
 * trip and Cloudflare edge.
 *
 * Precedence:
 *   1. INTERNAL_API_URL       — explicit internal (e.g. http://127.0.0.1:4000)
 *   2. NEXT_PUBLIC_API_URL    — fall back to the public URL
 *   3. http://localhost:4000  — sensible dev default
 */

import type { AssertionReasoning } from "./api";

const BASE = (
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

export class ApiServerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiServerError";
    this.status = status;
  }
}

/**
 * Core fetcher with Next.js revalidate semantics.
 *
 * `revalidate: N`  → cache response for N seconds (route-level ISR)
 * `revalidate: 0`  → no cache, always fresh
 * `tags`           → invalidate via `revalidateTag(...)` from a mutation
 */
async function apiServer<T>(
  path: string,
  options: { revalidate?: number; tags?: string[] } = {},
): Promise<T> {
  const url = `${BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    next: {
      revalidate: options.revalidate ?? 10,
      tags: options.tags,
    },
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiServerError(
      res.status,
      `API ${res.status} on ${path}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

// ─────────────────────────────────────────────────────────────────────
// Shapes (keep in sync with apps/api/src/routes/*.ts)
// ─────────────────────────────────────────────────────────────────────

export interface DashboardStats {
  chainId: number;
  counts: {
    escrows: number;
    policies: number;
    grants: number;
    checks: number;
  };
  latestAssertions: Array<{
    id: `0x${string}`;
    claim: string;
    mode: "INSTANT" | "AUDITED";
    outcome: "PENDING" | "TRUE" | "FALSE" | "INVALID" | "ESCALATED";
    asserter: `0x${string}`;
    challengePeriod: number;
    createdAt: string;
    resolvedAt: string | null;
  }>;
}

export interface EscrowRow {
  id: number;
  chainId: number;
  client: `0x${string}`;
  freelancer: `0x${string}`;
  token: `0x${string}`;
  amount: string;
  deadline: string;
  disputeResponseDeadline: string | null;
  status: string;
  scope: string;
  deliveryEvidence: `0x${string}` | null;
  clientEvidence: `0x${string}` | null;
  freelancerEvidence: `0x${string}` | null;
  assertionId: `0x${string}` | null;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyRow {
  id: number;
  chainId: number;
  insurer: `0x${string}`;
  holder: `0x${string}`;
  premium: string;
  payout: string;
  coverageStart: string;
  coverageEnd: string;
  status: string;
  condition: string;
  claimEvidence: `0x${string}` | null;
  assertionId: `0x${string}` | null;
  createdAt: string;
  updatedAt: string;
}

export interface GrantRow {
  id: number;
  chainId: number;
  dao: `0x${string}`;
  grantee: `0x${string}`;
  token: `0x${string}`;
  totalAmount: string;
  releasedAmount: string;
  milestoneCount: number;
  milestonesReleased: number;
  grantExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckRow {
  id: number;
  chainId: number;
  submitter: `0x${string}`;
  assetHash: `0x${string}`;
  referenceHash: `0x${string}`;
  status: string;
  assertionId: `0x${string}` | null;
  reasoningRoot: `0x${string}` | null;
  submittedAt: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ListOpts = {
  limit?: number;
  offset?: number;
  account?: string;
  status?: string;
};

function qs(o: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// ─────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────

export function getDashboardStats(): Promise<DashboardStats> {
  return apiServer<DashboardStats>("/api/stats", {
    revalidate: 5,
    tags: ["stats"],
  });
}

// ─────────────────────────────────────────────────────────────────────
// Escrows
// ─────────────────────────────────────────────────────────────────────

export function listEscrows(opts: ListOpts = {}): Promise<{ escrows: EscrowRow[] }> {
  return apiServer<{ escrows: EscrowRow[] }>(`/api/escrows${qs(opts)}`, {
    revalidate: 5,
    tags: ["escrows"],
  });
}

export function getEscrow(id: number): Promise<{ escrow: EscrowRow } | null> {
  return apiServer<{ escrow: EscrowRow }>(`/api/escrows/${id}`, {
    revalidate: 2,
    tags: ["escrows", `escrow:${id}`],
  }).catch((err) => {
    if (err instanceof ApiServerError && err.status === 404) return null;
    throw err;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Policies
// ─────────────────────────────────────────────────────────────────────

export function listPolicies(opts: ListOpts = {}): Promise<{ policies: PolicyRow[] }> {
  return apiServer<{ policies: PolicyRow[] }>(`/api/policies${qs(opts)}`, {
    revalidate: 5,
    tags: ["policies"],
  });
}

export function getPolicy(id: number): Promise<{ policy: PolicyRow } | null> {
  return apiServer<{ policy: PolicyRow }>(`/api/policies/${id}`, {
    revalidate: 2,
    tags: ["policies", `policy:${id}`],
  }).catch((err) => {
    if (err instanceof ApiServerError && err.status === 404) return null;
    throw err;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Grants
// ─────────────────────────────────────────────────────────────────────

export function listGrants(opts: ListOpts = {}): Promise<{ grants: GrantRow[] }> {
  return apiServer<{ grants: GrantRow[] }>(`/api/grants${qs(opts)}`, {
    revalidate: 5,
    tags: ["grants"],
  });
}

export function getGrant(id: number): Promise<{ grant: GrantRow } | null> {
  return apiServer<{ grant: GrantRow }>(`/api/grants/${id}`, {
    revalidate: 2,
    tags: ["grants", `grant:${id}`],
  }).catch((err) => {
    if (err instanceof ApiServerError && err.status === 404) return null;
    throw err;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Authenticity checks
// ─────────────────────────────────────────────────────────────────────

export function listChecks(opts: ListOpts = {}): Promise<{ checks: CheckRow[] }> {
  return apiServer<{ checks: CheckRow[] }>(`/api/checks${qs(opts)}`, {
    revalidate: 5,
    tags: ["checks"],
  });
}

export function getCheck(id: number): Promise<{ check: CheckRow } | null> {
  return apiServer<{ check: CheckRow }>(`/api/checks/${id}`, {
    revalidate: 2,
    tags: ["checks", `check:${id}`],
  }).catch((err) => {
    if (err instanceof ApiServerError && err.status === 404) return null;
    throw err;
  });
}

// ─────────────────────────────────────────────────────────────────────
// Judges
// ─────────────────────────────────────────────────────────────────────

export interface JudgeRow {
  tokenId: number;
  owner: `0x${string}`;
  model: string;
  descriptions: string[];
  totalVerdicts: number;
  appealsLost: number;
  reputation: number;
}

export function listJudges(): Promise<{ judges: JudgeRow[] }> {
  return apiServer<{ judges: JudgeRow[] }>("/api/judges", {
    revalidate: 10,
    tags: ["judges"],
  });
}

// ─────────────────────────────────────────────────────────────────────
// Assertions (list + detail)
// ─────────────────────────────────────────────────────────────────────

export interface AssertionListRow {
  id: `0x${string}`;
  chainId: number;
  claim: string;
  mode: "INSTANT" | "AUDITED";
  asserter: `0x${string}`;
  bond: string;
  callback: `0x${string}`;
  callbackSelector: string;
  challengePeriod: number;
  outcome: "PENDING" | "TRUE" | "FALSE" | "INVALID" | "ESCALATED";
  reasoningRoot: `0x${string}` | null;
  verdictTx: string | null;
  verdictedAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export function listAssertions(opts: {
  limit?: number;
  offset?: number;
  outcome?: string;
  asserter?: string;
} = {}): Promise<{ assertions: AssertionListRow[] }> {
  return apiServer<{ assertions: AssertionListRow[] }>(
    `/api/assertions${qs(opts)}`,
    { revalidate: 5, tags: ["assertions"] },
  );
}

export interface AssertionDetailResponse {
  assertion: AssertionListRow;
  evidence: Array<{
    id: number;
    rootHash: `0x${string}`;
    uploader: `0x${string}`;
    mime: string | null;
    size: number | null;
    metadata: Record<string, unknown> | null;
    uploadedAt: string;
  }>;
  reasonings: AssertionReasoning[];
}

export function getAssertionDetail(
  id: `0x${string}`,
): Promise<AssertionDetailResponse | null> {
  return apiServer<AssertionDetailResponse>(`/api/assertions/${id}`, {
    revalidate: 2,
    tags: ["assertions", `assertion:${id}`],
  }).catch((err) => {
    if (err instanceof ApiServerError && err.status === 404) return null;
    throw err;
  });
}
