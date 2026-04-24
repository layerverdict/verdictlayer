import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

import { deployProtocol, Outcome } from "./helpers/deploy";
import type { ParametricInsurance } from "../typechain-types";

const H = (b: number) => "0x" + b.toString(16).padStart(2, "0").repeat(32);

async function deployInsuranceFixture() {
  const protocol = await deployProtocol();

  const InsuranceFactory = await ethers.getContractFactory("ParametricInsurance");
  const assertionBond = ethers.parseEther("0.01");
  const insurance = (await InsuranceFactory.deploy(
    await protocol.registry.getAddress(),
    await protocol.enforcer.getAddress(),
    assertionBond,
  )) as unknown as ParametricInsurance;
  await insurance.waitForDeployment();

  return { ...protocol, insurance, assertionBond };
}

describe("ParametricInsurance", () => {
  it("full claim path: underwrite → pay premium → claim → TRUE auto-payout", async () => {
    const {
      insurance,
      registry,
      alice, // holder
      bob, // insurer
      judge,
      assertionBond,
    } = await loadFixture(deployInsuranceFixture);

    const payout = ethers.parseEther("0.5");
    const premium = ethers.parseEther("0.02");
    const now = BigInt(await time.latest());
    const coverageStart = now + 10n;
    const coverageEnd = now + 86400n;

    await insurance
      .connect(bob)
      .underwrite(
        alice.address,
        premium,
        payout,
        coverageStart,
        coverageEnd,
        "AA123 delay >= 120 min",
        H(0x55),
        { value: payout },
      );
    const policyId = 1n;

    await insurance.connect(alice).payPremium(policyId, { value: premium });

    // Advance into coverage window.
    await time.increaseTo(coverageStart + 1n);

    const aliceBalBefore = await ethers.provider.getBalance(alice.address);
    const tx = await insurance
      .connect(alice)
      .claim(policyId, H(0xaa), { value: assertionBond });
    const rc = await tx.wait();
    const gasSpent = rc!.gasUsed * rc!.gasPrice;

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

    const submitTx = await registry
      .connect(judge)
      .submitVerdict(assertionId, Outcome.TRUE, H(0x33), H(0x44), 0);
    await submitTx.wait();

    const aliceBalAfter = await ethers.provider.getBalance(alice.address);
    // Alice receives: payout + assertionBond refund (via application contract)
    // minus gas + claim bond spent at claim time.
    // Net received through onVerdict + bond refund = payout
    // (bond refund goes back to the application contract, not Alice).
    // So Alice should gain payout - premium-equivalent-already-paid - gas - bond.
    // We check the payout event directly instead.
    const policy = await insurance.getPolicy(policyId);
    expect(policy.status).to.equal(3n); // PAID
    // Sanity: Alice's wallet gained at least payout - bond - gas (premium was paid pre-claim).
    const delta = aliceBalAfter - aliceBalBefore;
    expect(delta).to.be.gt(payout - assertionBond - gasSpent - premium);
    expect(delta).to.be.lte(payout - assertionBond);
  });

  it("FALSE verdict returns policy to ACTIVE for re-claim", async () => {
    const {
      insurance,
      registry,
      alice,
      bob,
      judge,
      assertionBond,
    } = await loadFixture(deployInsuranceFixture);

    const payout = ethers.parseEther("0.1");
    const premium = ethers.parseEther("0.01");
    const now = BigInt(await time.latest());
    const coverageStart = now + 10n;
    const coverageEnd = now + 86400n;

    await insurance.connect(bob).underwrite(
      alice.address,
      premium,
      payout,
      coverageStart,
      coverageEnd,
      "cond",
      H(0x55),
      { value: payout },
    );
    await insurance.connect(alice).payPremium(1, { value: premium });
    await time.increaseTo(coverageStart + 1n);
    const tx = await insurance
      .connect(alice)
      .claim(1, H(0xaa), { value: assertionBond });
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
      .submitVerdict(assertionId, Outcome.FALSE, H(0x33), H(0x44), 0);
    const policy = await insurance.getPolicy(1);
    expect(policy.status).to.equal(1n); // ACTIVE again
  });

  it("reclaim returns payout collateral after coverage expires without claim", async () => {
    const { insurance, alice, bob } = await loadFixture(deployInsuranceFixture);

    const payout = ethers.parseEther("0.3");
    const now = BigInt(await time.latest());
    const coverageStart = now + 10n;
    const coverageEnd = now + 1000n;
    await insurance.connect(bob).underwrite(
      alice.address,
      0,
      payout,
      coverageStart,
      coverageEnd,
      "cond",
      H(0x00),
      { value: payout },
    );

    await time.increaseTo(coverageEnd + 1n);
    const bobBalBefore = await ethers.provider.getBalance(bob.address);
    await insurance.connect(bob).reclaim(1);
    const bobBalAfter = await ethers.provider.getBalance(bob.address);
    expect(bobBalAfter - bobBalBefore).to.be.gt(payout - ethers.parseEther("0.001"));
  });
});
