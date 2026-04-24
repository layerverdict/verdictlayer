// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC7857DataVerifier} from "../../interfaces/IERC7857DataVerifier.sol";

/// @title BaseVerifier
/// @notice Shared replay-protection substrate for ERC-7857 verifiers.
///         Each proof carries a nonce; marking a nonce as used prevents the
///         same proof from being replayed against a second token.
abstract contract BaseVerifier is IERC7857DataVerifier {
    mapping(bytes32 proofNonce => bool used) internal _usedProofs;

    event ProofMarked(bytes32 indexed proofNonce);

    error ProofAlreadyUsed(bytes32 proofNonce);

    /// @notice Read-only helper so off-chain code can check whether a nonce
    ///         has already been consumed.
    function isProofUsed(bytes32 proofNonce) external view returns (bool) {
        return _usedProofs[proofNonce];
    }

    function _checkAndMarkProof(bytes32 proofNonce) internal {
        if (_usedProofs[proofNonce]) revert ProofAlreadyUsed(proofNonce);
        _usedProofs[proofNonce] = true;
        emit ProofMarked(proofNonce);
    }
}
