import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

import { deployProtocol, Outcome } from "./helpers/deploy";
import type { Escrow, MockERC20 } from "../typechain-types";

const H = (b: number) => "0x" + b.toString(16).padStart(2, "0").repeat(32);

async function deployEscrowFixture() {
  const protocol = await deployProtocol();

  const EscrowFactory = await ethers.getContractFactory("Escrow");
  const assertionBond = ethers.parseEther("0.01");
  const escrow = (await EscrowFactory.deploy(
    await protocol.registry.getAddress(),
    await protocol.enforcer.getAddress(),
    assertionBond,
  )) as unknown as Escrow;
  await escrow.waitForDeployment();

  const MockTokenFactory = await ethers.getContractFactory("MockERC20");
  const token = (await MockTokenFactory.deploy("TestUSDC", "tUSDC")) as unknown as MockERC20;
  await token.waitForDeployment();

  // Fund the client with tUSDC.
  await token.mint(protocol.alice.address, ethers.parseUnits("1000", 18));

  return { ...protocol, escrow, token, assertionBond };
}

describe("Escrow — happy path", () => {
  it("createEscrow → deliver → accept pays freelancer", async () => {
    const { escrow, token, alice, bob } = await loadFixture(deployEscrowFixture);

    const amount = ethers.parseUnits("500", 18);
    await token.connect(alice).approve(await escrow.getAddress(), amount);

    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
    await escrow
      .connect(alice)
      .createEscrow(bob.address, await token.getAddress(), amount, deadline, "Build a landing page");
    const escrowId = 1n;

    await escrow.connect(bob).deliver(escrowId, H(0xde));

    const bobBalBefore = await token.balanceOf(bob.address);
    await escrow.connect(alice).accept(escrowId);
    expect(await token.balanceOf(bob.address)).to.equal(bobBalBefore + amount);

    const e = await escrow.getEscrow(escrowId);
    expect(e.status).to.equal(3n); // ACCEPTED
  });
});

describe("Escrow — dispute path", () => {
  it("dispute → TRUE verdict refunds client", async () => {
    const {
      escrow,
      token,
      registry,
      alice,
      bob,
      judge,
      assertionBond,
    } = await loadFixture(deployEscrowFixture);

    const amount = ethers.parseUnits("500", 18);
    await token.connect(alice).approve(await escrow.getAddress(), amount);
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
    await escrow
      .connect(alice)
      .createEscrow(bob.address, await token.getAddress(), amount, deadline, "scope");
    const escrowId = 1n;
    await escrow.connect(bob).deliver(escrowId, H(0xde));

    const tx = await escrow
      .connect(alice)
      .openDispute(escrowId, H(0xc1), { value: assertionBond });
    const rc = await tx.wait();

    // pull assertionId from AssertionCreated via registry log
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

    await escrow.connect(bob).respondToDispute(escrowId, H(0xf1));

    await registry.connect(judge).submitVerdict(assertionId, Outcome.TRUE, H(0x33), H(0x44), 0);

    // AUDITED with 30-min window; resolve after expiry.
    await time.increase(30 * 60 + 1);
    const aliceBalBefore = await token.balanceOf(alice.address);
    await registry.resolveAssertion(assertionId, Outcome.TRUE);

    expect(await token.balanceOf(alice.address)).to.equal(aliceBalBefore + amount);
    const e = await escrow.getEscrow(escrowId);
    expect(e.status).to.equal(5n); // RESOLVED_CLIENT
  });

  it("dispute → FALSE verdict pays freelancer", async () => {
    const {
      escrow,
      token,
      registry,
      alice,
      bob,
      judge,
      assertionBond,
    } = await loadFixture(deployEscrowFixture);

    const amount = ethers.parseUnits("300", 18);
    await token.connect(alice).approve(await escrow.getAddress(), amount);
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
    await escrow
      .connect(alice)
      .createEscrow(bob.address, await token.getAddress(), amount, deadline, "scope2");
    const escrowId = 1n;
    await escrow.connect(bob).deliver(escrowId, H(0xde));

    const tx = await escrow
      .connect(alice)
      .openDispute(escrowId, H(0xc1), { value: assertionBond });
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

    await registry.connect(judge).submitVerdict(assertionId, Outcome.FALSE, H(0x33), H(0x44), 0);
    await time.increase(30 * 60 + 1);
    const bobBalBefore = await token.balanceOf(bob.address);
    await registry.resolveAssertion(assertionId, Outcome.FALSE);

    expect(await token.balanceOf(bob.address)).to.equal(bobBalBefore + amount);
    const e = await escrow.getEscrow(escrowId);
    expect(e.status).to.equal(6n); // RESOLVED_FREELANCER
  });
});

describe("Escrow — reverts", () => {
  it("rejects dispute from non-client", async () => {
    const { escrow, token, alice, bob, charlie, assertionBond } =
      await loadFixture(deployEscrowFixture);
    const amount = ethers.parseUnits("100", 18);
    await token.connect(alice).approve(await escrow.getAddress(), amount);
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
    await escrow
      .connect(alice)
      .createEscrow(bob.address, await token.getAddress(), amount, deadline, "scope");
    await escrow.connect(bob).deliver(1, H(0xde));
    await expect(
      escrow.connect(charlie).openDispute(1, H(0xc1), { value: assertionBond }),
    ).to.be.revertedWithCustomError(escrow, "NotClient");
  });

  it("rejects expire before deadline + window", async () => {
    const { escrow, token, alice, bob } = await loadFixture(deployEscrowFixture);
    const amount = ethers.parseUnits("100", 18);
    await token.connect(alice).approve(await escrow.getAddress(), amount);
    const deadline = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
    await escrow
      .connect(alice)
      .createEscrow(bob.address, await token.getAddress(), amount, deadline, "scope");
    await expect(escrow.expire(1)).to.be.revertedWithCustomError(
      escrow,
      "DeadlineNotReached",
    );
  });
});
