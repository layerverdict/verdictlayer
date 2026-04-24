// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {VerdictConsumer} from "./base/VerdictConsumer.sol";
import {IAssertionRegistry} from "../interfaces/IAssertionRegistry.sol";
import {IVerdictCallback} from "../interfaces/IVerdictCallback.sol";

/// @title ParametricInsurance
/// @notice Native-token parametric insurance powered by Verdict.
///
///         A user buys a policy by paying a premium up-front. The policy
///         declares a parametric condition as a free-form `condition` string
///         plus an `evidenceSpec` hash (e.g. "AA123 delay >= 120m — verified
///         against AviationStack at t0"). On claim, the contract opens an
///         INSTANT Verdict assertion; if the judge returns TRUE the payout
///         fires inside the same transaction the enforcer callback runs.
///
///         The payout amount is pre-funded by the policy creator (insurer)
///         so the contract is always fully collateralised. When the policy
///         expires without a TRUE verdict, the insurer can `reclaim`.
contract ParametricInsurance is VerdictConsumer, ReentrancyGuard {
    enum PolicyStatus {
        NONE,
        ACTIVE,
        CLAIM_PENDING,
        PAID,
        EXPIRED
    }

    struct Policy {
        address insurer;
        address holder;
        uint256 premium;
        uint256 payout;
        uint64 coverageStart;
        uint64 coverageEnd;
        PolicyStatus status;
        string condition;
        bytes32 evidenceSpec;
        bytes32 claimEvidence;
        bytes32 assertionId;
    }

    uint256 public immutable assertionBond;
    uint256 private _nextPolicyId = 1;
    mapping(uint256 policyId => Policy) private _policies;

    error NotInsurer();
    error NotHolder();
    error InvalidStatus(PolicyStatus current);
    error InvalidCoverage();
    error ZeroAmount();
    error PremiumMismatch(uint256 expected, uint256 given);
    error BondMismatch(uint256 expected, uint256 given);
    error PayoutMismatch(uint256 expected, uint256 given);
    error EvidenceMissing();
    error NotInCoverage();
    error NotExpired();

    event PolicyCreated(
        uint256 indexed policyId,
        address indexed insurer,
        address indexed holder,
        uint256 premium,
        uint256 payout,
        uint64 coverageStart,
        uint64 coverageEnd,
        string condition
    );
    event ClaimOpened(
        uint256 indexed policyId,
        bytes32 indexed assertionId,
        bytes32 evidenceRoot
    );
    event ClaimPaid(uint256 indexed policyId, bytes32 indexed assertionId, uint256 amount);
    event ClaimRejected(uint256 indexed policyId, bytes32 indexed assertionId);
    event Expired(uint256 indexed policyId, uint256 refund);

    constructor(address registryAddr, address enforcerAddr, uint256 assertionBond_)
        VerdictConsumer(registryAddr, enforcerAddr)
    {
        assertionBond = assertionBond_;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Insurer / holder flow
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Underwrite a new policy. Insurer sends exactly `payout` as
    ///         native token to fully collateralise the contract.
    function underwrite(
        address holder,
        uint256 premium,
        uint256 payout,
        uint64 coverageStart,
        uint64 coverageEnd,
        string calldata condition,
        bytes32 evidenceSpec
    ) external payable returns (uint256 policyId) {
        if (holder == address(0)) revert ZeroAddress();
        if (payout == 0) revert ZeroAmount();
        if (coverageStart >= coverageEnd) revert InvalidCoverage();
        if (msg.value != payout) revert PayoutMismatch(payout, msg.value);

        policyId = _nextPolicyId++;
        _policies[policyId] = Policy({
            insurer: msg.sender,
            holder: holder,
            premium: premium,
            payout: payout,
            coverageStart: coverageStart,
            coverageEnd: coverageEnd,
            status: PolicyStatus.ACTIVE,
            condition: condition,
            evidenceSpec: evidenceSpec,
            claimEvidence: bytes32(0),
            assertionId: bytes32(0)
        });

        emit PolicyCreated(
            policyId,
            msg.sender,
            holder,
            premium,
            payout,
            coverageStart,
            coverageEnd,
            condition
        );
    }

    /// @notice Holder pays the premium to the insurer. Kept as a separate
    ///         step so policies can also be gifted / subsidised.
    function payPremium(uint256 policyId) external payable nonReentrant {
        Policy storage p = _policies[policyId];
        if (p.status != PolicyStatus.ACTIVE) revert InvalidStatus(p.status);
        if (msg.value != p.premium) revert PremiumMismatch(p.premium, msg.value);
        (bool ok, ) = p.insurer.call{value: msg.value}("");
        require(ok, "premium transfer failed");
    }

    /// @notice File a claim. Opens an INSTANT Verdict assertion. Holder must
    ///         send `assertionBond` as native token.
    function claim(
        uint256 policyId,
        bytes32 evidenceRoot
    ) external payable nonReentrant returns (bytes32 assertionId) {
        Policy storage p = _policies[policyId];
        if (msg.sender != p.holder) revert NotHolder();
        if (p.status != PolicyStatus.ACTIVE) revert InvalidStatus(p.status);
        if (block.timestamp < p.coverageStart || block.timestamp > p.coverageEnd) {
            revert NotInCoverage();
        }
        if (evidenceRoot == bytes32(0)) revert EvidenceMissing();
        if (msg.value != assertionBond) revert BondMismatch(assertionBond, msg.value);

        p.status = PolicyStatus.CLAIM_PENDING;
        p.claimEvidence = evidenceRoot;

        bytes32[] memory roots = new bytes32[](p.evidenceSpec == bytes32(0) ? 1 : 2);
        roots[0] = evidenceRoot;
        if (p.evidenceSpec != bytes32(0)) roots[1] = p.evidenceSpec;

        IAssertionRegistry.AssertionInput memory input = IAssertionRegistry.AssertionInput({
            claim: _claimString(p, policyId),
            evidenceRoots: roots,
            callback: address(this),
            callbackSelector: this.onVerdict.selector,
            mode: Mode.INSTANT,
            challengePeriod: 0,
            bond: assertionBond,
            salt: keccak256(abi.encode("insurance", policyId, block.timestamp))
        });

        assertionId = _createAssertion(input, policyId);
        p.assertionId = assertionId;

        emit ClaimOpened(policyId, assertionId, evidenceRoot);
    }

    /// @notice After the coverage window closes without a TRUE claim, the
    ///         insurer may reclaim the posted collateral.
    function reclaim(uint256 policyId) external nonReentrant {
        Policy storage p = _policies[policyId];
        if (msg.sender != p.insurer) revert NotInsurer();
        if (p.status != PolicyStatus.ACTIVE) revert InvalidStatus(p.status);
        if (block.timestamp <= p.coverageEnd) revert NotExpired();

        p.status = PolicyStatus.EXPIRED;
        uint256 amount = p.payout;
        (bool ok, ) = p.insurer.call{value: amount}("");
        require(ok, "reclaim failed");

        emit Expired(policyId, amount);
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
        uint256 policyId = _assertionToLocal[assertionId];
        if (policyId == 0) revert UnknownAssertion(assertionId);
        Policy storage p = _policies[policyId];
        if (p.status != PolicyStatus.CLAIM_PENDING) return;

        if (outcome == Outcome.TRUE) {
            p.status = PolicyStatus.PAID;
            uint256 amount = p.payout;
            (bool ok, ) = p.holder.call{value: amount}("");
            require(ok, "payout failed");
            emit ClaimPaid(policyId, assertionId, amount);
        } else if (outcome == Outcome.FALSE) {
            // Claim denied: policy returns to ACTIVE so holder can refile on
            // subsequent events within the coverage window.
            p.status = PolicyStatus.ACTIVE;
            emit ClaimRejected(policyId, assertionId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        return _policies[policyId];
    }

    function totalPolicies() external view returns (uint256) {
        return _nextPolicyId - 1;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────

    function _claimString(Policy storage p, uint256 policyId)
        internal
        view
        returns (string memory)
    {
        return
            string(
                abi.encodePacked(
                    "policy#",
                    _toString(policyId),
                    " condition: ",
                    p.condition
                )
            );
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 digits;
        uint256 tmp = v;
        while (tmp != 0) { digits++; tmp /= 10; }
        bytes memory out = new bytes(digits);
        while (v != 0) {
            digits--;
            out[digits] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(out);
    }
}
