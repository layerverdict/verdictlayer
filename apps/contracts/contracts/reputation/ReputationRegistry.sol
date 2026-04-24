// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IERC7857} from "../interfaces/IERC7857.sol";
import {IERC7857Metadata} from "../interfaces/IERC7857Metadata.sol";
import {
    IERC7857DataVerifier,
    PreimageProofOutput,
    TransferValidityProofOutput
} from "../interfaces/IERC7857DataVerifier.sol";

/// @title ReputationRegistry
/// @notice ERC-7857 compliant registry for Verdict's judge agent NFTs.
///
///         On top of the standard AI-agent NFT (encrypted metadata with
///         TEE/ZKP-verified transfers) each token carries an on-chain
///         reputation ledger:
///
///           reputation    — running score, starts at `INITIAL_REPUTATION`
///           totalVerdicts — count of verdicts the agent has signed
///           appealsLost   — count of those verdicts overturned on appeal
///
///         Reputation is mutated only by addresses holding
///         `VERDICT_WRITER_ROLE`, which AssertionRegistry and
///         EscalationManager will be granted in the deploy script.
///
/// @dev Non-upgradeable; port of the 0G Foundation AgentNFT reference
///      (github.com/0gfoundation/0g-agent-nft, branch eip-7857-draft) with
///      the upgradeable storage-slot machinery removed and the reputation
///      layer added.
contract ReputationRegistry is
    AccessControlEnumerable,
    ReentrancyGuard,
    IERC7857,
    IERC7857Metadata
{
    // ─────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────

    struct TokenData {
        address owner;
        string[] dataDescriptions;
        bytes32[] dataHashes;
        address[] authorizedUsers;
        address approvedUser;
    }

    struct ReputationData {
        uint64 totalVerdicts;
        uint64 appealsLost;
        int256 reputation;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────────────────

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Role granted to protocol contracts that settle verdicts and
    ///         therefore may update an agent's reputation.
    bytes32 public constant VERDICT_WRITER_ROLE = keccak256("VERDICT_WRITER_ROLE");

    // ─────────────────────────────────────────────────────────────────────
    // Reputation tuning
    // ─────────────────────────────────────────────────────────────────────

    int256 public constant INITIAL_REPUTATION = 1000;
    int256 public constant REPUTATION_REWARD = 1;
    int256 public constant REPUTATION_PENALTY_MINORITY = 2;
    int256 public constant REPUTATION_PENALTY_APPEAL_LOST = 10;

    // ─────────────────────────────────────────────────────────────────────
    // Storage — standard ERC-7857 state + reputation
    // ─────────────────────────────────────────────────────────────────────

    mapping(uint256 tokenId => TokenData) private _tokens;
    mapping(address owner => mapping(address operator => bool)) private _operatorApprovals;
    mapping(uint256 tokenId => ReputationData) private _reputation;

    uint256 private _nextTokenId;

    string private _name;
    string private _symbol;
    string private _chainURL;
    string private _indexerURL;

    IERC7857DataVerifier private _verifier;

    // ─────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────

    event Approval(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId
    );
    event ApprovalForAll(
        address indexed owner,
        address indexed operator,
        bool approved
    );

    event VerifierUpdated(address indexed previous, address indexed current);
    event URLsUpdated(string chainURL, string indexerURL);

    event ReputationInitialized(uint256 indexed tokenId, int256 reputation);
    event VerdictRecorded(
        uint256 indexed tokenId,
        bool agreedWithMajority,
        int256 delta,
        int256 newReputation
    );
    event AppealLostRecorded(
        uint256 indexed tokenId,
        int256 delta,
        int256 newReputation
    );

    // ─────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error NotOwner();
    error NotApproved();
    error TokenDoesNotExist(uint256 tokenId);
    error ProofsDescriptionsLengthMismatch(uint256 proofsLength, uint256 descriptionsLength);
    error InvalidPreimageProof(uint256 index, bytes32 dataHash);
    error InvalidTransferValidityProof(uint256 index);
    error ReceiverMismatch(uint256 index, address expected, address actual);
    error OldDataHashMismatch(uint256 index, bytes32 expected, bytes32 actual);
    error NewDataHashMismatch(uint256 index, bytes32 expected, bytes32 actual);
    error MintFeeNotAccepted();

    // ─────────────────────────────────────────────────────────────────────
    // Construction
    // ─────────────────────────────────────────────────────────────────────

    constructor(
        string memory name_,
        string memory symbol_,
        address verifierAddress,
        string memory chainURL_,
        string memory indexerURL_,
        address admin
    ) {
        if (verifierAddress == address(0)) revert ZeroAddress();
        if (admin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        _name = name_;
        _symbol = symbol_;
        _chainURL = chainURL_;
        _indexerURL = indexerURL_;
        _verifier = IERC7857DataVerifier(verifierAddress);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────

    function updateVerifier(address newVerifier) external onlyRole(ADMIN_ROLE) {
        if (newVerifier == address(0)) revert ZeroAddress();
        address previous = address(_verifier);
        _verifier = IERC7857DataVerifier(newVerifier);
        emit VerifierUpdated(previous, newVerifier);
    }

    function updateURLs(
        string calldata newChainURL,
        string calldata newIndexerURL
    ) external onlyRole(ADMIN_ROLE) {
        _chainURL = newChainURL;
        _indexerURL = newIndexerURL;
        emit URLsUpdated(newChainURL, newIndexerURL);
    }

    // ─────────────────────────────────────────────────────────────────────
    // IERC7857 — core
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IERC7857
    function verifier() external view returns (IERC7857DataVerifier) {
        return _verifier;
    }

    /// @inheritdoc IERC7857
    function mint(
        bytes[] calldata proofs,
        string[] calldata dataDescriptions,
        address to
    ) external payable nonReentrant returns (uint256 tokenId) {
        // Interface is payable for forward-compat with fee-charging
        // implementations, but v1 does not levy a mint fee. Refuse
        // non-zero values outright so no ether can get locked.
        if (msg.value != 0) revert MintFeeNotAccepted();
        if (dataDescriptions.length != proofs.length) {
            revert ProofsDescriptionsLengthMismatch(proofs.length, dataDescriptions.length);
        }

        address recipient = to == address(0) ? msg.sender : to;

        PreimageProofOutput[] memory outputs = _verifier.verifyPreimage(proofs);
        bytes32[] memory dataHashes = new bytes32[](outputs.length);
        for (uint256 i = 0; i < outputs.length; i++) {
            if (!outputs[i].isValid) {
                revert InvalidPreimageProof(i, outputs[i].dataHash);
            }
            dataHashes[i] = outputs[i].dataHash;
        }

        tokenId = _nextTokenId++;
        _tokens[tokenId] = TokenData({
            owner: recipient,
            dataHashes: dataHashes,
            dataDescriptions: dataDescriptions,
            authorizedUsers: new address[](0),
            approvedUser: address(0)
        });

        _reputation[tokenId] = ReputationData({
            totalVerdicts: 0,
            appealsLost: 0,
            reputation: INITIAL_REPUTATION
        });

        emit Minted(tokenId, msg.sender, recipient, dataHashes, dataDescriptions);
        emit ReputationInitialized(tokenId, INITIAL_REPUTATION);
    }

    /// @inheritdoc IERC7857
    function transfer(
        address to,
        uint256 tokenId,
        bytes[] calldata proofs
    ) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        TokenData storage token = _tokens[tokenId];
        if (token.owner != msg.sender) revert NotOwner();

        _applyTransferProofs(token, tokenId, to, proofs, /* checkOldHash */ true);
    }

    /// @notice ERC-721 style `transferFrom` with a proof bundle — allows
    ///         approved operators to move the token on behalf of the owner.
    function transferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes[] calldata proofs
    ) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        TokenData storage token = _tokens[tokenId];
        if (token.owner != from) revert NotOwner();
        if (
            token.approvedUser != msg.sender &&
            token.owner != msg.sender &&
            !_operatorApprovals[from][msg.sender]
        ) {
            revert NotApproved();
        }

        _applyTransferProofs(token, tokenId, to, proofs, /* checkOldHash */ false);
    }

    /// @inheritdoc IERC7857
    function clone(
        address to,
        uint256 tokenId,
        bytes[] calldata proofs
    ) external nonReentrant returns (uint256 newTokenId) {
        if (to == address(0)) revert ZeroAddress();
        TokenData storage source = _tokens[tokenId];
        if (source.owner != msg.sender) revert NotOwner();

        newTokenId = _applyCloneProofs(source, tokenId, to, proofs);
    }

    /// @notice Operator-mediated clone. Mirrors `cloneFrom` in the reference
    ///         implementation.
    function cloneFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes[] calldata proofs
    ) external nonReentrant returns (uint256 newTokenId) {
        if (to == address(0)) revert ZeroAddress();
        TokenData storage source = _tokens[tokenId];
        if (source.owner != from) revert NotOwner();
        if (
            source.approvedUser != msg.sender &&
            source.owner != msg.sender &&
            !_operatorApprovals[from][msg.sender]
        ) {
            revert NotApproved();
        }

        newTokenId = _applyCloneProofs(source, tokenId, to, proofs);
    }

    /// @inheritdoc IERC7857
    function authorizeUsage(uint256 tokenId, address to) external {
        TokenData storage token = _tokens[tokenId];
        if (token.owner != msg.sender) revert NotOwner();
        token.authorizedUsers.push(to);
        emit Authorization(msg.sender, to, tokenId);
    }

    /// @inheritdoc IERC7857
    function ownerOf(uint256 tokenId) external view returns (address) {
        TokenData storage token = _tokens[tokenId];
        if (token.owner == address(0)) revert TokenDoesNotExist(tokenId);
        return token.owner;
    }

    /// @inheritdoc IERC7857
    function authorizedUsersOf(
        uint256 tokenId
    ) external view returns (address[] memory) {
        TokenData storage token = _tokens[tokenId];
        if (token.owner == address(0)) revert TokenDoesNotExist(tokenId);
        return token.authorizedUsers;
    }

    // ─────────────────────────────────────────────────────────────────────
    // IERC7857 — ERC-721-style approvals
    // ─────────────────────────────────────────────────────────────────────

    function approve(address to, uint256 tokenId) external {
        TokenData storage token = _tokens[tokenId];
        if (token.owner != msg.sender) revert NotOwner();
        token.approvedUser = to;
        emit Approval(msg.sender, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        return _tokens[tokenId].approvedUser;
    }

    function isApprovedForAll(
        address owner,
        address operator
    ) external view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    // ─────────────────────────────────────────────────────────────────────
    // IERC7857Metadata
    // ─────────────────────────────────────────────────────────────────────

    /// @inheritdoc IERC7857Metadata
    function name() external view returns (string memory) {
        return _name;
    }

    /// @inheritdoc IERC7857Metadata
    function symbol() external view returns (string memory) {
        return _symbol;
    }

    /// @inheritdoc IERC7857Metadata
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_tokens[tokenId].owner == address(0)) revert TokenDoesNotExist(tokenId);
        return
            string(
                abi.encodePacked(
                    '{"chainURL":"',
                    _chainURL,
                    '","indexerURL":"',
                    _indexerURL,
                    '"}'
                )
            );
    }

    /// @inheritdoc IERC7857Metadata
    function update(uint256 tokenId, bytes[] calldata proofs) external nonReentrant {
        TokenData storage token = _tokens[tokenId];
        if (token.owner != msg.sender) revert NotOwner();

        PreimageProofOutput[] memory outputs = _verifier.verifyPreimage(proofs);
        bytes32[] memory newHashes = new bytes32[](outputs.length);
        for (uint256 i = 0; i < outputs.length; i++) {
            if (!outputs[i].isValid) {
                revert InvalidPreimageProof(i, outputs[i].dataHash);
            }
            newHashes[i] = outputs[i].dataHash;
        }

        bytes32[] memory oldHashes = token.dataHashes;
        token.dataHashes = newHashes;

        emit Updated(tokenId, oldHashes, newHashes);
    }

    /// @inheritdoc IERC7857Metadata
    function dataHashesOf(
        uint256 tokenId
    ) external view returns (bytes32[] memory) {
        TokenData storage token = _tokens[tokenId];
        if (token.owner == address(0)) revert TokenDoesNotExist(tokenId);
        return token.dataHashes;
    }

    /// @inheritdoc IERC7857Metadata
    function dataDescriptionsOf(
        uint256 tokenId
    ) external view returns (string[] memory) {
        TokenData storage token = _tokens[tokenId];
        if (token.owner == address(0)) revert TokenDoesNotExist(tokenId);
        return token.dataDescriptions;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Reputation layer
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Record that the agent signed a verdict.
    /// @param tokenId The judge agent NFT.
    /// @param agreedWithMajority True when the agent's call matched the
    ///        protocol's resolved outcome. False when it dissented and the
    ///        outcome went the other way.
    function recordVerdict(
        uint256 tokenId,
        bool agreedWithMajority
    ) external onlyRole(VERDICT_WRITER_ROLE) {
        ReputationData storage r = _reputation[tokenId];
        if (_tokens[tokenId].owner == address(0)) revert TokenDoesNotExist(tokenId);

        r.totalVerdicts += 1;
        int256 delta = agreedWithMajority
            ? REPUTATION_REWARD
            : -REPUTATION_PENALTY_MINORITY;
        r.reputation += delta;

        emit VerdictRecorded(tokenId, agreedWithMajority, delta, r.reputation);
    }

    /// @notice Record that an appeal against this agent's verdict succeeded,
    ///         i.e. the agent was wrong and the majority overruled it.
    function recordAppealLost(
        uint256 tokenId
    ) external onlyRole(VERDICT_WRITER_ROLE) {
        ReputationData storage r = _reputation[tokenId];
        if (_tokens[tokenId].owner == address(0)) revert TokenDoesNotExist(tokenId);

        r.appealsLost += 1;
        int256 delta = -REPUTATION_PENALTY_APPEAL_LOST;
        r.reputation += delta;

        emit AppealLostRecorded(tokenId, delta, r.reputation);
    }

    /// @notice Read the reputation record for a token.
    function reputationOf(
        uint256 tokenId
    ) external view returns (ReputationData memory) {
        if (_tokens[tokenId].owner == address(0)) revert TokenDoesNotExist(tokenId);
        return _reputation[tokenId];
    }

    // ─────────────────────────────────────────────────────────────────────
    // Introspection
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Next token id that will be minted. Useful for off-chain
    ///         indexing.
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlEnumerable) returns (bool) {
        return
            interfaceId == type(IERC7857).interfaceId ||
            interfaceId == type(IERC7857Metadata).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal — shared transfer / clone plumbing
    // ─────────────────────────────────────────────────────────────────────

    function _applyTransferProofs(
        TokenData storage token,
        uint256 tokenId,
        address to,
        bytes[] calldata proofs,
        bool checkOldHash
    ) internal {
        TransferValidityProofOutput[] memory outputs = _verifier.verifyTransferValidity(proofs);
        bytes16[] memory sealedKeys = new bytes16[](outputs.length);
        bytes32[] memory newDataHashes = new bytes32[](outputs.length);

        for (uint256 i = 0; i < outputs.length; i++) {
            TransferValidityProofOutput memory o = outputs[i];
            if (!o.isValid) revert InvalidTransferValidityProof(i);

            if (checkOldHash) {
                bytes32 expectedOld = token.dataHashes[i];
                if (o.oldDataHash != expectedOld) {
                    revert OldDataHashMismatch(i, expectedOld, o.oldDataHash);
                }
            } else {
                bytes32 expectedNew = token.dataHashes[i];
                if (o.newDataHash != expectedNew) {
                    revert NewDataHashMismatch(i, expectedNew, o.newDataHash);
                }
            }

            if (o.receiver != to) {
                revert ReceiverMismatch(i, to, o.receiver);
            }

            sealedKeys[i] = o.sealedKey;
            newDataHashes[i] = o.newDataHash;
        }

        address previousOwner = token.owner;
        token.owner = to;
        token.dataHashes = newDataHashes;
        token.approvedUser = address(0);

        emit Transferred(tokenId, previousOwner, to);
        emit PublishedSealedKey(to, tokenId, sealedKeys);
    }

    function _applyCloneProofs(
        TokenData storage source,
        uint256 sourceTokenId,
        address to,
        bytes[] calldata proofs
    ) internal returns (uint256 newTokenId) {
        TransferValidityProofOutput[] memory outputs = _verifier.verifyTransferValidity(proofs);
        bytes16[] memory sealedKeys = new bytes16[](outputs.length);
        bytes32[] memory newDataHashes = new bytes32[](outputs.length);

        for (uint256 i = 0; i < outputs.length; i++) {
            TransferValidityProofOutput memory o = outputs[i];
            if (!o.isValid) revert InvalidTransferValidityProof(i);
            bytes32 expectedOld = source.dataHashes[i];
            if (o.oldDataHash != expectedOld) {
                revert OldDataHashMismatch(i, expectedOld, o.oldDataHash);
            }
            if (o.receiver != to) revert ReceiverMismatch(i, to, o.receiver);
            sealedKeys[i] = o.sealedKey;
            newDataHashes[i] = o.newDataHash;
        }

        newTokenId = _nextTokenId++;
        _tokens[newTokenId] = TokenData({
            owner: to,
            dataHashes: newDataHashes,
            dataDescriptions: source.dataDescriptions,
            authorizedUsers: new address[](0),
            approvedUser: address(0)
        });
        _reputation[newTokenId] = ReputationData({
            totalVerdicts: 0,
            appealsLost: 0,
            reputation: INITIAL_REPUTATION
        });

        emit Cloned(sourceTokenId, newTokenId, msg.sender, to);
        emit PublishedSealedKey(to, newTokenId, sealedKeys);
        emit ReputationInitialized(newTokenId, INITIAL_REPUTATION);
    }

    /// @dev Convenience existence check for off-chain indexers.
    function exists(uint256 tokenId) external view returns (bool) {
        return _tokens[tokenId].owner != address(0);
    }
}
