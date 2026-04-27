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

  /** Panel judge tokenIds for the appeal swarm, comma-separated. */
  PANEL_TOKEN_IDS: z
    .string()
    .regex(/^\d+,\d+,\d+$/, "PANEL_TOKEN_IDS must be 3 comma-separated integers")
    .optional(),

  SENTRY_DSN: z.string().optional(),

  /**
   * AviationStack API key for the Insurance app's flight-delay oracle.
   * When absent, POST /api/oracle/flight returns 503 and the claim UI
   * hides the "fetch snapshot" tab.
   */
  AVIATIONSTACK_API_KEY: z.string().optional(),

  /**
   * When "true", the API process also runs the judgment + appeal
   * workers and the chain indexer. Convenient for dev and for the
   * hackathon's single-Hetzner deploy. Production at scale should run
   * workers in separate processes (and swap eventBus for Redis pub/sub).
   */
  EMBED_WORKERS: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export const config = schema.parse(process.env);
export type Config = typeof config;
