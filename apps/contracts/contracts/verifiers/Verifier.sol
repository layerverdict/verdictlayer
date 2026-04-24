// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {BaseVerifier} from "./base/BaseVerifier.sol";
import {
    IERC7857DataVerifier,
    PreimageProofOutput,
    TransferValidityProofOutput
} from "../interfaces/IERC7857DataVerifier.sol";

/// @notice Which oracle family a Verifier instance accepts.
enum VerifierType {
    TEE,
    ZKP
}

/// @title Verifier
/// @notice Parametric ERC-7857 verifier that consumes TEE attestations or
///         ZKP-style accessibility signatures. Ports the 0G reference
///         implementation (github.com/0gfoundation/0g-agent-nft, branch
///         eip-7857-draft) to Solidity 0.8.24 with custom errors and named
///         parameters.
///
///         Proof byte layout:
///           byte 0         : indicator (bit 7 = oracle type, bit 6 = private)
///           bytes 1..65    : accessibility proof (65-byte ECDSA sig, r||s||v)
///           bytes 66..113  : nonce (48 bytes)
///           bytes 114..145 : newDataHash (32 bytes)
///           bytes 146..177 : oldDataHash (32 bytes, private only)
///           bytes 178..193 : sealedKey (16 bytes, private only)
///           bytes 194+     : oracle payload (private only)
///
///         v1 wires the accessibility signature check (derives the receiver
///         from the signed (newHash[, oldHash], nonce) EIP-191 message) and
///         defers deep TEE/ZKP attestation verification to an attestation
///         contract that can be swapped in without redeploying the NFT.
contract Verifier is BaseVerifier {
    uint8 internal constant PROOF_BIT_ORACLE_TYPE = 0x80;
    uint8 internal constant PROOF_BIT_PRIVATE = 0x40;

    uint256 internal constant PROOF_LEN_PUBLIC = 146;
    uint256 internal constant PROOF_LEN_PRIVATE_MIN = 194;

    uint256 internal constant OFFSET_ACCESSIBILITY = 1;
    uint256 internal constant OFFSET_NONCE = 66;
    uint256 internal constant OFFSET_NEW_HASH = 114;
    uint256 internal constant OFFSET_OLD_HASH = 146;
    uint256 internal constant OFFSET_SEALED_KEY = 178;

    uint256 internal constant LEN_ACCESSIBILITY = 65;
    uint256 internal constant LEN_NONCE = 48;
    uint256 internal constant LEN_HASH = 32;
    uint256 internal constant LEN_SEALED_KEY = 16;

    address public immutable attestationContract;
    VerifierType public immutable verifierType;

    error InvalidProofLength(uint256 given);
    error InvalidAccessibilityProofLength(uint256 given);
    error OracleTypeMismatch(VerifierType expected, bool gotTEE);
    error InvalidDataHashLength(uint256 given);

    event VerifierDeployed(address indexed attestationContract, VerifierType indexed verifierType);

    constructor(address _attestationContract, VerifierType _verifierType) {
        // attestationContract may legitimately be the zero address: the v1
        // verifier intentionally defers deep TEE / ZKP attestation check to
        // a drop-in replacement contract (swapped in via
        // ReputationRegistry.updateVerifier). Zero here means "signature
        // check only" and is the expected default on first deploy.
        attestationContract = _attestationContract;
        verifierType = _verifierType;
        emit VerifierDeployed(_attestationContract, _verifierType);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Preimage — mint() and update()
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IERC7857DataVerifier
    function verifyPreimage(
        bytes[] calldata proofs
    ) external pure override returns (PreimageProofOutput[] memory) {
        PreimageProofOutput[] memory outputs = new PreimageProofOutput[](proofs.length);
        for (uint256 i = 0; i < proofs.length; i++) {
            if (proofs[i].length != LEN_HASH) revert InvalidDataHashLength(proofs[i].length);
            outputs[i] = PreimageProofOutput({dataHash: bytes32(proofs[i]), isValid: true});
        }
        return outputs;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Transfer validity — transfer(), transferFrom(), clone(), cloneFrom()
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IERC7857DataVerifier
    function verifyTransferValidity(
        bytes[] calldata proofs
    ) external override returns (TransferValidityProofOutput[] memory) {
        TransferValidityProofOutput[] memory outputs = new TransferValidityProofOutput[](
            proofs.length
        );

        for (uint256 i = 0; i < proofs.length; i++) {
            outputs[i] = _processTransferProof(proofs[i]);

            bytes32 proofNonce = keccak256(
                proofs[i][OFFSET_NONCE:OFFSET_NONCE + LEN_NONCE]
            );
            _checkAndMarkProof(proofNonce);
        }

        return outputs;
    }

    function _processTransferProof(
        bytes calldata proof
    ) internal view returns (TransferValidityProofOutput memory output) {
        if (proof.length < PROOF_LEN_PUBLIC) revert InvalidProofLength(proof.length);

        bool isTEE = (uint8(proof[0]) & PROOF_BIT_ORACLE_TYPE) == 0;
        bool isPrivate = (uint8(proof[0]) & PROOF_BIT_PRIVATE) != 0;

        if (isTEE != (verifierType == VerifierType.TEE)) {
            revert OracleTypeMismatch(verifierType, isTEE);
        }

        if (isPrivate && proof.length < PROOF_LEN_PRIVATE_MIN) {
            revert InvalidProofLength(proof.length);
        }

        bytes calldata accessibility = proof[OFFSET_ACCESSIBILITY:OFFSET_NONCE];
        bytes calldata nonce = proof[OFFSET_NONCE:OFFSET_NEW_HASH];

        output.newDataHash = bytes32(proof[OFFSET_NEW_HASH:OFFSET_NEW_HASH + LEN_HASH]);

        if (isPrivate) {
            output.oldDataHash = bytes32(proof[OFFSET_OLD_HASH:OFFSET_OLD_HASH + LEN_HASH]);
            output.sealedKey = bytes16(
                proof[OFFSET_SEALED_KEY:OFFSET_SEALED_KEY + LEN_SEALED_KEY]
            );
        }

        output.receiver = _recoverAccessibilitySigner(
            accessibility,
            isPrivate,
            nonce,
            output.newDataHash,
            output.oldDataHash
        );

        // v1 accepts any signature-bound proof with a recovered receiver.
        // The deeper TEE/ZKP attestation check is intentionally delegated
        // to updateVerifier() — integrators can swap in a Verifier that
        // cross-checks `attestationContract` once the on-chain attestation
        // format is finalised.
        output.isValid = output.receiver != address(0);
    }

    // ─────────────────────────────────────────────────────────────────────
    // EIP-191 accessibility signature
    // ─────────────────────────────────────────────────────────────────────

    function _recoverAccessibilitySigner(
        bytes calldata accessibilityProof,
        bool isPrivate,
        bytes calldata nonce,
        bytes32 newDataHash,
        bytes32 oldDataHash
    ) internal pure returns (address) {
        if (accessibilityProof.length != LEN_ACCESSIBILITY) {
            revert InvalidAccessibilityProofLength(accessibilityProof.length);
        }

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(accessibilityProof.offset)
            s := calldataload(add(accessibilityProof.offset, 32))
            v := byte(0, calldataload(add(accessibilityProof.offset, 64)))
        }

        bytes32 message = _createMessageHash(isPrivate, newDataHash, oldDataHash, nonce);
        return ecrecover(message, v, r, s);
    }

    function _createMessageHash(
        bool isPrivate,
        bytes32 newDataHash,
        bytes32 oldDataHash,
        bytes calldata nonce
    ) internal pure returns (bytes32) {
        bytes32 inner;
        if (isPrivate) {
            inner = keccak256(abi.encodePacked(newDataHash, oldDataHash, nonce));
        } else {
            inner = keccak256(abi.encodePacked(newDataHash, nonce));
        }
        string memory asHex = Strings.toHexString(uint256(inner), 32);
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n66", asHex));
    }
}
