/**
 * Indexer checkpoints.
 *
 * Stores the last block scanned per contract so the indexer can resume
 * after a restart without replaying the entire chain. Kept as a
 * dedicated mini-schema outside the read-model tables because it's
 * pure operational state — not part of the application's data model.
 */

import { pgTable, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const indexerCheckpoints = pgTable("indexer_checkpoints", {
  contract: varchar("contract", { length: 64 }).primaryKey(),
  lastBlock: integer("last_block").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
