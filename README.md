# Verdict

> A verifiable AI assertion layer on 0G. One primitive. TEE-attested judges. On-chain enforcement.

Built for the [0G APAC Hackathon 2026](https://www.hackquest.io/hackathons/0G-APAC-Hackathon).

## Status

Day 1 scaffold. See [plan.md](./plan.md) for the 22-day build plan.

## Structure

```
apps/
  contracts/   Solidity protocol (Hardhat, evmVersion: cancun)
  api/         Fastify + Drizzle + BullMQ (Node 20)
  web/         Next.js 15 + Tailwind + Wagmi + RainbowKit
packages/
  shared/      Cross-workspace types + 0G network config
.0g-skills/    0G SDK patterns (reference library)
```

## Local setup

```bash
pnpm install
cp .env.example .env        # fill in PRIVATE_KEY + infra URLs
pnpm turbo run typecheck
```

Then by workspace:

```bash
pnpm --filter @verdict/contracts compile
pnpm --filter @verdict/api dev
pnpm --filter @verdict/web dev
```

## 0G components used

| Component | Usage |
| --- | --- |
| 0G Chain | Protocol + application contracts |
| 0G Compute (TEE) | Sealed inference for judge agents |
| 0G Storage | Evidence files + reasoning logs |
| Agent ID (ERC-7857) | Judge reputation NFTs |
