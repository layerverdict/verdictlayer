// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IVerdictEnforcer} from "./IVerdictEnforcer.sol";

/// @title VerdictEnforcer
/// @notice Thin dispatcher that fires an application contract's callback
///         once an assertion is finalised.
///
///         Rationale for existing as its own contract:
///           - AssertionRegistry remains focused on state machine + bonds;
///           - integrators can listen to a single `CallbackDispatched`
///             stream without indexing every application event;
///           - the callback surface (address + selector) can be sanity-
///             checked once in a privileged contract rather than in every
///             application integration.
///
///         The enforcer holds no bond state and emits a single event per
///         dispatch regardless of callback success. If the application
///         contract's callback reverts, the enforcer propagates the revert
///         so the registry's `_finalise` aborts and the outcome is NOT
///         written. This means applications MUST make their `onVerdict`
///         idempotent and non-reverting for outcomes they recognise.
contract VerdictEnforcer is IVerdictEnforcer, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");

    error ZeroAddress();
    error CallbackFailed(bytes32 assertionId, bytes returndata);
    error CallbackTargetNotContract(address target);

    event CallbackDispatched(
        bytes32 indexed assertionId,
        address indexed target,
        bytes4 indexed selector,
        Outcome outcome,
        bytes32 reasoningRoot
    );
    event RegistryAuthorized(address indexed registry);
    event RegistryRevoked(address indexed registry);

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    function authorizeRegistry(address registry) external onlyRole(ADMIN_ROLE) {
        if (registry == address(0)) revert ZeroAddress();
        _grantRole(REGISTRY_ROLE, registry);
        emit RegistryAuthorized(registry);
    }

    function revokeRegistry(address registry) external onlyRole(ADMIN_ROLE) {
        _revokeRole(REGISTRY_ROLE, registry);
        emit RegistryRevoked(registry);
    }

    /// @inheritdoc IVerdictEnforcer
    function dispatch(
        bytes32 assertionId,
        address target,
        bytes4 selector,
        Outcome outcome,
        bytes32 reasoningRoot
    ) external override onlyRole(REGISTRY_ROLE) {
        if (target == address(0)) revert ZeroAddress();
        // Prevent silently dispatching into an EOA: `.call` would succeed
        // with no effect, and the assertion would settle as "delivered"
        // without the application ever seeing the outcome.
        if (target.code.length == 0) revert CallbackTargetNotContract(target);

        bytes memory payload = abi.encodeWithSelector(
            selector,
            assertionId,
            outcome,
            reasoningRoot
        );
        (bool ok, bytes memory ret) = target.call(payload);
        if (!ok) revert CallbackFailed(assertionId, ret);

        emit CallbackDispatched(assertionId, target, selector, outcome, reasoningRoot);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControl) returns (bool) {
        return
            interfaceId == type(IVerdictEnforcer).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
