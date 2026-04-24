import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { deployProtocol, Outcome } from "./helpers/deploy";
import type { AuthenticityCertifier } from "../typechain-types";

const H = (b: number) => "0x" + b.toString(16).padStart(2, "0").repeat(32);

async function deployCertifierFixture() {
  const protocol = await deployProtocol();
  const Factory = await ethers.getContractFactory("AuthenticityCertifier");
  const assertionBond = ethers.parseEther("0.001");
  const certifier = (await Factory.deploy(
    await protocol.registry.getAddress(),
    await protocol.enforcer.getAddress(),
    assertionBond,
  )) as unknown as AuthenticityCertifier;
  await certifier.waitForDeployment();
  return { ...protocol, certifier, assertionBond };
}

describe("AuthenticityCertifier", () => {
  it("TRUE verdict issues certificate and marks asset certified", async () => {
    const { certifier, registry, alice, judge, assertionBond } =
      await loadFixture(deployCertifierFixture);

    const asset = H(0xaa);
    const reference = H(0xbb);
    const tx = await certifier
      .connect(alice)
      .submitCheck(asset, reference, { value: assertionBond });
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

    expect(await certifier.isCertified(asset)).to.equal(true);
    const checkId = await certifier.certificateOf(asset);
    expect(checkId).to.equal(1n);
    const c = await certifier.getCheck(1);
    expect(c.status).to.equal(2n); // CERTIFIED
  });

  it("FALSE verdict leaves asset uncertified", async () => {
    const { certifier, registry, alice, judge, assertionBond } =
      await loadFixture(deployCertifierFixture);

    const tx = await certifier
      .connect(alice)
      .submitCheck(H(0xcc), H(0xdd), { value: assertionBond });
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

    expect(await certifier.isCertified(H(0xcc))).to.equal(false);
    const c = await certifier.getCheck(1);
    expect(c.status).to.equal(3n); // REJECTED
  });

  it("rejects submission with wrong bond", async () => {
    const { certifier, alice } = await loadFixture(deployCertifierFixture);
    await expect(
      certifier.connect(alice).submitCheck(H(0xcc), H(0xdd), { value: 0 }),
    ).to.be.revertedWithCustomError(certifier, "BondMismatch");
  });
});
