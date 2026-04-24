import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 10_000,
    // Integration tests are opt-in via RUN_INTEGRATION=1.
    env: {
      NODE_ENV: "test",
      CHAIN_ID: "16602",
      RPC_URL: "http://localhost:0",
      STORAGE_INDEXER: "http://localhost:0",
      PRIVATE_KEY: "0x" + "a".repeat(64),
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
    },
  },
});
