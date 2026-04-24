// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IVerdictCallback} from "../../interfaces/IVerdictCallback.sol";
import {IVerdictTypes} from "../../interfaces/IVerdictTypes.sol";
import {IAssertionRegistry} from "../../interfaces/IAssertionRegistry.sol";

/// @title VerdictConsumer
/// @notice Base contract every Verdict-powered application inherits.
///         Centralises:
///           - storing the trusted enforcer address
///           - gating `onVerdict` to the enforcer
///           - exposing a `_createAssertion` helper that forwards bond
///           - storing `assertionId → localCaseId` linkage
abstract contract VerdictConsumer is IVerdictCallback {
    IAssertionRegistry public immutable registry;
    address public immutable enforcer;

    /// @dev Each application maintains its own case/policy/grant namespace.
    ///      The consumer tracks which Verdict assertion maps to which
    ///      local entity so `onVerdict` can route to the right record.
    mapping(bytes32 assertionId => uint256 localId) internal _assertionToLocal;

    error ZeroAddress();
    error NotEnforcer(address caller);
    error UnknownAssertion(bytes32 assertionId);
    error LocalAlreadyLinked(bytes32 assertionId);

    event AssertionLinked(bytes32 indexed assertionId, uint256 indexed localId);

    constructor(address registryAddr, address enforcerAddr) {
        if (registryAddr == address(0)) revert ZeroAddress();
        if (enforcerAddr == address(0)) revert ZeroAddress();
        registry = IAssertionRegistry(registryAddr);
        enforcer = enforcerAddr;
    }

    modifier onlyEnforcer() {
        if (msg.sender != enforcer) revert NotEnforcer(msg.sender);
        _;
    }

    /// @dev Helper that forwards the bond to the registry and records the
    ///      mapping from assertion id → local entity. Callers own the local
    ///      id generation so they can use whatever primary key they like
    ///      (uint256 escrow id, bytes32 policy id hashed to uint256, etc).
    function _createAssertion(
        IAssertionRegistry.AssertionInput memory input,
        uint256 localId
    ) internal returns (bytes32 assertionId) {
        assertionId = registry.createAssertion{value: input.bond}(input);
        if (_assertionToLocal[assertionId] != 0) revert LocalAlreadyLinked(assertionId);
        _assertionToLocal[assertionId] = localId;
        emit AssertionLinked(assertionId, localId);
    }

    /// @dev Lookup helper — returns 0 if the assertion is unknown to this
    ///      consumer.
    function localIdFor(bytes32 assertionId) external view returns (uint256) {
        return _assertionToLocal[assertionId];
    }

    /// @dev Application contracts are the on-chain asserter. The registry
    ///      refunds the bond back to the asserter on TRUE/FALSE outcomes,
    ///      so every consumer needs a payable fallback.
    receive() external payable {}
}
