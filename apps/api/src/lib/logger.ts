/**
 * Standalone pino logger for use outside the Fastify request lifecycle
 * (workers, scripts, migrations). The Fastify-owned logger is still the
 * primary one for request-path code.
 */

import { pino } from "pino";
import { config } from "../config.js";

export const logger = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  transport:
    config.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

export type Logger = typeof logger;
