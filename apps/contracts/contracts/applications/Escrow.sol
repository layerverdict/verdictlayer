// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {VerdictConsumer} from "./base/VerdictConsumer.sol";
import {IAssertionRegistry} from "../interfaces/IAssertionRegistry.sol";
import {IVerdictCallback} from "../interfaces/IVerdictCallback.sol";

/// @title Escrow
/// @notice Freelance-escrow demo application for Verdict.
///
///         Flow:
///         1. Client creates escrow, locking ERC-20 funds + scope text.
///         2. Freelancer delivers, uploading a 0G Storage evidence root.
///         3. Client can accept (instant release) or open a dispute.
///         4. On dispute, escrow opens a Verdict assertion. Outcome:
///              TRUE  → client was right → refund to client
///              FALSE → freelancer was right → pay freelancer
///              INVALID (ignored by enforcer — funds stay locked; safety
///              valve is `expire()` once deadline + 30d has passed).
contract Escrow is VerdictConsumer, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum EscrowStatus {
        NONE,
        FUNDED,
        DELIVERED,
        ACCEPTED,
        DISPUTED,
        RESOLVED_CLIENT,
        RESOLVED_FREELANCER,
        EXPIRED
    }

    struct EscrowRecord {
        address client;
        address freelancer;
        IERC20 token;
        uint256 amount;
        uint64 deadline;
        uint64 disputeResponseDeadline;
        EscrowStatus status;
        string scope;
        bytes32 deliveryEvidence;
        bytes32 clientEvidence;
        bytes32 freelancerEvidence;
        bytes32 assertionId;
    }

    uint64 public constant DISPUTE_RESPONSE_WINDOW = 24 hours;
    uint64 public constant EXPIRY_AFTER_DEADLINE = 30 days;

    /// @notice Bond the escrow contract itself posts when creating a Verdict
    ///         assertion. Protects the registry from spam. Fixed per deploy
    ///         so dispute-opening quotes are predictable to the UI.
    uint256 public immutable assertionBond;

    uint256 private _nextEscrowId = 1;
    mapping(uint256 escrowId => EscrowRecord) private _escrows;

    error NotClient();
    error NotFreelancer();
    error InvalidStatus(EscrowStatus current);
    error InvalidDeadline();
    error ZeroAmount();
    error EvidenceMissing();
    error DeadlineNotReached();
    error BondNotFunded(uint256 have, uint256 need);

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed client,
        address indexed freelancer,
        address token,
        uint256 amount,
        uint64 deadline,
        string scope
    );
    event DeliverySubmitted(uint256 indexed escrowId, bytes32 evidence);
    event Accepted(uint256 indexed escrowId);
    event DisputeOpened(
        uint256 indexed escrowId,
        bytes32 indexed assertionId,
        bytes32 clientEvidence
    );
    event DisputeResponded(uint256 indexed escrowId, bytes32 freelancerEvidence);
    event ResolvedByVerdict(
        uint256 indexed escrowId,
        bytes32 indexed assertionId,
        Outcome outcome
    );
    event Expired(uint256 indexed escrowId);

    constructor(address registryAddr, address enforcerAddr, uint256 assertionBond_)
        VerdictConsumer(registryAddr, enforcerAddr)
    {
        assertionBond = assertionBond_;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Client / freelancer flow
    // ─────────────────────────────────────────────────────────────────────

    function createEscrow(
        address freelancer,
        IERC20 token,
        uint256 amount,
        uint64 deadline,
        string calldata scope
    ) external returns (uint256 escrowId) {
        if (freelancer == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        escrowId = _nextEscrowId++;
        _escrows[escrowId] = EscrowRecord({
            client: msg.sender,
            freelancer: freelancer,
            token: token,
            amount: amount,
            deadline: deadline,
            disputeResponseDeadline: 0,
            status: EscrowStatus.FUNDED,
            scope: scope,
            deliveryEvidence: bytes32(0),
            clientEvidence: bytes32(0),
            freelancerEvidence: bytes32(0),
            assertionId: bytes32(0)
        });

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit EscrowCreated(escrowId, msg.sender, freelancer, address(token), amount, deadline, scope);
    }

    function deliver(uint256 escrowId, bytes32 evidenceRoot) external {
        EscrowRecord storage e = _escrows[escrowId];
        if (msg.sender != e.freelancer) revert NotFreelancer();
        if (e.status != EscrowStatus.FUNDED) revert InvalidStatus(e.status);
        if (evidenceRoot == bytes32(0)) revert EvidenceMissing();

        e.deliveryEvidence = evidenceRoot;
        e.status = EscrowStatus.DELIVERED;
        emit DeliverySubmitted(escrowId, evidenceRoot);
    }

    function accept(uint256 escrowId) external nonReentrant {
        EscrowRecord storage e = _escrows[escrowId];
        if (msg.sender != e.client) revert NotClient();
        if (e.status != EscrowStatus.DELIVERED && e.status != EscrowStatus.FUNDED) {
            revert InvalidStatus(e.status);
        }
        e.status = EscrowStatus.ACCEPTED;
        e.token.safeTransfer(e.freelancer, e.amount);
        emit Accepted(escrowId);
    }

    /// @notice Open a dispute. Client must supply evidence and the contract
    ///         must have been funded with `assertionBond` (native 0G).
    ///
    ///         The freelancer must have already submitted a delivery. If
    ///         they haven't, the client should call `expire()` once the
    ///         escrow deadline has passed rather than fabricating a
    ///         dispute over nothing.
    function openDispute(
        uint256 escrowId,
        bytes32 clientEvidence
    ) external payable returns (bytes32 assertionId) {
        EscrowRecord storage e = _escrows[escrowId];
        if (msg.sender != e.client) revert NotClient();
        if (e.status != EscrowStatus.DELIVERED) revert InvalidStatus(e.status);
        if (clientEvidence == bytes32(0)) revert EvidenceMissing();
        if (msg.value != assertionBond) revert BondNotFunded(msg.value, assertionBond);

        e.status = EscrowStatus.DISPUTED;
        e.clientEvidence = clientEvidence;
        e.disputeResponseDeadline = uint64(block.timestamp) + DISPUTE_RESPONSE_WINDOW;

        bytes32[] memory roots = _buildEvidenceList(e.deliveryEvidence, clientEvidence, bytes32(0));

        IAssertionRegistry.AssertionInput memory input = IAssertionRegistry.AssertionInput({
            claim: _disputeClaim(e, escrowId),
            evidenceRoots: roots,
            callback: address(this),
            callbackSelector: this.onVerdict.selector,
            mode: Mode.AUDITED,
            challengePeriod: 30 minutes,
            bond: assertionBond,
            salt: keccak256(abi.encode("escrow", escrowId, block.timestamp))
        });

        assertionId = _createAssertion(input, escrowId);
        e.assertionId = assertionId;

        emit DisputeOpened(escrowId, assertionId, clientEvidence);
    }

    function respondToDispute(uint256 escrowId, bytes32 freelancerEvidence) external {
        EscrowRecord storage e = _escrows[escrowId];
        if (msg.sender != e.freelancer) revert NotFreelancer();
        if (e.status != EscrowStatus.DISPUTED) revert InvalidStatus(e.status);
        if (freelancerEvidence == bytes32(0)) revert EvidenceMissing();

        e.freelancerEvidence = freelancerEvidence;
        emit DisputeResponded(escrowId, freelancerEvidence);
    }

    /// @notice Safety valve: if the judge never returns a verdict and the
    ///         escrow's natural deadline has passed by `EXPIRY_AFTER_DEADLINE`,
    ///         the client may reclaim funds. Freelancers therefore have a
    ///         hard motivation to respond to disputes promptly.
    function expire(uint256 escrowId) external nonReentrant {
        EscrowRecord storage e = _escrows[escrowId];
        if (
            e.status != EscrowStatus.FUNDED &&
            e.status != EscrowStatus.DELIVERED &&
            e.status != EscrowStatus.DISPUTED
        ) revert InvalidStatus(e.status);
        if (block.timestamp < e.deadline + EXPIRY_AFTER_DEADLINE) {
            revert DeadlineNotReached();
        }

        e.status = EscrowStatus.EXPIRED;
        e.token.safeTransfer(e.client, e.amount);
        emit Expired(escrowId);
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
        uint256 escrowId = _assertionToLocal[assertionId];
        if (escrowId == 0) revert UnknownAssertion(assertionId);
        EscrowRecord storage e = _escrows[escrowId];
        if (e.status != EscrowStatus.DISPUTED) return;

        if (outcome == Outcome.TRUE) {
            // Claim resolved in favour of the asserter (client): refund.
            e.status = EscrowStatus.RESOLVED_CLIENT;
            e.token.safeTransfer(e.client, e.amount);
        } else if (outcome == Outcome.FALSE) {
            e.status = EscrowStatus.RESOLVED_FREELANCER;
            e.token.safeTransfer(e.freelancer, e.amount);
        } else {
            // Outcome.INVALID: the judge couldn't decide. Reset to
            // DELIVERED so the client can either accept the work or
            // open a fresh dispute with better evidence, rather than
            // waiting for the 30-day expiry safety valve.
            e.status = EscrowStatus.DELIVERED;
            e.clientEvidence = bytes32(0);
            e.freelancerEvidence = bytes32(0);
            e.disputeResponseDeadline = 0;
            e.assertionId = bytes32(0);
        }

        emit ResolvedByVerdict(escrowId, assertionId, outcome);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function getEscrow(uint256 escrowId) external view returns (EscrowRecord memory) {
        return _escrows[escrowId];
    }

    function totalEscrows() external view returns (uint256) {
        return _nextEscrowId - 1;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────

    function _buildEvidenceList(
        bytes32 delivery,
        bytes32 client,
        bytes32 freelancer
    ) internal pure returns (bytes32[] memory out) {
        uint256 count;
        if (delivery != bytes32(0)) count++;
        if (client != bytes32(0)) count++;
        if (freelancer != bytes32(0)) count++;
        out = new bytes32[](count);
        uint256 idx;
        if (delivery != bytes32(0)) { out[idx] = delivery; idx++; }
        if (client != bytes32(0)) { out[idx] = client; idx++; }
        if (freelancer != bytes32(0)) { out[idx] = freelancer; idx++; }
    }

    function _disputeClaim(EscrowRecord storage e, uint256 escrowId)
        internal
        view
        returns (string memory)
    {
        return
            string(
                abi.encodePacked(
                    "escrow#",
                    _toString(escrowId),
                    " scope: ",
                    e.scope
                )
            );
    }
}
