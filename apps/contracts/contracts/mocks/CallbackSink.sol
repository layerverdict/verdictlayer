// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IVerdictCallback} from "../interfaces/IVerdictCallback.sol";

/// @title CallbackSink
/// @notice Test-only no-op callback target that just records every dispatch.
contract CallbackSink is IVerdictCallback {
    struct Call {
        bytes32 assertionId;
        Outcome outcome;
        bytes32 reasoningRoot;
    }

    Call[] private _calls;

    function onVerdict(
        bytes32 assertionId,
        Outcome outcome,
        bytes32 reasoningRoot
    ) external override {
        _calls.push(
            Call({
                assertionId: assertionId,
                outcome: outcome,
                reasoningRoot: reasoningRoot
            })
        );
    }

    function calls() external view returns (Call[] memory) {
        return _calls;
    }
}
