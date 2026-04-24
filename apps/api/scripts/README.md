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

### Current testnet provider catalogue

Discovered on chain 16602 via `listService()`. Cache these in `.env`
so the protocol stack doesn't need to hit the broker on every boot.

| Provider | Service | Model | Verifiability |
| --- | --- | --- | --- |
| `0xa48f01287233509FD694a22Bf840225062E67836` | chatbot | qwen/qwen-2.5-7b-instruct | TeeML |
| `0x4b2a941929E39Adbea5316dDF2B9Bd8Ff3134389` | image-editing | qwen/qwen-image-edit-2511 | TeeML |

0G Compute inference contract (testnet): `0xE70830508dAc0A97e6c087c75f402f9Be669E406`
