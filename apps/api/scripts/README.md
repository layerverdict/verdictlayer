# `apps/api/scripts/`

One-off TypeScript scripts that talk to 0G Compute. They run via `tsx` and
use the monorepo's env — load order is `apps/api/.env` → repo-root `.env`.

## Why `.cts`

`@0glabs/0g-serving-broker` publishes a broken ESM bundle: its internal
chunk `lib.esm/index-90c3842d.js` ships ESM `import`/`export` statements
but the package has no `"type": "module"`, so Node interprets the file as
CommonJS and throws `SyntaxError: The requested module does not provide
an export named 'C'`. Both `0.6.5` and `0.6.6` are affected.

Its CommonJS build (`lib.commonjs/index.js`) is fine. The `.cts` extension
forces `tsx`/Node to resolve the broker through the CommonJS entry,
side-stepping the bundle bug. Do not rename these files to `.ts`.

## Scripts

### `list-services.cts`

Dumps every service returned by `broker.inference.listService()` with
full prices and TEE status. Useful before the TEE gate, or when the set
of testnet providers changes.

```bash
pnpm --filter @verdict/api exec tsx scripts/list-services.cts
```

### `validate-tee.cts`

End-to-end gate: broker init → list → ledger top-up (1.0 0G minimum
enforced by the inference contract) → acknowledge → streaming chat →
`processResponse()` fee settlement.

```bash
pnpm --filter @verdict/api run validate:tee
```

**Funding requirement.** Galileo's inference contract refuses
`acknowledgeProviderSigner()` when the ledger is below `1.0 0G` — it
reverts with custom error `0xadb9e043(need, have)`. The testnet faucet
hands out `0.1 0G` at a time, so the gate needs at least ten top-ups
(plus gas) before it can run green end-to-end. Partial runs up through
step 3 (ledger create) are valid smoke tests.

> **Pre-submission TODO.** Re-run the full gate once the wallet is
> funded past 1.0 0G and paste the passing `[6] processResponse → ✓
> settled` block into the submission notes. The gate is deliberately
> idempotent so it can be replayed on demand.

### Current provider catalogue

Discovered via `listService()`. Cache in `.env` so the protocol stack
doesn't need to hit the broker on every boot. Prices are 0G per 1M
tokens unless noted.

**Mainnet (chainId 16661)**

| Provider | Service | Model | In | Out |
| --- | --- | --- | --- | --- |
| `0xd9966e13a6026Fcca4b13E7ff95c94DE268C471C` | chatbot | zai-org/GLM-5-FP8 | 0.720 | 4.200 |
| `0x7DCFe6AEa70350C2090041524c9B4A9262DCe87D` | chatbot | zai-org/GLM-5.1-FP8 | 0.934 | 7.800 |
| `0x1B3AAef3ae5050EEE04ea38cD4B087472BD85EB0` | chatbot | deepseek/deepseek-chat-v3-0324 | 0.910 | 2.736 |
| `0x4415ef5CBb415347bb18493af7cE01f225Fc0868` | chatbot | qwen/qwen3-vl-30b-a3b-instruct | 0.400 | 2.400 |
| `0x992e6396157Dc4f22E74F2231235D7DE62696db5` | chatbot | qwen3.6-plus | 0.800 | 4.800 |
| `0x25F8f01cA76060ea40895472b1b79f76613Ca497` | chatbot | openai/gpt-5.4-mini | 1.600 | 9.000 |
| `0x36aCffCEa3CCe07cAdd1740Ad992dB16Ab324517` | stt | openai/whisper-large-v3 | — | — |
| `0xE29a72c7629815Eb480aE5b1F2dfA06f06cdF974` | t2i | z-image | — | 0.003 / image |

**Testnet (chainId 16602)**

| Provider | Service | Model | In | Out |
| --- | --- | --- | --- | --- |
| `0xa48f01287233509FD694a22Bf840225062E67836` | chatbot | qwen/qwen-2.5-7b-instruct | 0.050 | 0.100 |
| `0x4b2a941929E39Adbea5316dDF2B9Bd8Ff3134389` | image-editing | qwen/qwen-image-edit-2511 | — | 0.005 / image |

**Verdict Layer defaults (mainnet):**
- `JUDGE_PROVIDER = DeepSeek V3` — cheapest dense-reasoning chatbot, narrative-safe default.
- `SWARM_PROVIDERS = DeepSeek V3, GLM-5-FP8, Qwen3-VL 30B` — three independent model families.

0G Compute inference contract (testnet): `0xE70830508dAc0A97e6c087c75f402f9Be669E406`
