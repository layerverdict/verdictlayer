// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IVerdictTypes} from "./IVerdictTypes.sol";

/// @title IAssertionRegistry
/// @notice Canonical on-chain store for Verdict assertions.
///
///         Every dispute, claim or milestone in the Verdict protocol is
///         anchored as an `Assertion` in this registry. A judge agent —
///         operating inside 0G Compute TEE — calls `submitVerdict` with an
///         outcome, the hash of its reasoning document stored on 0G
///         Storage, and the TEE attestation blob.
///
///         Application contracts (Escrow, ParametricInsurance, etc.) pass a
///         `callback` + `callbackSelector` when creating the assertion. The
///         VerdictEnforcer invokes that callback with the resolved outcome
///         once the assertion is finalised.
interface IAssertionRegistry is IVerdictTypes {
    /// @notice Full input payload for `createAssertion`.
    /// @dev Kept as a struct so future fields can be added without changing
    ///      selectors of the application contracts that call us.
    struct AssertionInput {
        string claim;
        bytes32[] evidenceRoots;
        address callback;
        bytes4 callbackSelector;
        Mode mode;
        uint64 challengePeriod;
        uint256 bond;
        bytes32 salt;
    }

    /// @notice On-chain record of an assertion.
    struct Assertion {
        bytes32 id;
        string claim;
        bytes32[] evidenceRoots;
        address asserter;
        address challenger;
        address callback;
        bytes4 callbackSelector;
        Mode mode;
        uint64 challengePeriod;
        uint256 bond;
        Status status;
        Outcome originalOutcome;
        Outcome outcome;
        bytes32 reasoningRoot;
        bytes32 attestationHash;
        uint256 judgeTokenId;
        uint64 createdAt;
        uint64 verdictedAt;
        uint64 resolvedAt;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────

    event AssertionCreated(
        bytes32 indexed id,
        address indexed asserter,
        address indexed callback,
        Mode mode,
        uint256 bond,
        bytes32[] evidenceRoots,
        string claim
    );

    event VerdictSubmitted(
        bytes32 indexed id,
        address indexed judge,
        uint256 indexed judgeTokenId,
        Outcome outcome,
        bytes32 reasoningRoot,
        bytes32 attestationHash
    );

    event AssertionChallenged(
        bytes32 indexed id,
        address indexed challenger,
        uint256 bond
    );

    event AssertionResolved(
        bytes32 indexed id,
        Outcome finalOutcome,
        Status finalStatus
    );

    // ─────────────────────────────────────────────────────────────────────
    // Mutators
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Create a new assertion. The caller pays `input.bond` up-front
    ///         in native token, which is refunded to the asserter only on a
    ///         TRUE / FALSE outcome. An INVALID outcome slashes the bond to
    ///         the protocol fee sink.
    function createAssertion(
        AssertionInput calldata input
    ) external payable returns (bytes32 id);

    /// @notice Submit a verdict for an assertion. Restricted to addresses
    ///         holding JUDGE_ROLE; typically the backend relayer signing on
    ///         behalf of the TEE.
    function submitVerdict(
        bytes32 id,
        Outcome outcome,
        bytes32 reasoningRoot,
        bytes32 attestationHash,
        uint256 judgeTokenId
    ) external;

    /// @notice Challenge a verdicted assertion. Must post `bond` in native
    ///         token. Only callable for AUDITED assertions inside the
    ///         challenge window.
    function challengeAssertion(bytes32 id) external payable;

    /// @notice Finalise an assertion with `finalOutcome`. Callable by the
    ///         EscalationManager once the dispute is resolved, or anyone
    ///         once the challenge window has elapsed without a challenge.
    function resolveAssertion(bytes32 id, Outcome finalOutcome) external;

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function getAssertion(bytes32 id) external view returns (Assertion memory);

    function isResolved(bytes32 id) external view returns (bool);
}
