// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {VerdictConsumer} from "./base/VerdictConsumer.sol";
import {IAssertionRegistry} from "../interfaces/IAssertionRegistry.sol";
import {IVerdictCallback} from "../interfaces/IVerdictCallback.sol";

/// @title MilestoneVault
/// @notice DAO grant vault with per-milestone partial release driven by
///         Verdict AI judgment.
///
///         A DAO creates a grant with N milestones, each with its own
///         amount and human-readable acceptance criteria string. When the
///         grantee submits evidence for a milestone, the vault opens an
///         AUDITED Verdict assertion. If the DAO treasury's policy is
///         pre-approved (default), the outcome auto-releases the
///         milestone's slice on TRUE; if FALSE the slice stays locked and
///         the grantee may resubmit evidence.
///
///         The vault keeps ERC-20 funds under its custody for the whole
///         lifetime of the grant. Any unclaimed residue may be reclaimed
///         by the DAO after `grantExpiresAt`.
contract MilestoneVault is VerdictConsumer, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum MilestoneStatus {
        PENDING,
        SUBMITTED,
        RELEASED,
        REJECTED
    }

    struct Milestone {
        uint256 amount;
        MilestoneStatus status;
        string criteria;
        bytes32 evidenceRoot;
        bytes32 assertionId;
    }

    struct Grant {
        address dao;
        address grantee;
        IERC20 token;
        uint256 totalAmount;
        uint256 releasedAmount;
        uint64 grantExpiresAt;
        bool reclaimed;
        Milestone[] milestones;
    }

    uint256 public immutable assertionBond;
    uint256 private _nextGrantId = 1;
    mapping(uint256 grantId => Grant) private _grants;

    /// @dev Reverse lookup from assertionId → (grantId, milestoneIndex).
    ///      Packed into a single uint256: high 128 bits = grantId, low 128
    ///      bits = milestoneIndex + 1 (0 = unset).
    mapping(bytes32 assertionId => uint256 packed) private _assertionToMilestone;

    error NotDao();
    error NotGrantee();
    error InvalidStatus(MilestoneStatus current);
    error InvalidGrantInput();
    error BondMismatch(uint256 expected, uint256 given);
    error EvidenceMissing();
    error AmountMismatch(uint256 expected, uint256 given);
    error GrantNotExpired();
    error GrantClosed();
    error AlreadyReclaimed();
    error MilestoneIndexOutOfRange(uint256 given, uint256 length);
    error MilestoneNotLinked(bytes32 assertionId);

    event GrantCreated(
        uint256 indexed grantId,
        address indexed dao,
        address indexed grantee,
        address token,
        uint256 totalAmount,
        uint64 grantExpiresAt,
        uint256 milestoneCount
    );
    event MilestoneSubmitted(
        uint256 indexed grantId,
        uint256 indexed milestoneIndex,
        bytes32 indexed assertionId,
        bytes32 evidenceRoot
    );
    event MilestoneReleased(
        uint256 indexed grantId,
        uint256 indexed milestoneIndex,
        uint256 amount
    );
    event MilestoneRejected(
        uint256 indexed grantId,
        uint256 indexed milestoneIndex
    );
    event GrantReclaimed(uint256 indexed grantId, uint256 amount);

    constructor(address registryAddr, address enforcerAddr, uint256 assertionBond_)
        VerdictConsumer(registryAddr, enforcerAddr)
    {
        assertionBond = assertionBond_;
    }

    // ─────────────────────────────────────────────────────────────────────
    // DAO / grantee flow
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Create a new grant. DAO pre-funds the vault with the full
    ///         grant amount.
    function createGrant(
        address grantee,
        IERC20 token,
        uint256[] calldata amounts,
        string[] calldata criteria,
        uint64 grantExpiresAt
    ) external returns (uint256 grantId) {
        if (grantee == address(0)) revert ZeroAddress();
        if (amounts.length == 0) revert InvalidGrantInput();
        if (amounts.length != criteria.length) revert InvalidGrantInput();
        if (grantExpiresAt <= block.timestamp) revert InvalidGrantInput();

        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            if (amounts[i] == 0) revert InvalidGrantInput();
            total += amounts[i];
        }

        grantId = _nextGrantId++;
        Grant storage g = _grants[grantId];
        g.dao = msg.sender;
        g.grantee = grantee;
        g.token = token;
        g.totalAmount = total;
        g.grantExpiresAt = grantExpiresAt;

        for (uint256 i = 0; i < amounts.length; i++) {
            g.milestones.push(
                Milestone({
                    amount: amounts[i],
                    status: MilestoneStatus.PENDING,
                    criteria: criteria[i],
                    evidenceRoot: bytes32(0),
                    assertionId: bytes32(0)
                })
            );
        }

        token.safeTransferFrom(msg.sender, address(this), total);

        emit GrantCreated(
            grantId,
            msg.sender,
            grantee,
            address(token),
            total,
            grantExpiresAt,
            amounts.length
        );
    }

    /// @notice Grantee submits evidence for a milestone and posts the
    ///         Verdict bond.
    function submitMilestone(
        uint256 grantId,
        uint256 milestoneIndex,
        bytes32 evidenceRoot
    ) external payable nonReentrant returns (bytes32 assertionId) {
        Grant storage g = _grants[grantId];
        if (msg.sender != g.grantee) revert NotGrantee();
        // Grant funds may have been reclaimed after expiry; reject late
        // submissions so the grantee's bond isn't locked by a callback
        // that would revert on insufficient token balance.
        if (g.reclaimed || block.timestamp > g.grantExpiresAt) revert GrantClosed();
        if (milestoneIndex >= g.milestones.length) {
            revert MilestoneIndexOutOfRange(milestoneIndex, g.milestones.length);
        }
        Milestone storage m = g.milestones[milestoneIndex];
        if (
            m.status != MilestoneStatus.PENDING &&
            m.status != MilestoneStatus.REJECTED
        ) revert InvalidStatus(m.status);
        if (evidenceRoot == bytes32(0)) revert EvidenceMissing();
        if (msg.value != assertionBond) revert BondMismatch(assertionBond, msg.value);

        m.status = MilestoneStatus.SUBMITTED;
        m.evidenceRoot = evidenceRoot;

        bytes32[] memory roots = new bytes32[](1);
        roots[0] = evidenceRoot;

        IAssertionRegistry.AssertionInput memory input = IAssertionRegistry.AssertionInput({
            claim: _milestoneClaim(grantId, milestoneIndex, m.criteria),
            evidenceRoots: roots,
            callback: address(this),
            callbackSelector: this.onVerdict.selector,
            mode: Mode.AUDITED,
            challengePeriod: 1 hours,
            bond: assertionBond,
            salt: keccak256(
                abi.encode("milestone", grantId, milestoneIndex, block.timestamp)
            )
        });

        // The callback needs a (grantId, milestoneIndex) pair to know which
        // milestone to route the outcome to; we pack both into the
        // `_assertionToMilestone` key and keep the standard
        // `_assertionToLocal` mapping so `localIdFor()` stays usable.
        assertionId = registry.createAssertion{value: assertionBond}(input);
        m.assertionId = assertionId;
        _assertionToMilestone[assertionId] =
            (grantId << 128) | (milestoneIndex + 1);
        _assertionToLocal[assertionId] = grantId;
        emit AssertionLinked(assertionId, grantId);

        emit MilestoneSubmitted(grantId, milestoneIndex, assertionId, evidenceRoot);
    }

    /// @notice After grant expiry, the DAO reclaims any unreleased residue.
    function reclaim(uint256 grantId) external nonReentrant {
        Grant storage g = _grants[grantId];
        if (msg.sender != g.dao) revert NotDao();
        if (block.timestamp <= g.grantExpiresAt) revert GrantNotExpired();
        if (g.reclaimed) revert AlreadyReclaimed();

        uint256 residue = g.totalAmount - g.releasedAmount;
        g.reclaimed = true;
        if (residue > 0) {
            g.token.safeTransfer(g.dao, residue);
        }
        emit GrantReclaimed(grantId, residue);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Verdict callback
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IVerdictCallback
    function onVerdict(
        bytes32 assertionId,
        Outcome outcome,
        bytes32 /* reasoningRoot */
    ) external override onlyEnforcer nonReentrant {
        uint256 packed = _assertionToMilestone[assertionId];
        if (packed == 0) revert MilestoneNotLinked(assertionId);
        uint256 grantId = packed >> 128;
        uint256 milestoneIndex = (packed & type(uint128).max) - 1;

        Grant storage g = _grants[grantId];
        Milestone storage m = g.milestones[milestoneIndex];
        if (m.status != MilestoneStatus.SUBMITTED) return;

        if (outcome == Outcome.TRUE) {
            m.status = MilestoneStatus.RELEASED;
            g.releasedAmount += m.amount;
            g.token.safeTransfer(g.grantee, m.amount);
            emit MilestoneReleased(grantId, milestoneIndex, m.amount);
        } else if (outcome == Outcome.FALSE) {
            m.status = MilestoneStatus.REJECTED;
            emit MilestoneRejected(grantId, milestoneIndex);
        } else {
            // Outcome.INVALID: treat as REJECTED so the grantee can
            // resubmit with better evidence. Leaving the slot in
            // SUBMITTED would block it forever — submitMilestone only
            // accepts PENDING or REJECTED.
            m.status = MilestoneStatus.REJECTED;
            emit MilestoneRejected(grantId, milestoneIndex);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function getGrant(uint256 grantId)
        external
        view
        returns (
            address dao,
            address grantee,
            address token,
            uint256 totalAmount,
            uint256 releasedAmount,
            uint64 grantExpiresAt,
            bool reclaimed,
            uint256 milestoneCount
        )
    {
        Grant storage g = _grants[grantId];
        return (
            g.dao,
            g.grantee,
            address(g.token),
            g.totalAmount,
            g.releasedAmount,
            g.grantExpiresAt,
            g.reclaimed,
            g.milestones.length
        );
    }

    function getMilestone(uint256 grantId, uint256 milestoneIndex)
        external
        view
        returns (Milestone memory)
    {
        Grant storage g = _grants[grantId];
        if (milestoneIndex >= g.milestones.length) {
            revert MilestoneIndexOutOfRange(milestoneIndex, g.milestones.length);
        }
        return g.milestones[milestoneIndex];
    }

    function totalGrants() external view returns (uint256) {
        return _nextGrantId - 1;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────

    function _milestoneClaim(
        uint256 grantId,
        uint256 milestoneIndex,
        string memory criteria
    ) internal pure returns (string memory) {
        return
            string(
                abi.encodePacked(
                    "grant#",
                    _toString(grantId),
                    " milestone#",
                    _toString(milestoneIndex),
                    " criteria: ",
                    criteria
                )
            );
    }
}
