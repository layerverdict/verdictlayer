# Verdict

A verifiable AI assertion layer on 0G. Any on-chain contract can ask a single question —
*"is this claim true?"* — and get back a TEE-attested verdict with cryptographically
anchored reasoning. One primitive covers dispute resolution, parametric claims, milestone
approvals, and authenticity checks.

## How it works

1. A contract (or user) creates an **Assertion**: a human-readable claim, evidence root
   hashes, a bond, and a callback.
2. A judge agent runs inside 0G Compute's Sealed Inference TEE, reads the evidence from
   0G Storage, and produces structured reasoning.
3. The reasoning document is uploaded back to 0G Storage; its root hash, the outcome, and
   the TEE attestation are published on 0G Chain.
4. The callback fires. Funds move, vaults unlock, attestations mint — whatever the
   integrating contract wired up.

Assertions can run in **INSTANT** mode (same-tx callback) or **AUDITED** mode (configurable
challenge window, optional multi-model appeal via a swarm of independent judges).

## Architecture

```
apps/
  contracts/   Solidity protocol (Hardhat, 0.8.24, evmVersion cancun)
                AssertionRegistry · VerdictEnforcer · EscalationManager
                ReputationRegistry (ERC-7857) · four reference dApps
  api/         Fastify + Drizzle + BullMQ
                Assertion / Evidence / Judgment services, chain indexer
  web/         Next.js 15 App Router · Tailwind · Wagmi · RainbowKit
                Escrow, Parametric Insurance, Milestone Vault, Authenticity
packages/
  shared/      Cross-workspace types + 0G network constants
```

## 0G components

| Component            | Role                                                      |
| -------------------- | --------------------------------------------------------- |
| 0G Chain             | Protocol contracts + ERC-792 arbitration interface        |
| 0G Compute (TEE)     | Sealed Inference for every judge decision                 |
| 0G Storage           | Evidence files and reasoning logs (Merkle-anchored)       |
| Agent ID (ERC-7857)  | Soulbound judge reputation NFTs                           |

## Getting started

```bash
pnpm install
cp .env.example .env        # fill in PRIVATE_KEY + infra URLs
pnpm turbo run typecheck
```

Per workspace:

```bash
pnpm --filter @verdict/contracts compile
pnpm --filter @verdict/api dev
pnpm --filter @verdict/web dev
```

## Network configuration

Defaults target the **0G Galileo Testnet** (chain ID `16602`). Switch to **0G Aristotle
Mainnet** (chain ID `16661`) by updating `RPC_URL`, `STORAGE_INDEXER`, and `CHAIN_ID` in
`.env`. See `.env.example` for both variants.

## License

MIT
