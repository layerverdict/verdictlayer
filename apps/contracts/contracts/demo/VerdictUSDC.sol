// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title VerdictUSDC
/// @notice Demo USDC-shaped ERC-20 used by the Escrow and MilestoneVault
/// reference apps so prospective users can run through the full Verdict
/// flow on 0G Mainnet without having to bridge a real stablecoin. 6
/// decimals to match the mainnet USDC ABI, owner-controlled mint so the
/// supply stays bounded for the demo. This is not a production
/// stablecoin — it's a faucet token bound to the Verdict demo.
contract VerdictUSDC is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;

    // Per-caller faucet: any address can self-mint up to FAUCET_CAP
    // worth of tokens, once. Lets anyone run the Escrow / Milestone
    // demo without pinging us for tokens.
    uint256 public constant FAUCET_CAP = 1_000 * 10 ** DECIMALS; // 1,000 vUSDC
    mapping(address => bool) public hasClaimed;

    event FaucetClaimed(address indexed recipient, uint256 amount);

    error AlreadyClaimed();

    constructor(address initialOwner) ERC20("Verdict USDC (demo)", "vUSDC") Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Self-mint the demo faucet amount. One-shot per address.
    function faucet() external {
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();
        hasClaimed[msg.sender] = true;
        _mint(msg.sender, FAUCET_CAP);
        emit FaucetClaimed(msg.sender, FAUCET_CAP);
    }

    /// @notice Owner may top up arbitrary recipients (e.g. the treasury
    /// pre-seeding the deployer for canned-demo runs).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
