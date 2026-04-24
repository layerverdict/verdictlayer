// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Output of a preimage verification.
///         Used by mint() and update() to prove knowledge of the data behind
///         a claimed hash.
struct PreimageProofOutput {
    bytes32 dataHash;
    bool isValid;
}

/// @notice Output of a transfer-validity verification.
///         Used by transfer(), transferFrom(), and clone()/cloneFrom() to
///         prove that the data has been re-encrypted for the new owner
///         without revealing plaintext on-chain.
struct TransferValidityProofOutput {
    bytes32 oldDataHash;
    bytes32 newDataHash;
    address receiver;
    bytes16 sealedKey;
    bool isValid;
}

/// @title IERC7857DataVerifier
/// @notice On-chain verifier for ERC-7857 proofs. Implementations choose
///         between TEE attestation and ZKP proof systems.
///
/// Proof byte layout (TEE/ZKP parametric, as defined by the 0G reference
/// implementation):
///   bit 0         : 0 = TEE, 1 = ZKP
///   bit 1         : 0 = public data, 1 = private data
///   bits 2-7      : reserved
///   bytes 1-65    : accessibility proof (ECDSA signature, 65 bytes)
///   bytes 66-113  : nonce (replay protection, 48 bytes)
///   bytes 114-145 : newDataHash
///   bytes 146-177 : oldDataHash (private only)
///   bytes 178-189 : sealedKey (private only, 12 bytes)
///   bytes 190+    : oracle-specific payload (private only)
interface IERC7857DataVerifier {
    /// @notice Verify that the caller knows the preimage of the claimed data hashes.
    /// @param _proofs One proof per data slot. For public data a proof is the
    ///        raw 32-byte hash; for private data a proof is the full byte layout
    ///        described above.
    /// @return Per-proof verification outputs.
    function verifyPreimage(
        bytes[] calldata _proofs
    ) external returns (PreimageProofOutput[] memory);

    /// @notice Verify that a data transfer is valid: the new ciphertext comes
    ///         from re-encrypting the old plaintext for the receiver, the
    ///         sealed key is encrypted with the receiver's pubkey, and the
    ///         receiver signed over (oldHash, newHash) to acknowledge storage.
    /// @param _proofs One proof per data slot, encoded per the layout above.
    /// @return Per-proof verification outputs.
    function verifyTransferValidity(
        bytes[] calldata _proofs
    ) external returns (TransferValidityProofOutput[] memory);
}
