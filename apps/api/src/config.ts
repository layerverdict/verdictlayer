import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),

  CHAIN_ID: z.coerce.number().int().positive(),
  RPC_URL: z.string().url(),
  STORAGE_INDEXER: z.string().url(),
  PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "PRIVATE_KEY must be 0x-prefixed 32-byte hex"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  QWEN_CHAT_PROVIDER: z.string().optional(),
  QWEN_IMAGE_PROVIDER: z.string().optional(),
  GLM5_PROVIDER: z.string().optional(),
  DEEPSEEK_PROVIDER: z.string().optional(),
  QWEN3_PROVIDER: z.string().optional(),
  OG_INFERENCE_CONTRACT: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
});

export const config = schema.parse(process.env);
export type Config = typeof config;
