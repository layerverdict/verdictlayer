// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IVerdictTypes
/// @notice Shared enums and structs for the Verdict protocol.
///
///         Kept in a dedicated file so AssertionRegistry, VerdictEnforcer,
///         EscalationManager and every application contract can import the
///         same canonical definitions without pulling in cross-dependencies.
interface IVerdictTypes {
    /// @notice Resolution mode requested by the asserter.
    ///         INSTANT — callback fires in the same tx as `submitVerdict`.
    ///         AUDITED — callback is queued; `challengePeriod` must elapse
    ///                   without a challenge before the enforcer dispatches.
    enum Mode {
        INSTANT,
        AUDITED
    }

    /// @notice Lifecycle outcome of an assertion.
    enum Outcome {
        PENDING,
        TRUE,
        FALSE,
        INVALID,
        ESCALATED
    }

    /// @notice Assertion lifecycle state machine.
    ///         OPEN       — created, awaiting first verdict.
    ///         VERDICTED  — a verdict has been submitted. For INSTANT this
    ///                      is terminal; for AUDITED this is the window
    ///                      during which a challenge may be filed.
    ///         CHALLENGED — a bond has been posted against the verdict;
    ///                      EscalationManager must resolve.
    ///         RESOLVED   — terminal; callback has either fired or been
    ///                      skipped (for INVALID outcomes).
    enum Status {
        OPEN,
        VERDICTED,
        CHALLENGED,
        RESOLVED
    }
}
