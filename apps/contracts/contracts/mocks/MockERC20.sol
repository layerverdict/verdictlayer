// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Minimal test-only ERC-20 with open mint. NEVER deploy to mainnet.
contract MockERC20 is ERC20 {
    uint256 internal constant OG_MAINNET_CHAIN_ID = 16661;
    uint256 internal constant ETHEREUM_MAINNET_CHAIN_ID = 1;

    error MainnetDeploymentForbidden(uint256 chainId);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        if (
            block.chainid == OG_MAINNET_CHAIN_ID ||
            block.chainid == ETHEREUM_MAINNET_CHAIN_ID
        ) {
            revert MainnetDeploymentForbidden(block.chainid);
        }
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
