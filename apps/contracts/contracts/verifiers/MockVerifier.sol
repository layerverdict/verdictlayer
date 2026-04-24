// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {
    IERC7857DataVerifier,
    PreimageProofOutput,
    TransferValidityProofOutput
} from "../interfaces/IERC7857DataVerifier.sol";

/// @title MockVerifier
/// @notice Test-only verifier that bypasses signature / attestation logic.
///         Used to exercise the NFT + reputation layer in isolation from
///         the cryptographic plumbing (which has its own dedicated tests).
///
///         Proof shapes accepted:
///           preimage:  abi.encode(bytes32 dataHash, bool isValid)
///           transfer:  abi.encode(
///                        bytes32 oldDataHash,
///                        bytes32 newDataHash,
///                        address receiver,
///                        bytes16 sealedKey,
///                        bool    isValid
///                      )
///
///         DO NOT DEPLOY. The contract revert-guards itself against mainnet
///         chain IDs at deploy time so nobody catches it in prod by accident.
contract MockVerifier is IERC7857DataVerifier {
    error MainnetDeploymentForbidden(uint256 chainId);

    uint256 internal constant OG_MAINNET_CHAIN_ID = 16661;
    uint256 internal constant ETHEREUM_MAINNET_CHAIN_ID = 1;

    constructor() {
        if (
            block.chainid == OG_MAINNET_CHAIN_ID ||
            block.chainid == ETHEREUM_MAINNET_CHAIN_ID
        ) {
            revert MainnetDeploymentForbidden(block.chainid);
        }
    }

    function verifyPreimage(
        bytes[] calldata proofs
    ) external pure returns (PreimageProofOutput[] memory) {
        PreimageProofOutput[] memory outputs = new PreimageProofOutput[](proofs.length);
        for (uint256 i = 0; i < proofs.length; i++) {
            (bytes32 dataHash, bool isValid) = abi.decode(proofs[i], (bytes32, bool));
            outputs[i] = PreimageProofOutput({dataHash: dataHash, isValid: isValid});
        }
        return outputs;
    }

    function verifyTransferValidity(
        bytes[] calldata proofs
    ) external pure returns (TransferValidityProofOutput[] memory) {
        TransferValidityProofOutput[] memory outputs = new TransferValidityProofOutput[](
            proofs.length
        );
        for (uint256 i = 0; i < proofs.length; i++) {
            (
                bytes32 oldDataHash,
                bytes32 newDataHash,
                address receiver,
                bytes16 sealedKey,
                bool isValid
            ) = abi.decode(proofs[i], (bytes32, bytes32, address, bytes16, bool));

            outputs[i] = TransferValidityProofOutput({
                oldDataHash: oldDataHash,
                newDataHash: newDataHash,
                receiver: receiver,
                sealedKey: sealedKey,
                isValid: isValid
            });
        }
        return outputs;
    }
}
