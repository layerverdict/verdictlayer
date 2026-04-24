// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IERC7857Metadata
/// @notice Metadata extension for ERC-7857. Exposes collection-level
///         identity plus a way to refresh an agent's data hashes.
interface IERC7857Metadata {
    /// @dev Emitted whenever a token's data hashes are rewritten via update().
    event Updated(
        uint256 indexed _tokenId,
        bytes32[] _oldDataHashes,
        bytes32[] _newDataHashes
    );

    /// @notice Collection name.
    function name() external view returns (string memory);

    /// @notice Collection symbol.
    function symbol() external view returns (string memory);

    /// @notice JSON blob describing the chain + indexer the data lives on.
    function tokenURI(uint256 _tokenId) external view returns (string memory);

    /// @notice Replace a token's data hashes after proving knowledge of the
    ///         new preimages.
    function update(uint256 _tokenId, bytes[] calldata _proofs) external;

    /// @notice Current data hashes for a token.
    function dataHashesOf(
        uint256 _tokenId
    ) external view returns (bytes32[] memory);

    /// @notice Current data descriptions for a token.
    function dataDescriptionsOf(
        uint256 _tokenId
    ) external view returns (string[] memory);
}
