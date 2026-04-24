/**
 * Assertion service.
 *
 * Read-side cache of AssertionRegistry state. Writes flow via the chain
 * indexer (for on-chain events) and directly via API routes for cached
 * metadata like evidence attachments.
 *
 * Keeping reads DB-first (rather than calling the chain on every
 * request) keeps the list/detail endpoints fast and lets us index
 * fields that aren't easily queryable on chain (claim text search,
 * outcome filters).
 */

import { and, desc, eq, sql } from "drizzle-orm";

import { db, schema } from "../db/client.js";
import type { Assertion, NewAssertion } from "../db/schema.js";

export type { Assertion };

export interface UpsertAssertionInput extends NewAssertion {}

export async function upsertAssertion(input: UpsertAssertionInput): Promise<Assertion> {
  const [row] = await db
    .insert(schema.assertions)
    .values(input)
    .onConflictDoUpdate({
      target: schema.assertions.id,
      set: {
        outcome: input.outcome ?? sql`excluded.outcome`,
        reasoningRoot: input.reasoningRoot ?? sql`excluded.reasoning_root`,
        verdictTx: input.verdictTx ?? sql`excluded.verdict_tx`,
        resolvedAt: input.resolvedAt ?? sql`excluded.resolved_at`,
      },
    })
    .returning();
  if (!row) throw new Error("upsertAssertion returned no row");
  return row;
}

export async function getAssertion(id: `0x${string}`): Promise<Assertion | undefined> {
  const rows = await db
    .select()
    .from(schema.assertions)
    .where(eq(schema.assertions.id, id))
    .limit(1);
  return rows[0];
}

export interface ListAssertionsInput {
  asserter?: `0x${string}`;
  outcome?: string;
  limit?: number;
  offset?: number;
}

export async function listAssertions(input: ListAssertionsInput = {}): Promise<Assertion[]> {
  const conditions = [];
  if (input.asserter) conditions.push(eq(schema.assertions.asserter, input.asserter));
  if (input.outcome) conditions.push(eq(schema.assertions.outcome, input.outcome));
  const where = conditions.length ? and(...conditions) : undefined;

  const query = db
    .select()
    .from(schema.assertions)
    .orderBy(desc(schema.assertions.createdAt))
    .limit(Math.min(input.limit ?? 50, 200))
    .offset(input.offset ?? 0);
  return where ? query.where(where) : query;
}

export async function updateOutcome(
  id: `0x${string}`,
  patch: {
    outcome?: string;
    reasoningRoot?: string;
    verdictTx?: string;
    resolvedAt?: Date;
  },
): Promise<void> {
  await db
    .update(schema.assertions)
    .set({
      outcome: patch.outcome,
      reasoningRoot: patch.reasoningRoot,
      verdictTx: patch.verdictTx,
      resolvedAt: patch.resolvedAt,
    })
    .where(eq(schema.assertions.id, id));
}
