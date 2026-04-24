// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {VerdictConsumer} from "./base/VerdictConsumer.sol";
import {IAssertionRegistry} from "../interfaces/IAssertionRegistry.sol";
import {IVerdictCallback} from "../interfaces/IVerdictCallback.sol";

/// @title AuthenticityCertifier
/// @notice Anyone may submit an asset hash (perceptual hash of an image, a
///         document digest, a tokenURI root etc.) alongside a reference
///         hash (e.g. the original mint's canonical data). The contract
///         opens an INSTANT Verdict assertion; the judge compares the two
///         and returns TRUE when the submission matches the reference.
///         On TRUE the contract records an on-chain certificate.
///
///         This contract is read-heavy and emission-heavy — third parties
///         (e.g. marketplaces) can query `isCertified(assetHash)` or filter
///         the `CertificateIssued` event log.
contract AuthenticityCertifier is VerdictConsumer, ReentrancyGuard {
    enum CheckStatus {
        NONE,
        PENDING,
        CERTIFIED,
        REJECTED
    }

    struct Check {
        address submitter;
        bytes32 assetHash;
        bytes32 referenceHash;
        CheckStatus status;
        bytes32 assertionId;
        bytes32 reasoningRoot;
        uint64 submittedAt;
        uint64 decidedAt;
    }

    uint256 public immutable assertionBond;
    uint256 private _nextCheckId = 1;
    mapping(uint256 checkId => Check) private _checks;

    /// @notice `true` once any check on `assetHash` has been CERTIFIED.
    ///         The lookup is intentionally flat so integrators do not need
    ///         to track which particular certificate matched.
    mapping(bytes32 assetHash => uint256 certificateId) private _certificatesByHash;

    error BondMismatch(uint256 expected, uint256 given);
    error MissingHash();

    event CheckSubmitted(
        uint256 indexed checkId,
        bytes32 indexed assetHash,
        bytes32 indexed referenceHash,
        address submitter,
        bytes32 assertionId
    );
    event CertificateIssued(
        uint256 indexed checkId,
        bytes32 indexed assetHash,
        bytes32 reasoningRoot
    );
    event CheckRejected(uint256 indexed checkId, bytes32 indexed assetHash);

    constructor(address registryAddr, address enforcerAddr, uint256 assertionBond_)
        VerdictConsumer(registryAddr, enforcerAddr)
    {
        assertionBond = assertionBond_;
    }

    function submitCheck(
        bytes32 assetHash,
        bytes32 referenceHash
    ) external payable nonReentrant returns (uint256 checkId, bytes32 assertionId) {
        if (assetHash == bytes32(0) || referenceHash == bytes32(0)) revert MissingHash();
        if (msg.value != assertionBond) revert BondMismatch(assertionBond, msg.value);

        checkId = _nextCheckId++;
        _checks[checkId] = Check({
            submitter: msg.sender,
            assetHash: assetHash,
            referenceHash: referenceHash,
            status: CheckStatus.PENDING,
            assertionId: bytes32(0),
            reasoningRoot: bytes32(0),
            submittedAt: uint64(block.timestamp),
            decidedAt: 0
        });

        bytes32[] memory roots = new bytes32[](2);
        roots[0] = assetHash;
        roots[1] = referenceHash;

        IAssertionRegistry.AssertionInput memory input = IAssertionRegistry.AssertionInput({
            claim: "asset hash matches reference (perceptual + metadata)",
            evidenceRoots: roots,
            callback: address(this),
            callbackSelector: this.onVerdict.selector,
            mode: Mode.INSTANT,
            challengePeriod: 0,
            bond: assertionBond,
            salt: keccak256(abi.encode("authenticity", checkId, block.timestamp))
        });

        assertionId = _createAssertion(input, checkId);
        _checks[checkId].assertionId = assertionId;

        emit CheckSubmitted(checkId, assetHash, referenceHash, msg.sender, assertionId);
    }

    /// @inheritdoc IVerdictCallback
    function onVerdict(
        bytes32 assertionId,
        Outcome outcome,
        bytes32 reasoningRoot
    ) external override onlyEnforcer {
        uint256 checkId = _assertionToLocal[assertionId];
        if (checkId == 0) revert UnknownAssertion(assertionId);
        Check storage c = _checks[checkId];
        if (c.status != CheckStatus.PENDING) return;

        c.decidedAt = uint64(block.timestamp);
        c.reasoningRoot = reasoningRoot;

        if (outcome == Outcome.TRUE) {
            c.status = CheckStatus.CERTIFIED;
            _certificatesByHash[c.assetHash] = checkId;
            emit CertificateIssued(checkId, c.assetHash, reasoningRoot);
        } else if (outcome == Outcome.FALSE) {
            c.status = CheckStatus.REJECTED;
            emit CheckRejected(checkId, c.assetHash);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function getCheck(uint256 checkId) external view returns (Check memory) {
        return _checks[checkId];
    }

    function isCertified(bytes32 assetHash) external view returns (bool) {
        return _certificatesByHash[assetHash] != 0;
    }

    function certificateOf(bytes32 assetHash) external view returns (uint256) {
        return _certificatesByHash[assetHash];
    }

    function totalChecks() external view returns (uint256) {
        return _nextCheckId - 1;
    }
}
