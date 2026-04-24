# 0G Agent Skills

You are assisting a developer building on the **0G decentralized AI operating system**. This
repository contains 14 agent skills across 4 categories: Storage, Compute, Chain, and Cross-Layer.

## How to Use

1. Read `AGENTS.md` for orchestration rules, activation triggers, and workflow sequences
2. Load the relevant `SKILL.md` file based on what the developer is building
3. Reference `patterns/*.md` for deep architectural context
4. Follow ALL ALWAYS/NEVER rules — they prevent common bugs

## Critical Rules (Memorize These)

- **processResponse()**: Call after EVERY compute inference. Param order:
  `(providerAddress, chatID, usageData)`
- **ChatID**: Extract from `ZG-Res-Key` header FIRST, `data.id` as fallback (chatbot only)
- **evmVersion**: ALWAYS use `"cancun"` for 0G Chain contracts
- **ethers**: ALWAYS v6 (`ethers.JsonRpcProvider`, `ethers.parseEther`). NEVER v5
- **File handles**: ALWAYS close `ZgFile` with `file.close()` in a `finally` block
- **Private keys**: ALWAYS from `.env`, NEVER hardcoded
- **Upload signature**: `indexer.upload(file, rpcUrl, signer)` — returns `[result, error]` tuple
- **Download behavior**: `indexer.download()` can THROW in addition to returning errors — always
  wrap in try/catch
- **Service tuples**: `listService()` returns tuple arrays, not objects — use `s[0]` for
  providerAddress, `s[1]` for serviceType, `s[6]` for model, `s[10]` for teeVerified
- **Ledger tuples**: `getLedger()` returns tuple — use `account[1]` for totalBalance, `account[2]`
  for availableBalance

## Skill Map

### Storage

- `skills/storage/upload-file/SKILL.md` — Upload files to 0G Storage
- `skills/storage/download-file/SKILL.md` — Download & verify files
- `skills/storage/merkle-verification/SKILL.md` — Data integrity verification

### Compute

- `skills/compute/provider-discovery/SKILL.md` — Find & verify providers
- `skills/compute/account-management/SKILL.md` — Deposits, transfers, refunds
- `skills/compute/streaming-chat/SKILL.md` — LLM inference (DeepSeek, Qwen, Gemma)
- `skills/compute/text-to-image/SKILL.md` — Image generation (Flux Turbo)
- `skills/compute/speech-to-text/SKILL.md` — Audio transcription (Whisper)
- `skills/compute/fine-tuning/SKILL.md` — Model training (testnet only)

### Chain

- `skills/chain/scaffold-project/SKILL.md` — Initialize new 0G projects
- `skills/chain/deploy-contract/SKILL.md` — Deploy Solidity contracts
- `skills/chain/interact-contract/SKILL.md` — Read/write deployed contracts

### Cross-Layer

- `skills/cross-layer/storage-plus-chain/SKILL.md` — On-chain refs to off-chain data
- `skills/cross-layer/compute-plus-storage/SKILL.md` — AI inference + storage I/O

## Pattern Documents

- `patterns/NETWORK_CONFIG.md` — Endpoints, chain IDs, SDK versions, .env template
- `patterns/STORAGE.md` — Storage architecture & SDK reference
- `patterns/COMPUTE.md` — Compute architecture & processResponse() deep-dive
- `patterns/CHAIN.md` — EVM patterns, Hardhat/Foundry configs, ethers v6
- `patterns/SECURITY.md` — Key management, TEE, data integrity
- `patterns/TESTING.md` — Testing strategies & mock patterns

## Quick Start

When a developer asks to build something on 0G:

1. Check `AGENTS.md` workflow sequences to determine which skills to activate
2. Load the primary skill's `SKILL.md`
3. Load `patterns/NETWORK_CONFIG.md` for environment setup
4. Follow the skill's Quick Workflow section
5. Apply all ALWAYS/NEVER rules from `AGENTS.md`

## Commit Conventions

Write commits professionally. NEVER use day/phase markers like "Day 1" or plan references
in commit messages — they rot as the project evolves.

- **Format**: `<type>(<scope>): <imperative subject>`
- **Types**: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `build`, `ci`, `perf`
- **Scopes**: `contracts`, `api`, `web`, `shared`, `infra`, `ci`, `deps`, or leave empty for repo-wide
- **Subject**: imperative mood, lowercase, no trailing period, <72 chars
- **Body**: explain WHAT was built and WHY. Reference concrete files, choices, and
  constraints — never the planning document or daily plan. Use bullet points when
  listing multiple independent changes.
- **NEVER** include `Co-Authored-By: Claude` or any AI attribution trailer.
- **NEVER** include `🤖 Generated with Claude Code` or similar footers.
- **NEVER** use `--amend` to published commits; create a new commit instead.

Example:

```
feat(contracts): add AssertionRegistry with INSTANT/AUDITED modes

Introduces the canonical on-chain store for assertions. Each assertion has
a claim, evidence roots, bond, callback target, and mode. AUDITED mode
enforces a configurable challenge window before callback dispatch; INSTANT
fires the callback in the same transaction as verdict submission.

- Bytes32 id derived from keccak256(abi.encode(asserter, claim, nonce))
- Events: AssertionCreated, VerdictSubmitted, Challenged, Resolved
- Uses ERC-792 Arbitrable interface for Kleros drop-in compatibility
```
