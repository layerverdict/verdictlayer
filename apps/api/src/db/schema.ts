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
  primaryKey,
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
    // Set when the judge writes a verdict on-chain; AUDITED assertions
    // need this + challengePeriod to know when the challenge window
    // closes and the scheduler can call resolveAssertion.
    verdictedAt: timestamp("verdicted_at", { withTimezone: true }),
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

/**
 * Application mirrors — per-app state surfaced by the indexer.
 *
 * These tables exist so list/detail pages can render without doing N
 * round-trips to the chain. The canonical source is still the contract;
 * Postgres is a read-side cache that trades write-path complexity for
 * sub-10ms queries on the page render path.
 *
 * Schema choices:
 *   - `chainId` on every row so a multi-chain deploy doesn't require
 *     separate databases.
 *   - `id` is the on-chain primary key encoded as a bigint → numeric(78),
 *     wide enough for a full uint256 but our apps use uint256 counters
 *     that fit in a JS Number easily.
 *   - `status` columns mirror the Solidity enum LABELS (not numeric
 *     values) so the frontend code already written for decoders reads
 *     them verbatim.
 */
export const escrows = pgTable(
  "escrows",
  {
    id: integer("id").notNull(),
    chainId: integer("chain_id").notNull(),
    client: varchar("client", { length: 42 }).notNull(),
    freelancer: varchar("freelancer", { length: 42 }).notNull(),
    token: varchar("token", { length: 42 }).notNull(),
    amount: numeric("amount").notNull(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    disputeResponseDeadline: timestamp("dispute_response_deadline", {
      withTimezone: true,
    }),
    status: varchar("status", { length: 32 }).notNull().default("FUNDED"),
    scope: text("scope").notNull(),
    deliveryEvidence: varchar("delivery_evidence", { length: 66 }),
    clientEvidence: varchar("client_evidence", { length: 66 }),
    freelancerEvidence: varchar("freelancer_evidence", { length: 66 }),
    assertionId: varchar("assertion_id", { length: 66 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chainId, t.id] }),
    clientIdx: index("escrows_client_idx").on(t.client),
    freelancerIdx: index("escrows_freelancer_idx").on(t.freelancer),
    statusIdx: index("escrows_status_idx").on(t.status),
    createdIdx: index("escrows_created_idx").on(t.createdAt),
  }),
);

export const policies = pgTable(
  "policies",
  {
    id: integer("id").notNull(),
    chainId: integer("chain_id").notNull(),
    insurer: varchar("insurer", { length: 42 }).notNull(),
    holder: varchar("holder", { length: 42 }).notNull(),
    premium: numeric("premium").notNull(),
    payout: numeric("payout").notNull(),
    coverageStart: timestamp("coverage_start", { withTimezone: true }).notNull(),
    coverageEnd: timestamp("coverage_end", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    condition: text("condition").notNull(),
    claimEvidence: varchar("claim_evidence", { length: 66 }),
    assertionId: varchar("assertion_id", { length: 66 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chainId, t.id] }),
    holderIdx: index("policies_holder_idx").on(t.holder),
    insurerIdx: index("policies_insurer_idx").on(t.insurer),
    statusIdx: index("policies_status_idx").on(t.status),
    createdIdx: index("policies_created_idx").on(t.createdAt),
  }),
);

export const grants = pgTable(
  "grants",
  {
    id: integer("id").notNull(),
    chainId: integer("chain_id").notNull(),
    dao: varchar("dao", { length: 42 }).notNull(),
    grantee: varchar("grantee", { length: 42 }).notNull(),
    token: varchar("token", { length: 42 }).notNull(),
    totalAmount: numeric("total_amount").notNull(),
    releasedAmount: numeric("released_amount").notNull().default("0"),
    milestoneCount: integer("milestone_count").notNull(),
    milestonesReleased: integer("milestones_released").notNull().default(0),
    grantExpiresAt: timestamp("grant_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chainId, t.id] }),
    daoIdx: index("grants_dao_idx").on(t.dao),
    granteeIdx: index("grants_grantee_idx").on(t.grantee),
    createdIdx: index("grants_created_idx").on(t.createdAt),
  }),
);

export const authenticityChecks = pgTable(
  "authenticity_checks",
  {
    id: integer("id").notNull(),
    chainId: integer("chain_id").notNull(),
    submitter: varchar("submitter", { length: 42 }).notNull(),
    assetHash: varchar("asset_hash", { length: 66 }).notNull(),
    referenceHash: varchar("reference_hash", { length: 66 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    assertionId: varchar("assertion_id", { length: 66 }),
    reasoningRoot: varchar("reasoning_root", { length: 66 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chainId, t.id] }),
    submitterIdx: index("checks_submitter_idx").on(t.submitter),
    statusIdx: index("checks_status_idx").on(t.status),
    assetIdx: index("checks_asset_idx").on(t.assetHash),
    createdIdx: index("checks_created_idx").on(t.createdAt),
  }),
);

export { indexerCheckpoints } from "./checkpoints.js";

export type Assertion = typeof assertions.$inferSelect;
export type NewAssertion = typeof assertions.$inferInsert;
export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;
export type Escrow = typeof escrows.$inferSelect;
export type NewEscrow = typeof escrows.$inferInsert;
export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;
export type Grant = typeof grants.$inferSelect;
export type NewGrant = typeof grants.$inferInsert;
export type AuthenticityCheck = typeof authenticityChecks.$inferSelect;
export type NewAuthenticityCheck = typeof authenticityChecks.$inferInsert;
