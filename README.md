<div align="center">

# Verdict Layer

### Verifiable AI decisions on 0G

</div>

Verdict Layer is a single on-chain primitive that answers *"is this claim true?"*
and hands back a TEE-attested AI verdict with cryptographically anchored
reasoning. One contract surface covers dispute resolution, parametric insurance,
milestone approvals, and authenticity checks — four reference apps sharing the
same adjudication layer.

**Live on 0G Galileo testnet:** <https://verdictlayer.xyz>

---

## What's in the box

| Path                        | Purpose                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/contracts/`           | Hardhat + Solidity 0.8.24 (cancun). 9 contracts: protocol core + four app contracts. 83 unit tests.              |
| `apps/api/`                 | Fastify + Drizzle + BullMQ + Redis. Chain indexer, judgment/appeal workers, REST endpoints, oracle integrations. |
| `packages/shared/`          | Cross-workspace types, ABI re-exports, deployment manifests.                                                     |

---

## Architecture

```
0G Galileo Testnet (chainId 16602)
├── AssertionRegistry · VerdictEnforcer · EscalationManager
├── ReputationRegistry (ERC-7857 soulbound judge NFT)
└── Escrow · ParametricInsurance · MilestoneVault · AuthenticityCertifier
        ↓
Fastify API + chain indexer + judgment/appeal workers (BullMQ)
        ↓
0G Compute TEE (Sealed Inference, GLM-5 / DeepSeek / Qwen3)
0G Storage (evidence + reasoning root hashes)
```

**Write path stays on-chain.** Every state transition happens via signed
transactions through `wagmi` + `viem`. The indexer mirrors events into
Postgres purely as a read cache; the contract is authoritative.

---

## Primitive: the Assertion

```solidity
struct Assertion {
    bytes32 id;
    string claim;                 // human-readable claim
    bytes32[] evidenceRoots;      // 0G Storage merkle roots
    address asserter;
    address callback;             // dispatched on final outcome
    bytes4 callbackSelector;
    Mode mode;                    // INSTANT | AUDITED
    uint64 challengePeriod;       // AUDITED: 30m–24h
    uint256 bond;
    Status status;                // OPEN → VERDICTED → (CHALLENGED →) RESOLVED
    Outcome originalOutcome;      // what the first judge decided
    Outcome outcome;              // what actually lands on-chain
    bytes32 reasoningRoot;        // reasoning transcript on 0G Storage
    bytes32 attestationHash;      // TEE attestation
    uint256 judgeTokenId;         // ERC-7857 reputation NFT
    uint64 createdAt; verdictedAt; resolvedAt;
}
```

**INSTANT** — callback fires in the same tx as verdict submission. Used by
Insurance claims (parametric triggers), Milestone releases, Authenticity
certifications.

**AUDITED** — verdict lands first; anyone may post a `bond` challenge during
the window. A challenge triggers a 3-judge swarm (different TEE providers,
independent reasonings, plurality outcome). Used by Escrow disputes.

---

## Running locally

```bash
pnpm install
cp .env.example .env     # fill in PRIVATE_KEY + infrastructure URLs
pnpm turbo run typecheck # 4 workspaces pass
```

### Workspace scripts

```bash
# contracts — compile, test, deploy
pnpm --filter @verdict/contracts compile
pnpm --filter @verdict/contracts test
pnpm --filter @verdict/contracts exec hardhat run scripts/deploy.ts --network ogTestnet

# api — dev (hot reload) / tests
pnpm --filter @verdict/api dev
pnpm --filter @verdict/api test
```

### Local data plane

Postgres + Redis run in Docker Compose:

```bash
docker compose -f apps/api/infra/docker-compose.yml --env-file .env up -d
pnpm --filter @verdict/api exec drizzle-kit migrate
```

---

## 0G integration points

| Layer         | Where it's used                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Chain**     | 9 contracts on Galileo (addresses below). ERC-792-style arbitration interface + ERC-7857 soulbound judge reputation NFT.      |
| **Compute**   | Judgment worker calls `broker.inference` against TEE-verified providers; every response goes through `processResponse()`.     |
| **Storage**   | Evidence uploads + reasoning transcripts via `ZgFile` + `Indexer`. Every bytes32 `evidenceRoot` on-chain is a 0G merkle root. |
| **Oracles**   | `/api/oracle/flight` calls AviationStack, canonicalises the payload, uploads to 0G Storage, returns the root for a claim.     |
| **Agent ID**  | ReputationRegistry mints a soulbound NFT per judge. Verdicts and lost appeals accumulate on-chain.                            |

---

## Deployment (0G Galileo testnet · chainId 16602)

| Contract                | Address                                        |
| ----------------------- | ---------------------------------------------- |
| AssertionRegistry       | `0x8ec138B556A2c0324146e259d9eBEA38A9575cA0`   |
| VerdictEnforcer         | `0x7A2C325dD3047268dcaF996178603B272947821b`   |
| EscalationManager       | `0x2AF5CE88beFd4Cf8394a3EA967425212960b0A8B`   |
| ReputationRegistry      | `0x2a5766F112666B52d2D7E2280dBa76CC3FC6d135`   |
| Verifier                | `0x9E82afb28b87957AFe50464A5717b5B53E395D0D`   |
| Escrow                  | `0x86ddD4AF766Ca394f303082A87089A510f8cD46B`   |
| ParametricInsurance     | `0x2e5c75c560D4877899a49206c629d04b58faD51A`   |
| MilestoneVault          | `0xF388E071bD758261980d585359Ce2BA0024A8D46`   |
| AuthenticityCertifier   | `0x4745DE55e4037b87768AB63Be1F479E4361096c1`   |

Explorer: <https://chainscan-galileo.0g.ai>

---

## License

MIT
