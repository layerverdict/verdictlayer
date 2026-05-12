import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default("127.0.0.1"),

  CHAIN_ID: z.coerce.number().int().positive(),
  RPC_URL: z.string().url(),
  STORAGE_INDEXER: z.string().url(),
  PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "PRIVATE_KEY must be 0x-prefixed 32-byte hex"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  /**
   * Primary TEE chatbot provider. If unset, the judgment service falls
   * back to substring matching via `pickTeeChatbot(JUDGE_MODEL_HINT)`.
   * On mainnet (chainId 16661) this should be pinned to the DeepSeek V3
   * provider — it's the cheapest dense-reasoning chatbot (0.91 in /
   * 2.74 out per 1M tokens) and the narrative-safe default.
   */
  JUDGE_PROVIDER: z.string().optional(),
  /** Substring hint for pickTeeChatbot when JUDGE_PROVIDER is unset. */
  JUDGE_MODEL_HINT: z.string().default("deepseek"),
  /**
   * Appeal-swarm providers as a comma-separated address list. When set,
   * the appeal service uses these instead of the first-3-discovered
   * default. Order matters: it becomes the swarm presentation order.
   */
  SWARM_PROVIDERS: z.string().optional(),
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
