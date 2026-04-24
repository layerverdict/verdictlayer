// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IVerdictTypes} from "../interfaces/IVerdictTypes.sol";

/// @title IVerdictEnforcer
/// @notice Internal interface between AssertionRegistry and VerdictEnforcer.
///         The registry calls `dispatch` from `_finalise` once an assertion
///         is resolved. The enforcer invokes the application contract's
///         callback (`callbackSelector(assertionId, outcome, reasoningRoot)`).
interface IVerdictEnforcer is IVerdictTypes {
    function dispatch(
        bytes32 assertionId,
        address target,
        bytes4 selector,
        Outcome outcome,
        bytes32 reasoningRoot
    ) external;
}
