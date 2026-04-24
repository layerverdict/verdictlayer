# Slither Analysis Report

Last run: 2026-04-24 against Slither 0.11.4 / solc 0.8.24.
Total findings: 46 — all fall into the categories explained below (documented
false positives or intentional design choices). High-severity and medium
findings are resolved; remaining items are informational.

Command:

```bash
slither . --filter-paths "node_modules|typechain-types|contracts/mocks"
```

## Findings resolved

| Finding | Severity | Resolution |
| --- | --- | --- |
| `reentrancy-eth` in `Escrow.openDispute`, `ParametricInsurance.claim` | High (false pos) | Both functions already carry `nonReentrant`; `AssertionRegistry.createAssertion` also carries `nonReentrant`. Slither does not parse the OZ modifier. |
| `locked-ether` on `ReputationRegistry.mint` | High (false pos) | `mint` signature is `payable` because IERC7857 requires it. Runtime check rejects any non-zero `msg.value` (`MintFeeNotAccepted`). No ether can reach storage. Regression test: `ReputationRegistry — mint › reverts when a caller attaches native value to mint()`. |
| `reentrancy-no-eth` in `ReputationRegistry.{mint, update, transfer, transferFrom, clone, cloneFrom}` | Medium (false pos) | Every path that calls into `_verifier` now carries `nonReentrant`. `_verifier` is an upgrade-gated state variable (admin-only `updateVerifier`), but the guard removes the attack surface for a malicious verifier. |
| `immutable-states` on `assertionBond` in all four application contracts | Info | Converted each to `immutable`. Saves ~2k gas per application call and signals contract-level config invariance. |
| `unindexed-event-address` on `VerifierDeployed` | Info | Indexed the `attestationContract` address and the `VerifierType` parameter. |
| `missing-zero-check` on `Verifier.constructor._attestationContract` | Info | **Accepted:** zero is the intended default for v1 (falls through to signature-only check). Documented in-constructor and in the contract header. |
| `assembly` usage in `Verifier._recoverAccessibilitySigner` | Info | Accepted — calldata signature decode requires assembly for gas efficiency; same pattern as OZ `ECDSA.recover`. |
| `calls-loop` in `EscalationManager.closeAppeal` | Info | Accepted — the loop is bounded at compile time (`PANEL_SIZE = 3`) and iterates only against `ReputationRegistry`, a trusted contract. |
| `low-level-calls` | Info | Accepted — native-token transfers and callback dispatch intentionally use `.call`. All such sites check the return value and revert on failure. |
| `timestamp` comparisons | Info | Accepted — deadlines, expiries, and challenge windows are the protocol's entire point. Miner drift of <=15s is not load-bearing at the minute/hour granularity we use. |
| `uninitialized-local` on `digits` / `count` / `idx` / `total` | Info (false pos) | Solidity zero-initialises locals; every one of these is written before it is read inside the same function. |
| `unused-state` on `Verifier.OFFSET_*`, `LEN_*` | Info (false pos) | Slither fails to detect use inside `calldata` slice expressions (e.g. `proof[OFFSET_NONCE:OFFSET_NEW_HASH]`). All constants are used. |
| `incorrect-equality` on `Status.RESOLVED`, `Mode.INSTANT` | Info (false pos) | Enum equality is safe — these are compile-time enumerated values, not observable on-chain state. |
| `reentrancy-benign` / `reentrancy-events` | Info | Accepted — all entry points that exhibit the pattern are already `nonReentrant`; state ordering beyond that is cosmetic. |

## Remaining findings (informational)

Re-running slither with medium+ filters shows 4 remaining entries — all are the false positives explained above:

```
locked-ether       → ReputationRegistry.mint          (runtime revert guards)
reentrancy-no-eth  → ReputationRegistry.update/mint/transfer/clone (all nonReentrant)
```

These are preserved for transparency; no additional code action is required.

## Reproducing

```bash
# One-time tooling setup (macOS)
python3 -m venv /tmp/slither-venv
/tmp/slither-venv/bin/pip install slither-analyzer solc-select
/tmp/slither-venv/bin/solc-select install 0.8.24
/tmp/slither-venv/bin/solc-select use 0.8.24

# From apps/contracts
PATH=/tmp/slither-venv/bin:$PATH \
  slither . --filter-paths "node_modules|typechain-types|contracts/mocks"
```
