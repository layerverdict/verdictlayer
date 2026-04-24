// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IVerdictTypes} from "./IVerdictTypes.sol";

/// @title IVerdictCallback
/// @notice Interface every application contract implements to receive the
///         final outcome of an assertion from VerdictEnforcer.
///
///         The selector registered with the assertion (`callbackSelector`)
///         MUST correspond to a function with this shape. Implementations
///         may restrict callers to the enforcer address set at construction.
interface IVerdictCallback is IVerdictTypes {
    /// @notice Called exactly once per assertion when it reaches RESOLVED.
    /// @param assertionId The resolving assertion.
    /// @param outcome Final outcome (TRUE / FALSE / INVALID).
    /// @param reasoningRoot 0G Storage root hash of the judge's reasoning
    ///        document. Applications may surface this to their UI.
    function onVerdict(
        bytes32 assertionId,
        Outcome outcome,
        bytes32 reasoningRoot
    ) external;
}
