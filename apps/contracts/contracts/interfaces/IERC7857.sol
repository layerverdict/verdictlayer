// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC7857DataVerifier} from "./IERC7857DataVerifier.sol";

/// @title IERC7857 — AI Agents NFT with Private Metadata
/// @notice Standalone NFT standard for AI agents whose metadata must be
///         re-encrypted on transfer. Transfers and clones take a
///         verifier-issued proof rather than a simple approval.
interface IERC7857 {
    /// @dev Emitted when a new agent NFT is minted.
    event Minted(
        uint256 indexed _tokenId,
        address indexed _creator,
        address indexed _owner,
        bytes32[] _dataHashes,
        string[] _dataDescriptions
    );

    /// @dev Emitted when an address is authorised to use a token's data.
    event Authorization(
        address indexed _from,
        address indexed _to,
        uint256 indexed _tokenId
    );

    /// @dev Emitted when a token is transferred to a new owner with
    ///      re-encrypted data.
    event Transferred(uint256 _tokenId, address indexed _from, address indexed _to);

    /// @dev Emitted when a token is cloned to a new owner (source retained).
    event Cloned(
        uint256 indexed _tokenId,
        uint256 indexed _newTokenId,
        address _from,
        address _to
    );

    /// @dev Emitted after a transfer/clone when the sealed data keys are
    ///      published so the receiver can decrypt.
    event PublishedSealedKey(
        address indexed _to,
        uint256 indexed _tokenId,
        bytes16[] _sealedKeys
    );

    /// @notice The verifier this NFT routes proofs through.
    function verifier() external view returns (IERC7857DataVerifier);

    /// @notice Mint a new agent NFT backed by preimage proofs.
    /// @param _proofs One proof per data slot.
    /// @param _dataDescriptions Human-readable description per data slot.
    /// @param _to Target owner; if zero the caller mints to themselves.
    /// @return _tokenId The new token id.
    function mint(
        bytes[] calldata _proofs,
        string[] calldata _dataDescriptions,
        address _to
    ) external payable returns (uint256 _tokenId);

    /// @notice Transfer a token, re-encrypting its metadata for the receiver.
    function transfer(
        address _to,
        uint256 _tokenId,
        bytes[] calldata _proofs
    ) external;

    /// @notice Clone a token (source remains with the sender, receiver gets
    ///         a new tokenId bound to re-encrypted data).
    function clone(
        address _to,
        uint256 _tokenId,
        bytes[] calldata _proofs
    ) external returns (uint256 _newTokenId);

    /// @notice Authorise an address to use a token's data without transferring
    ///         ownership.
    function authorizeUsage(uint256 _tokenId, address _user) external;

    /// @notice Current owner of a token.
    function ownerOf(uint256 _tokenId) external view returns (address);

    /// @notice Addresses currently authorised to use a token.
    function authorizedUsersOf(
        uint256 _tokenId
    ) external view returns (address[] memory);
}
