import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

import { deployProtocol, Outcome } from "./helpers/deploy";
import type { MilestoneVault, MockERC20 } from "../typechain-types";

const H = (b: number) => "0x" + b.toString(16).padStart(2, "0").repeat(32);

async function deployVaultFixture() {
  const protocol = await deployProtocol();

  const VaultFactory = await ethers.getContractFactory("MilestoneVault");
  const assertionBond = ethers.parseEther("0.005");
  const vault = (await VaultFactory.deploy(
    await protocol.registry.getAddress(),
    await protocol.enforcer.getAddress(),
    assertionBond,
  )) as unknown as MilestoneVault;
  await vault.waitForDeployment();

  const TokenFactory = await ethers.getContractFactory("MockERC20");
  const token = (await TokenFactory.deploy("GrantUSD", "GUSD")) as unknown as MockERC20;
  await token.waitForDeployment();

  // DAO funded with tokens to pay into the vault.
  await token.mint(protocol.alice.address, ethers.parseUnits("100000", 18));

  return { ...protocol, vault, token, assertionBond };
}

describe("MilestoneVault", () => {
  it("submit + TRUE releases milestone slice", async () => {
    const {
      vault,
      token,
      registry,
      alice, // DAO
      bob, // grantee
      judge,
      assertionBond,
    } = await loadFixture(deployVaultFixture);

    const amounts = [
      ethers.parseUnits("2500", 18),
      ethers.parseUnits("2500", 18),
      ethers.parseUnits("2500", 18),
      ethers.parseUnits("2500", 18),
    ];
    const total = amounts.reduce((a, b) => a + b, 0n);

    await token.connect(alice).approve(await vault.getAddress(), total);
    const expiry = BigInt(await time.latest()) + 86400n * 30n;
    await vault
      .connect(alice)
      .createGrant(
        bob.address,
        await token.getAddress(),
        amounts,
        ["M1 auth", "M2 dashboard", "M3 payments", "M4 launch"],
        expiry,
      );
    const grantId = 1n;

    const tx = await vault
      .connect(bob)
      .submitMilestone(grantId, 0, H(0xab), { value: assertionBond });
    const rc = await tx.wait();
    const assertionId = rc!.logs
      .map((l) => {
        try {
          return registry.interface.parseLog({
            topics: l.topics as string[],
            data: l.data,
          });
        } catch {
          return null;
        }
      })
      .find((l) => l?.name === "AssertionCreated")!.args.id as string;

    await registry
      .connect(judge)
      .submitVerdict(assertionId, Outcome.TRUE, H(0x33), H(0x44), 0);
    // AUDITED 1 hour — wait.
    await time.increase(60 * 60 + 1);
    const bobBalBefore = await token.balanceOf(bob.address);
    await registry.resolveAssertion(assertionId, Outcome.TRUE);
    expect(await token.balanceOf(bob.address)).to.equal(bobBalBefore + amounts[0]!);

    const m = await vault.getMilestone(grantId, 0);
    expect(m.status).to.equal(2n); // RELEASED
  });

  it("reclaim returns residue to DAO after expiry", async () => {
    const { vault, token, alice, bob } = await loadFixture(deployVaultFixture);

    const amounts = [ethers.parseUnits("1000", 18), ethers.parseUnits("1000", 18)];
    const total = amounts[0]! + amounts[1]!;
    await token.connect(alice).approve(await vault.getAddress(), total);
    const expiry = BigInt(await time.latest()) + 3600n;
    await vault
      .connect(alice)
      .createGrant(
        bob.address,
        await token.getAddress(),
        amounts,
        ["m1", "m2"],
        expiry,
      );

    await time.increase(3601);
    const aliceBalBefore = await token.balanceOf(alice.address);
    await vault.connect(alice).reclaim(1);
    expect(await token.balanceOf(alice.address)).to.equal(aliceBalBefore + total);
  });
});
