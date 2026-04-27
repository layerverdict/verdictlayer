// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IAssertionRegistry} from "../interfaces/IAssertionRegistry.sol";
import {IVerdictEnforcer} from "./IVerdictEnforcer.sol";

/// @title AssertionRegistry
/// @notice Canonical on-chain store for Verdict assertions.
///
///         Lifecycle:
///
///           createAssertion()          msg.value == bond
///               │  status = OPEN
///               ▼
///           submitVerdict()            JUDGE_ROLE
///               │  status = VERDICTED
///               │  outcome = judge call
///               │
///               ├─ Mode.INSTANT ──────► _finalise() ──► callback + bond refund
///               │
///               └─ Mode.AUDITED
///                     │
///                     ├─ challengeAssertion() (within window)  EscalationManager
///                     │     status = CHALLENGED
///                     │         │
///                     │         ▼
///                     │   resolveAssertion()  (from EscalationManager)
///                     │         │
///                     │         ▼
///                     │     _finalise()
///                     │
///                     └─ no challenge → resolveAssertion() (anyone after window)
///                           │
///                           ▼
///                        _finalise()
///
///         Bond accounting:
///           - creation bond is escrowed in the registry
///           - TRUE / FALSE  → bond refunded to asserter
///           - INVALID       → bond forfeited to fee sink
///           - on AUDITED challenge, the challenger posts the same bond amount;
///             if the challenge succeeds (final outcome != original) the
///             challenger is refunded, asserter's bond goes to the challenger;
///             if it fails the challenger's bond goes to the asserter.
contract AssertionRegistry is IAssertionRegistry, AccessControl, ReentrancyGuard {
    // ─────────────────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────────────────

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant JUDGE_ROLE = keccak256("JUDGE_ROLE");
    bytes32 public constant ENFORCER_ROLE = keccak256("ENFORCER_ROLE");

    // ─────────────────────────────────────────────────────────────────────
    // Config
    // ─────────────────────────────────────────────────────────────────────

    uint64 public constant MIN_CHALLENGE_PERIOD = 5 minutes;
    uint64 public constant MAX_CHALLENGE_PERIOD = 7 days;

    address public feeSink;
    IVerdictEnforcer public enforcer;

    // ─────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────

    mapping(bytes32 id => Assertion) private _assertions;
    mapping(bytes32 id => bool) private _exists;
    mapping(bytes32 id => uint256) private _challengeBond;

    // ─────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error EmptyClaim();
    error BondMismatch(uint256 expected, uint256 given);
    error InvalidChallengePeriod(uint64 given);
    error InvalidCallbackSelector();
    error AssertionAlreadyExists(bytes32 id);
    error AssertionMissing(bytes32 id);
    error InvalidStatusTransition(Status from, Status to);
    error NotAuditedMode();
    error ChallengeWindowClosed();
    error ChallengeWindowStillOpen();
    error OutcomeCannotBePending();
    error EnforcerNotSet();
    error ZeroBondChallenge();

    // ─────────────────────────────────────────────────────────────────────
    // Events — beyond the interface spec
    // ─────────────────────────────────────────────────────────────────────

    event EnforcerUpdated(address indexed previous, address indexed current);
    event FeeSinkUpdated(address indexed previous, address indexed current);
    event BondSettled(
        bytes32 indexed id,
        address indexed to,
        uint256 amount,
        string reason
    );

    // ─────────────────────────────────────────────────────────────────────
    // Construction
    // ─────────────────────────────────────────────────────────────────────

    constructor(address admin, address feeSink_) {
        if (admin == address(0)) revert ZeroAddress();
        if (feeSink_ == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        feeSink = feeSink_;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────

    function setEnforcer(address newEnforcer) external onlyRole(ADMIN_ROLE) {
        if (newEnforcer == address(0)) revert ZeroAddress();
        address previous = address(enforcer);
        enforcer = IVerdictEnforcer(newEnforcer);
        _grantRole(ENFORCER_ROLE, newEnforcer);
        if (previous != address(0)) _revokeRole(ENFORCER_ROLE, previous);
        emit EnforcerUpdated(previous, newEnforcer);
    }

    function setFeeSink(address newSink) external onlyRole(ADMIN_ROLE) {
        if (newSink == address(0)) revert ZeroAddress();
        address previous = feeSink;
        feeSink = newSink;
        emit FeeSinkUpdated(previous, newSink);
    }

    /// @notice Admin escape hatch: resolve an assertion and settle bonds
    ///         without dispatching the application callback.
    ///
    ///         Used when the application contract is broken (reverts on
    ///         onVerdict, selfdestructed, etc.) and the assertion would
    ///         otherwise be stuck forever. Skipping dispatch means the
    ///         application's internal state will NOT advance — operators
    ///         must reconcile off-chain or via a separate admin path on
    ///         the application itself.
    ///
    ///         Accepts any outcome for OPEN / VERDICTED / CHALLENGED
    ///         statuses so the admin can move the assertion into RESOLVED
    ///         regardless of the branch it was stuck in.
    function forceResolve(bytes32 id, Outcome forcedOutcome)
        external
        onlyRole(ADMIN_ROLE)
        nonReentrant
    {
        Assertion storage a = _assertions[id];
        if (!_exists[id]) revert AssertionMissing(id);
        if (a.status == Status.RESOLVED) {
            revert InvalidStatusTransition(a.status, Status.RESOLVED);
        }
        if (forcedOutcome == Outcome.PENDING || forcedOutcome == Outcome.ESCALATED) {
            revert OutcomeCannotBePending();
        }

        a.status = Status.RESOLVED;
        a.outcome = forcedOutcome;
        a.resolvedAt = uint64(block.timestamp);

        _settleBonds(a, forcedOutcome);
        emit AssertionResolved(a.id, forcedOutcome, Status.RESOLVED);
        // Deliberately no enforcer.dispatch — the whole point of this
        // path is to route around a broken callback.
    }

    // ─────────────────────────────────────────────────────────────────────
    // IAssertionRegistry — mutators
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IAssertionRegistry
    function createAssertion(
        AssertionInput calldata input
    ) external payable override nonReentrant returns (bytes32 id) {
        if (bytes(input.claim).length == 0) revert EmptyClaim();
        if (input.callback == address(0)) revert ZeroAddress();
        if (input.callbackSelector == bytes4(0)) revert InvalidCallbackSelector();
        if (msg.value != input.bond) revert BondMismatch(input.bond, msg.value);
        if (input.mode == Mode.AUDITED) {
            if (
                input.challengePeriod < MIN_CHALLENGE_PERIOD ||
                input.challengePeriod > MAX_CHALLENGE_PERIOD
            ) revert InvalidChallengePeriod(input.challengePeriod);
        }

        id = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                msg.sender,
                input.callback,
                input.callbackSelector,
                input.claim,
                input.evidenceRoots,
                input.bond,
                input.mode,
                input.challengePeriod,
                input.salt
            )
        );
        if (_exists[id]) revert AssertionAlreadyExists(id);
        _exists[id] = true;

        Assertion storage a = _assertions[id];
        a.id = id;
        a.claim = input.claim;
        a.evidenceRoots = input.evidenceRoots;
        a.asserter = msg.sender;
        a.callback = input.callback;
        a.callbackSelector = input.callbackSelector;
        a.mode = input.mode;
        a.challengePeriod = input.challengePeriod;
        a.bond = input.bond;
        a.status = Status.OPEN;
        a.originalOutcome = Outcome.PENDING;
        a.outcome = Outcome.PENDING;
        a.createdAt = uint64(block.timestamp);

        emit AssertionCreated(
            id,
            msg.sender,
            input.callback,
            input.mode,
            input.bond,
            input.evidenceRoots,
            input.claim
        );
    }

    /// @inheritdoc IAssertionRegistry
    function submitVerdict(
        bytes32 id,
        Outcome outcome,
        bytes32 reasoningRoot,
        bytes32 attestationHash,
        uint256 judgeTokenId
    ) external override onlyRole(JUDGE_ROLE) nonReentrant {
        if (outcome == Outcome.PENDING || outcome == Outcome.ESCALATED) {
            revert OutcomeCannotBePending();
        }

        Assertion storage a = _assertions[id];
        if (!_exists[id]) revert AssertionMissing(id);
        if (a.status != Status.OPEN) {
            revert InvalidStatusTransition(a.status, Status.VERDICTED);
        }

        a.status = Status.VERDICTED;
        a.originalOutcome = outcome;
        a.outcome = outcome;
        a.reasoningRoot = reasoningRoot;
        a.attestationHash = attestationHash;
        a.judgeTokenId = judgeTokenId;
        a.verdictedAt = uint64(block.timestamp);

        emit VerdictSubmitted(
            id,
            msg.sender,
            judgeTokenId,
            outcome,
            reasoningRoot,
            attestationHash
        );

        if (a.mode == Mode.INSTANT) {
            _finalise(a, outcome);
        }
    }

    /// @inheritdoc IAssertionRegistry
    function challengeAssertion(bytes32 id) external payable override nonReentrant {
        Assertion storage a = _assertions[id];
        if (!_exists[id]) revert AssertionMissing(id);
        if (a.status != Status.VERDICTED) {
            revert InvalidStatusTransition(a.status, Status.CHALLENGED);
        }
        if (a.mode != Mode.AUDITED) revert NotAuditedMode();
        if (block.timestamp > a.verdictedAt + a.challengePeriod) {
            revert ChallengeWindowClosed();
        }
        if (msg.value != a.bond) revert BondMismatch(a.bond, msg.value);
        // A zero-bond AUDITED assertion cannot be meaningfully challenged —
        // there is nothing at stake on either side and the challenge
        // amounts to free dispute spam. Application contracts must post a
        // non-zero bond whenever they choose AUDITED mode.
        if (msg.value == 0) revert ZeroBondChallenge();

        a.status = Status.CHALLENGED;
        a.challenger = msg.sender;
        _challengeBond[id] = msg.value;

        emit AssertionChallenged(id, msg.sender, msg.value);
    }

    /// @inheritdoc IAssertionRegistry
    function resolveAssertion(bytes32 id, Outcome finalOutcome)
        external
        override
        nonReentrant
    {
        Assertion storage a = _assertions[id];
        if (!_exists[id]) revert AssertionMissing(id);

        if (a.status == Status.VERDICTED) {
            // No challenge arrived — anyone may finalise after the window.
            if (a.mode != Mode.AUDITED) {
                revert InvalidStatusTransition(a.status, Status.RESOLVED);
            }
            if (block.timestamp <= a.verdictedAt + a.challengePeriod) {
                revert ChallengeWindowStillOpen();
            }
            // finalOutcome is ignored on this path — the judge's call stands.
            _finalise(a, a.originalOutcome);
        } else if (a.status == Status.CHALLENGED) {
            // Only the enforcer (i.e. EscalationManager) may close a
            // challenged assertion, and it supplies the panel's call.
            if (!hasRole(ENFORCER_ROLE, msg.sender)) {
                revert InvalidStatusTransition(a.status, Status.RESOLVED);
            }
            if (
                finalOutcome == Outcome.PENDING ||
                finalOutcome == Outcome.ESCALATED
            ) revert OutcomeCannotBePending();
            _finalise(a, finalOutcome);
        } else {
            revert InvalidStatusTransition(a.status, Status.RESOLVED);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IAssertionRegistry
    function getAssertion(bytes32 id) external view returns (Assertion memory) {
        if (!_exists[id]) revert AssertionMissing(id);
        return _assertions[id];
    }

    /// @inheritdoc IAssertionRegistry
    function isResolved(bytes32 id) external view returns (bool) {
        if (!_exists[id]) return false;
        return _assertions[id].status == Status.RESOLVED;
    }

    function challengeBondOf(bytes32 id) external view returns (uint256) {
        return _challengeBond[id];
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────

    function _finalise(Assertion storage a, Outcome finalOutcome) internal {
        if (address(enforcer) == address(0)) revert EnforcerNotSet();

        a.status = Status.RESOLVED;
        a.outcome = finalOutcome;
        a.resolvedAt = uint64(block.timestamp);

        _settleBonds(a, finalOutcome);

        emit AssertionResolved(a.id, finalOutcome, Status.RESOLVED);

        // Fire the application callback for every outcome, including
        // INVALID. Applications need the signal to unlock their own
        // state machines (e.g. Escrow flips back out of DISPUTED, the
        // insurance policy re-opens for a fresh claim). They are
        // responsible for ignoring INVALID where that's the right call.
        enforcer.dispatch(
            a.id,
            a.callback,
            a.callbackSelector,
            finalOutcome,
            a.reasoningRoot
        );
    }

    function _settleBonds(Assertion storage a, Outcome finalOutcome) internal {
        uint256 asserterBond = a.bond;
        uint256 challengerBond = _challengeBond[a.id];
        delete _challengeBond[a.id];

        if (a.challenger == address(0)) {
            // No challenge.
            if (asserterBond == 0) return;
            if (finalOutcome == Outcome.INVALID) {
                _safeSendValue(a.id, feeSink, asserterBond, "invalid_forfeit");
            } else {
                _safeSendValue(a.id, a.asserter, asserterBond, "asserter_refund");
            }
            return;
        }

        // With a challenge present:
        //   INVALID — panel could not decide; neither side loses. Refund
        //             both participants so the dispute is a net zero.
        //   else    — compare to the original judge call. If the panel
        //             flipped it, the challenger wins both bonds; if the
        //             panel upheld it, the asserter wins both.
        if (finalOutcome == Outcome.INVALID) {
            _safeSendValue(a.id, a.asserter, asserterBond, "invalid_refund_asserter");
            _safeSendValue(a.id, a.challenger, challengerBond, "invalid_refund_challenger");
            return;
        }

        bool challengerWon = finalOutcome != a.originalOutcome;
        uint256 payout = asserterBond + challengerBond;
        if (challengerWon) {
            _safeSendValue(a.id, a.challenger, payout, "challenger_won");
        } else {
            _safeSendValue(a.id, a.asserter, payout, "challenger_lost");
        }
    }

    function _safeSendValue(
        bytes32 id,
        address to,
        uint256 amount,
        string memory reason
    ) internal {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit BondSettled(id, to, amount, reason);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Introspection
    // ─────────────────────────────────────────────────────────────────────

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControl) returns (bool) {
        return
            interfaceId == type(IAssertionRegistry).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    receive() external payable {}
}
