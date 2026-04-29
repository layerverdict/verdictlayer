import type { FastifyPluginAsync } from "fastify";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";

import { config } from "../config.js";
import { db, schema } from "../db/client.js";

const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((s) => s.toLowerCase());

const IdSchema = z.coerce.number().int().positive();

const ListQuery = z.object({
  account: AddressSchema.optional(),
  status: z.string().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Application + dashboard routes.
 *
 * These endpoints serve the RSC pages. They read from the indexer
 * mirror tables (escrows, policies, grants, authenticity_checks) so
 * the page render path never hits RPC. The list endpoints accept a
 * shared pagination + filter contract:
 *
 *   account=<0x…>   — limit to rows where the account is a
 *                     participant (client/freelancer for escrow,
 *                     insurer/holder for policy, dao/grantee for
 *                     grants, submitter for checks)
 *   status=<LABEL>  — exact match on the Solidity enum label
 *   limit=<n>       — default 20, max 100
 *   offset=<n>      — default 0
 *
 *   GET /api/stats                    aggregate counts + latest
 *   GET /api/escrows                  list escrows
 *   GET /api/escrows/:id              single escrow
 *   GET /api/policies                 list policies
 *   GET /api/policies/:id             single policy
 *   GET /api/grants                   list grants
 *   GET /api/grants/:id               single grant
 *   GET /api/checks                   list authenticity checks
 *   GET /api/checks/:id               single check
 */
export const appsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/stats", async () => {
    const [escrowsCount, policiesCount, grantsCount, checksCount, latest] =
      await Promise.all([
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.escrows)
          .where(eq(schema.escrows.chainId, config.CHAIN_ID))
          .then((r) => r[0]?.n ?? 0),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.policies)
          .where(eq(schema.policies.chainId, config.CHAIN_ID))
          .then((r) => r[0]?.n ?? 0),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.grants)
          .where(eq(schema.grants.chainId, config.CHAIN_ID))
          .then((r) => r[0]?.n ?? 0),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(schema.authenticityChecks)
          .where(eq(schema.authenticityChecks.chainId, config.CHAIN_ID))
          .then((r) => r[0]?.n ?? 0),
        db
          .select()
          .from(schema.assertions)
          .where(eq(schema.assertions.chainId, config.CHAIN_ID))
          .orderBy(desc(schema.assertions.createdAt))
          .limit(8),
      ]);

    return {
      chainId: config.CHAIN_ID,
      counts: {
        escrows: escrowsCount,
        policies: policiesCount,
        grants: grantsCount,
        checks: checksCount,
      },
      latestAssertions: latest,
    };
  });

  app.get("/api/escrows", async (req) => {
    const q = ListQuery.parse(req.query);
    const filters = [eq(schema.escrows.chainId, config.CHAIN_ID)];
    if (q.status) filters.push(eq(schema.escrows.status, q.status));
    if (q.account) {
      filters.push(
        or(
          eq(schema.escrows.client, q.account),
          eq(schema.escrows.freelancer, q.account),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(schema.escrows)
      .where(and(...filters))
      .orderBy(desc(schema.escrows.createdAt))
      .limit(q.limit)
      .offset(q.offset);
    return { escrows: rows };
  });

  app.get<{ Params: { id: string } }>(
    "/api/escrows/:id",
    async (req, reply) => {
      const id = IdSchema.parse(req.params.id);
      const rows = await db
        .select()
        .from(schema.escrows)
        .where(
          and(
            eq(schema.escrows.chainId, config.CHAIN_ID),
            eq(schema.escrows.id, id),
          ),
        )
        .limit(1);
      const escrow = rows[0];
      if (!escrow) return reply.code(404).send({ error: "escrow not found" });
      return { escrow };
    },
  );

  app.get("/api/policies", async (req) => {
    const q = ListQuery.parse(req.query);
    const filters = [eq(schema.policies.chainId, config.CHAIN_ID)];
    if (q.status) filters.push(eq(schema.policies.status, q.status));
    if (q.account) {
      filters.push(
        or(
          eq(schema.policies.insurer, q.account),
          eq(schema.policies.holder, q.account),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(schema.policies)
      .where(and(...filters))
      .orderBy(desc(schema.policies.createdAt))
      .limit(q.limit)
      .offset(q.offset);
    return { policies: rows };
  });

  app.get<{ Params: { id: string } }>(
    "/api/policies/:id",
    async (req, reply) => {
      const id = IdSchema.parse(req.params.id);
      const rows = await db
        .select()
        .from(schema.policies)
        .where(
          and(
            eq(schema.policies.chainId, config.CHAIN_ID),
            eq(schema.policies.id, id),
          ),
        )
        .limit(1);
      const policy = rows[0];
      if (!policy) return reply.code(404).send({ error: "policy not found" });
      return { policy };
    },
  );

  app.get("/api/grants", async (req) => {
    const q = ListQuery.parse(req.query);
    const filters = [eq(schema.grants.chainId, config.CHAIN_ID)];
    if (q.account) {
      filters.push(
        or(
          eq(schema.grants.dao, q.account),
          eq(schema.grants.grantee, q.account),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(schema.grants)
      .where(and(...filters))
      .orderBy(desc(schema.grants.createdAt))
      .limit(q.limit)
      .offset(q.offset);
    return { grants: rows };
  });

  app.get<{ Params: { id: string } }>(
    "/api/grants/:id",
    async (req, reply) => {
      const id = IdSchema.parse(req.params.id);
      const rows = await db
        .select()
        .from(schema.grants)
        .where(
          and(
            eq(schema.grants.chainId, config.CHAIN_ID),
            eq(schema.grants.id, id),
          ),
        )
        .limit(1);
      const grant = rows[0];
      if (!grant) return reply.code(404).send({ error: "grant not found" });
      return { grant };
    },
  );

  app.get("/api/checks", async (req) => {
    const q = ListQuery.parse(req.query);
    const filters = [eq(schema.authenticityChecks.chainId, config.CHAIN_ID)];
    if (q.status)
      filters.push(eq(schema.authenticityChecks.status, q.status));
    if (q.account)
      filters.push(eq(schema.authenticityChecks.submitter, q.account));
    const rows = await db
      .select()
      .from(schema.authenticityChecks)
      .where(and(...filters))
      .orderBy(desc(schema.authenticityChecks.createdAt))
      .limit(q.limit)
      .offset(q.offset);
    return { checks: rows };
  });

  app.get<{ Params: { id: string } }>(
    "/api/checks/:id",
    async (req, reply) => {
      const id = IdSchema.parse(req.params.id);
      const rows = await db
        .select()
        .from(schema.authenticityChecks)
        .where(
          and(
            eq(schema.authenticityChecks.chainId, config.CHAIN_ID),
            eq(schema.authenticityChecks.id, id),
          ),
        )
        .limit(1);
      const check = rows[0];
      if (!check) return reply.code(404).send({ error: "check not found" });
      return { check };
    },
  );
};

