/**
 * Drizzle migration runner.
 *
 * Runs the SQL migrations in `apps/api/drizzle/` against the configured
 * Postgres instance. Safe to run on every deploy — drizzle tracks which
 * migrations have been applied in a `__drizzle_migrations` table.
 *
 * Invoked as `pnpm --filter @verdict/api db:migrate`.
 */

import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const migrator = postgres(url, { max: 1 });
  const db = drizzle(migrator);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await migrator.end();
  console.log("✓ migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
