import {
  pgTable,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  serial,
  index,
} from "drizzle-orm/pg-core";

/**
 * Assertion — canonical record of an on-chain claim + verdict lifecycle.
 * Mirrors AssertionRegistry events; serves as read-side cache.
 */
export const assertions = pgTable(
  "assertions",
  {
    id: varchar("id", { length: 66 }).primaryKey(), // bytes32 hex
    chainId: integer("chain_id").notNull(),
    claim: text("claim").notNull(),
    mode: varchar("mode", { length: 16 }).notNull(), // INSTANT | AUDITED
    asserter: varchar("asserter", { length: 42 }).notNull(),
    bond: numeric("bond").notNull(),
    callback: varchar("callback", { length: 42 }).notNull(),
    callbackSelector: varchar("callback_selector", { length: 10 }).notNull(),
    challengePeriod: integer("challenge_period").notNull(),
    outcome: varchar("outcome", { length: 16 }).notNull().default("PENDING"),
    reasoningRoot: varchar("reasoning_root", { length: 66 }),
    verdictTx: varchar("verdict_tx", { length: 66 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    asserterIdx: index("assertions_asserter_idx").on(t.asserter),
    outcomeIdx: index("assertions_outcome_idx").on(t.outcome),
    createdIdx: index("assertions_created_idx").on(t.createdAt),
  }),
);

export const evidence = pgTable(
  "evidence",
  {
    id: serial("id").primaryKey(),
    // Nullable: evidence is uploaded BEFORE the on-chain tx in our
    // apps (e.g. a client uploads dispute evidence, then openDispute
    // creates the assertion). Rows land here with a null assertion
    // and the indexer / API attach them once the AssertionCreated
    // event fires.
    assertionId: varchar("assertion_id", { length: 66 }).references(
      () => assertions.id,
      { onDelete: "cascade" },
    ),
    rootHash: varchar("root_hash", { length: 66 }).notNull(),
    uploader: varchar("uploader", { length: 42 }).notNull(),
    mime: varchar("mime", { length: 64 }),
    size: integer("size"),
    metadata: jsonb("metadata"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    assertionIdx: index("evidence_assertion_idx").on(t.assertionId),
    rootIdx: index("evidence_root_idx").on(t.rootHash),
  }),
);

export const judgeAgents = pgTable("judge_agents", {
  id: serial("id").primaryKey(),
  tokenId: integer("token_id").notNull().unique(),
  model: varchar("model", { length: 64 }).notNull(),
  providerAddress: varchar("provider_address", { length: 42 }).notNull(),
  totalVerdicts: integer("total_verdicts").notNull().default(0),
  appealsLost: integer("appeals_lost").notNull().default(0),
  reputation: numeric("reputation").notNull().default("1000"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reasoningLogs = pgTable(
  "reasoning_logs",
  {
    id: serial("id").primaryKey(),
    assertionId: varchar("assertion_id", { length: 66 })
      .notNull()
      .references(() => assertions.id, { onDelete: "cascade" }),
    judgeTokenId: integer("judge_token_id").references(() => judgeAgents.tokenId),
    storageRoot: varchar("storage_root", { length: 66 }).notNull(),
    outcome: varchar("outcome", { length: 16 }).notNull(),
    confidence: numeric("confidence"),
    chatId: varchar("chat_id", { length: 128 }),
    teeAttestation: text("tee_attestation"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    assertionIdx: index("reasoning_assertion_idx").on(t.assertionId),
  }),
);

export { indexerCheckpoints } from "./checkpoints.js";

export type Assertion = typeof assertions.$inferSelect;
export type NewAssertion = typeof assertions.$inferInsert;
export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;
