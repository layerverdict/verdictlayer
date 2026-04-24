// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {AssertionRegistry} from "./AssertionRegistry.sol";
import {IVerdictTypes} from "../interfaces/IVerdictTypes.sol";
import {ReputationRegistry} from "../reputation/ReputationRegistry.sol";

/// @title EscalationManager
/// @notice Handles the appeal lifecycle for challenged AUDITED assertions.
///
///         When `AssertionRegistry.challengeAssertion` moves an assertion to
///         CHALLENGED, the backend pulls the dispute through a multi-agent
///         panel (3 TEE judges). Each panellist's call is recorded via
///         `recordPanelVote`. Once the panel is complete (`PANEL_SIZE`
///         votes), `closeAppeal` computes the majority outcome, calls
///         `AssertionRegistry.resolveAssertion` (bond settlement happens
///         there), and adjusts judge reputation:
///
///           - each panellist: `recordVerdict(agreedWithMajority)`
///           - original judge (`originalJudgeTokenId`): if majority flipped
///             the outcome, `recordAppealLost(originalJudgeTokenId)` is
///             called in addition.
contract EscalationManager is AccessControl, IVerdictTypes {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant PANEL_ROLE = keccak256("PANEL_ROLE");

    /// @notice Number of votes required to close an appeal. Fixed at 3 for
    ///         v1 (GLM-5, DeepSeek v3, Qwen3-VL). Odd to avoid ties.
    uint8 public constant PANEL_SIZE = 3;

    AssertionRegistry public immutable registry;
    ReputationRegistry public immutable reputation;

    struct Appeal {
        bool opened;
        bool closed;
        uint256 originalJudgeTokenId;
        Outcome originalOutcome;
        uint8 votesRecorded;
        uint8 trueVotes;
        uint8 falseVotes;
        uint8 invalidVotes;
        // Panel token ids in vote order; also used to prevent double voting.
        uint256[PANEL_SIZE] panelTokenIds;
        Outcome[PANEL_SIZE] panelOutcomes;
    }

    mapping(bytes32 assertionId => Appeal) private _appeals;

    error ZeroAddress();
    error AppealAlreadyOpen(bytes32 id);
    error AppealNotOpen(bytes32 id);
    error AppealAlreadyClosed(bytes32 id);
    error PanelFull(bytes32 id);
    error PanelIncomplete(bytes32 id, uint8 have, uint8 need);
    error DuplicatePanelist(bytes32 id, uint256 tokenId);
    error InvalidOutcome(Outcome outcome);

    event AppealOpened(
        bytes32 indexed assertionId,
        uint256 originalJudgeTokenId,
        Outcome originalOutcome
    );
    event PanelVoteRecorded(
        bytes32 indexed assertionId,
        uint256 indexed judgeTokenId,
        Outcome outcome,
        uint8 voteIndex
    );
    event AppealClosed(
        bytes32 indexed assertionId,
        Outcome finalOutcome,
        uint8 trueVotes,
        uint8 falseVotes,
        uint8 invalidVotes
    );

    constructor(
        address admin,
        address registryAddr,
        address reputationAddr
    ) {
        if (admin == address(0)) revert ZeroAddress();
        if (registryAddr == address(0)) revert ZeroAddress();
        if (reputationAddr == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        registry = AssertionRegistry(payable(registryAddr));
        reputation = ReputationRegistry(reputationAddr);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Appeal flow
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Open an appeal panel for a CHALLENGED assertion. Admin-gated
    ///         because the backend decides when to kick off the swarm (e.g.
    ///         after waiting for both sides to upload rebuttal evidence).
    function openAppeal(bytes32 assertionId) external onlyRole(ADMIN_ROLE) {
        Appeal storage ap = _appeals[assertionId];
        if (ap.opened) revert AppealAlreadyOpen(assertionId);

        AssertionRegistry.Assertion memory a = registry.getAssertion(assertionId);
        if (a.status != Status.CHALLENGED) {
            // Only meaningful to appeal what was actually challenged.
            revert AppealNotOpen(assertionId);
        }

        ap.opened = true;
        ap.originalJudgeTokenId = a.judgeTokenId;
        ap.originalOutcome = a.originalOutcome;

        emit AppealOpened(assertionId, a.judgeTokenId, a.originalOutcome);
    }

    /// @notice Record a single panel judge's call. Restricted to PANEL_ROLE
    ///         (the backend relayer signs one tx per panelist).
    function recordPanelVote(
        bytes32 assertionId,
        uint256 judgeTokenId,
        Outcome outcome
    ) external onlyRole(PANEL_ROLE) {
        if (outcome == Outcome.PENDING || outcome == Outcome.ESCALATED) {
            revert InvalidOutcome(outcome);
        }

        Appeal storage ap = _appeals[assertionId];
        if (!ap.opened) revert AppealNotOpen(assertionId);
        if (ap.closed) revert AppealAlreadyClosed(assertionId);
        if (ap.votesRecorded >= PANEL_SIZE) revert PanelFull(assertionId);

        for (uint8 i = 0; i < ap.votesRecorded; i++) {
            if (ap.panelTokenIds[i] == judgeTokenId) {
                revert DuplicatePanelist(assertionId, judgeTokenId);
            }
        }

        uint8 idx = ap.votesRecorded;
        ap.panelTokenIds[idx] = judgeTokenId;
        ap.panelOutcomes[idx] = outcome;
        ap.votesRecorded = idx + 1;

        if (outcome == Outcome.TRUE) ap.trueVotes += 1;
        else if (outcome == Outcome.FALSE) ap.falseVotes += 1;
        else if (outcome == Outcome.INVALID) ap.invalidVotes += 1;

        emit PanelVoteRecorded(assertionId, judgeTokenId, outcome, idx);
    }

    /// @notice Close the appeal once all `PANEL_SIZE` panellists have voted.
    ///         Computes the plurality outcome, commits it to the registry,
    ///         and updates every panellist's reputation. If the original
    ///         judge's call was overturned, applies an additional penalty
    ///         via `recordAppealLost`.
    function closeAppeal(bytes32 assertionId) external onlyRole(ADMIN_ROLE) {
        Appeal storage ap = _appeals[assertionId];
        if (!ap.opened) revert AppealNotOpen(assertionId);
        if (ap.closed) revert AppealAlreadyClosed(assertionId);
        if (ap.votesRecorded < PANEL_SIZE) {
            revert PanelIncomplete(assertionId, ap.votesRecorded, PANEL_SIZE);
        }

        Outcome finalOutcome = _plurality(ap);
        ap.closed = true;

        emit AppealClosed(
            assertionId,
            finalOutcome,
            ap.trueVotes,
            ap.falseVotes,
            ap.invalidVotes
        );

        for (uint8 i = 0; i < PANEL_SIZE; i++) {
            bool agreed = ap.panelOutcomes[i] == finalOutcome;
            reputation.recordVerdict(ap.panelTokenIds[i], agreed);
        }

        if (finalOutcome != ap.originalOutcome && ap.originalJudgeTokenId != 0) {
            reputation.recordAppealLost(ap.originalJudgeTokenId);
        }

        registry.resolveAssertion(assertionId, finalOutcome);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function appealOf(bytes32 assertionId)
        external
        view
        returns (
            bool opened,
            bool closed,
            uint256 originalJudgeTokenId,
            Outcome originalOutcome,
            uint8 votesRecorded,
            uint8 trueVotes,
            uint8 falseVotes,
            uint8 invalidVotes
        )
    {
        Appeal storage ap = _appeals[assertionId];
        return (
            ap.opened,
            ap.closed,
            ap.originalJudgeTokenId,
            ap.originalOutcome,
            ap.votesRecorded,
            ap.trueVotes,
            ap.falseVotes,
            ap.invalidVotes
        );
    }

    function panelOf(bytes32 assertionId)
        external
        view
        returns (uint256[PANEL_SIZE] memory tokenIds, Outcome[PANEL_SIZE] memory outcomes)
    {
        Appeal storage ap = _appeals[assertionId];
        return (ap.panelTokenIds, ap.panelOutcomes);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Plurality over TRUE/FALSE/INVALID. PANEL_SIZE=3 guarantees a
    ///      unique winner because any 3-way split (1-1-1) is impossible on
    ///      a 3-vote panel, but we fall back to INVALID if somehow reached.
    function _plurality(Appeal storage ap) internal view returns (Outcome) {
        uint8 t = ap.trueVotes;
        uint8 f = ap.falseVotes;
        uint8 i = ap.invalidVotes;
        if (t > f && t > i) return Outcome.TRUE;
        if (f > t && f > i) return Outcome.FALSE;
        if (i > t && i > f) return Outcome.INVALID;
        return Outcome.INVALID;
    }
}
