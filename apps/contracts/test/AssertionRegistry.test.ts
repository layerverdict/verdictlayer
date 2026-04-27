import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

import { deployProtocol, Mode, Outcome, Status, mintJudgeAgent } from "./helpers/deploy";

const ZERO32 = "0x" + "00".repeat(32);
const H = (b: number) => "0x" + b.toString(16).padStart(2, "0").repeat(32);
const SEL = "0x12345678"; // arbitrary valid selector

interface AssertionInputOverrides {
  claim?: string;
  evidenceRoots?: string[];
  callback?: string;
  callbackSelector?: string;
  mode?: number;
  challengePeriod?: bigint | number;
  bond?: bigint | number;
  salt?: string;
}

function makeInput(overrides: AssertionInputOverrides = {}) {
  return {
    claim: overrides.claim ?? "test claim",
    evidenceRoots: overrides.evidenceRoots ?? [H(0xaa), H(0xbb)],
    callback: overrides.callback ?? ethers.ZeroAddress,
    callbackSelector: overrides.callbackSelector ?? SEL,
    mode: overrides.mode ?? Mode.INSTANT,
    challengePeriod: overrides.challengePeriod ?? 0n,
    bond: overrides.bond ?? 0n,
    salt: overrides.salt ?? H(0x01),
  };
}

describe("AssertionRegistry — creation", () => {
  it("creates an assertion, stores fields, and emits AssertionCreated", async () => {
    const { registry, alice, charlie } = await loadFixture(deployProtocol);

    const input = makeInput({ callback: charlie.address });
    const tx = await registry.connect(alice).createAssertion(input, { value: 0 });
    const rc = await tx.wait();

    const event = rc!.logs
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
      .find((l) => l?.name === "AssertionCreated");
    expect(event).to.not.be.null;
    const id = event!.args.id as string;

    const a = await registry.getAssertion(id);
    expect(a.claim).to.equal("test claim");
    expect(a.asserter).to.equal(alice.address);
    expect(a.callback).to.equal(charlie.address);
    expect(a.mode).to.equal(BigInt(Mode.INSTANT));
    expect(a.status).to.equal(BigInt(Status.OPEN));
    expect(a.outcome).to.equal(BigInt(Outcome.PENDING));
  });

  it("reverts when msg.value doesn't match bond", async () => {
    const { registry, alice, charlie } = await loadFixture(deployProtocol);
    const input = makeInput({
      callback: charlie.address,
      bond: ethers.parseEther("0.01"),
    });
    await expect(
      registry.connect(alice).createAssertion(input, { value: 0 }),
    ).to.be.revertedWithCustomError(registry, "BondMismatch");
  });

  it("reverts on empty claim", async () => {
    const { registry, alice, charlie } = await loadFixture(deployProtocol);
    const input = makeInput({ callback: charlie.address, claim: "" });
    await expect(
      registry.connect(alice).createAssertion(input, { value: 0 }),
    ).to.be.revertedWithCustomError(registry, "EmptyClaim");
  });

  it("reverts on zero callback selector", async () => {
    const { registry, alice, charlie } = await loadFixture(deployProtocol);
    const input = makeInput({
      callback: charlie.address,
      callbackSelector: "0x00000000",
    });
    await expect(
      registry.connect(alice).createAssertion(input, { value: 0 }),
    ).to.be.revertedWithCustomError(registry, "InvalidCallbackSelector");
  });

  it("reverts if AUDITED challenge period is below MIN_CHALLENGE_PERIOD", async () => {
    const { registry, alice, charlie } = await loadFixture(deployProtocol);
    const input = makeInput({
      callback: charlie.address,
      mode: Mode.AUDITED,
      challengePeriod: 60n, // 60 seconds < 5 minutes min
    });
    await expect(
      registry.connect(alice).createAssertion(input, { value: 0 }),
    ).to.be.revertedWithCustomError(registry, "InvalidChallengePeriod");
  });

  it("reverts on duplicate assertion (same salt + inputs)", async () => {
    const { registry, alice, charlie } = await loadFixture(deployProtocol);
    const input = makeInput({ callback: charlie.address });
    await registry.connect(alice).createAssertion(input, { value: 0 });
    await expect(
      registry.connect(alice).createAssertion(input, { value: 0 }),
    ).to.be.revertedWithCustomError(registry, "AssertionAlreadyExists");
  });
});

describe("AssertionRegistry — INSTANT verdict flow", () => {
  it("submitVerdict on INSTANT refunds bond and marks RESOLVED", async () => {
    const { registry, enforcer, alice, judge } = await loadFixture(deployProtocol);

    // Deploy a trivial callback target (the enforcer itself will accept any
    // selector, but it needs a contract with a matching selector — so we use
    // a no-op target via a minimal factory).
    const Sink = await ethers.getContractFactory("CallbackSink");
    const sink = await Sink.deploy();
    await sink.waitForDeployment();

    const bond = ethers.parseEther("0.01");
    const input = makeInput({
      callback: await sink.getAddress(),
      callbackSelector: sink.interface.getFunction("onVerdict").selector,
      mode: Mode.INSTANT,
      bond,
    });

    const tx = await registry.connect(alice).createAssertion(input, { value: bond });
    const rc = await tx.wait();
    const ev = rc!.logs
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
      .find((l) => l?.name === "AssertionCreated");
    const id = ev!.args.id as string;

    const balBefore = await ethers.provider.getBalance(alice.address);
    const submitTx = await registry
      .connect(judge)
      .submitVerdict(id, Outcome.TRUE, H(0x33), H(0x44), 0);
    await submitTx.wait();

    const a = await registry.getAssertion(id);
    expect(a.status).to.equal(BigInt(Status.RESOLVED));
    expect(a.outcome).to.equal(BigInt(Outcome.TRUE));

    const balAfter = await ethers.provider.getBalance(alice.address);
    expect(balAfter - balBefore).to.equal(bond);

    const calls = await sink.calls();
    expect(calls.length).to.equal(1);
  });

  it("INVALID outcome on INSTANT forfeits bond to fee sink and skips callback", async () => {
    const { registry, feeSink, alice, judge } = await loadFixture(deployProtocol);
    const Sink = await ethers.getContractFactory("CallbackSink");
    const sink = await Sink.deploy();
    await sink.waitForDeployment();

    const bond = ethers.parseEther("0.05");
    const input = makeInput({
      callback: await sink.getAddress(),
      callbackSelector: sink.interface.getFunction("onVerdict").selector,
      mode: Mode.INSTANT,
      bond,
    });

    const tx = await registry
      .connect(alice)
      .createAssertion(input, { value: bond });
    const rc = await tx.wait();
    const id = rc!.logs
      .map((l) => registry.interface.parseLog({ topics: l.topics as string[], data: l.data }))
      .find((l) => l?.name === "AssertionCreated")!.args.id as string;

    const feeBalBefore = await ethers.provider.getBalance(feeSink.address);
    await registry
      .connect(judge)
      .submitVerdict(id, Outcome.INVALID, H(0x00), H(0x00), 0);
    const feeBalAfter = await ethers.provider.getBalance(feeSink.address);

    expect(feeBalAfter - feeBalBefore).to.equal(bond);
    // INVALID outcomes now dispatch through the enforcer so application
    // contracts can reset their own state (Escrow unlocks DISPUTED,
    // insurance surfaces rescueInvalidClaim, etc.). The sink records
    // the call just like any other outcome; the bond still goes to the
    // fee sink because nobody "won".
    expect((await sink.calls()).length).to.equal(1);
  });

  it("rejects submitVerdict from non-JUDGE_ROLE", async () => {
    const { registry, alice, bob, charlie } = await loadFixture(deployProtocol);
    const input = makeInput({ callback: charlie.address });
    const tx = await registry.connect(alice).createAssertion(input, { value: 0 });
    const rc = await tx.wait();
    const id = rc!.logs
      .map((l) => registry.interface.parseLog({ topics: l.topics as string[], data: l.data }))
      .find((l) => l?.name === "AssertionCreated")!.args.id as string;

    await expect(
      registry.connect(bob).submitVerdict(id, Outcome.TRUE, ZERO32, ZERO32, 0),
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("rejects PENDING or ESCALATED outcomes", async () => {
    const { registry, alice, judge, charlie } = await loadFixture(deployProtocol);
    const input = makeInput({ callback: charlie.address });
    const tx = await registry.connect(alice).createAssertion(input, { value: 0 });
    const id = (await tx.wait())!.logs
      .map((l) => registry.interface.parseLog({ topics: l.topics as string[], data: l.data }))
      .find((l) => l?.name === "AssertionCreated")!.args.id as string;

    await expect(
      registry.connect(judge).submitVerdict(id, Outcome.PENDING, ZERO32, ZERO32, 0),
    ).to.be.revertedWithCustomError(registry, "OutcomeCannotBePending");
    await expect(
      registry.connect(judge).submitVerdict(id, Outcome.ESCALATED, ZERO32, ZERO32, 0),
    ).to.be.revertedWithCustomError(registry, "OutcomeCannotBePending");
  });
});

describe("AssertionRegistry — AUDITED flow", () => {
  it("AUDITED waits for challenge window; resolveAssertion after window succeeds", async () => {
    const { registry, alice, judge } = await loadFixture(deployProtocol);
    const Sink = await ethers.getContractFactory("CallbackSink");
    const sink = await Sink.deploy();
    await sink.waitForDeployment();

    const bond = ethers.parseEther("0.02");
    const input = makeInput({
      callback: await sink.getAddress(),
      callbackSelector: sink.interface.getFunction("onVerdict").selector,
      mode: Mode.AUDITED,
      challengePeriod: 600n,
      bond,
    });

    const tx = await registry
      .connect(alice)
      .createAssertion(input, { value: bond });
    const id = (await tx.wait())!.logs
      .map((l) => registry.interface.parseLog({ topics: l.topics as string[], data: l.data }))
      .find((l) => l?.name === "AssertionCreated")!.args.id as string;

    await registry.connect(judge).submitVerdict(id, Outcome.TRUE, H(0x33), H(0x44), 0);

    // Cannot resolve immediately.
    await expect(
      registry.resolveAssertion(id, Outcome.TRUE),
    ).to.be.revertedWithCustomError(registry, "ChallengeWindowStillOpen");

    await time.increase(601);
    await registry.resolveAssertion(id, Outcome.TRUE);
    const a = await registry.getAssertion(id);
    expect(a.status).to.equal(BigInt(Status.RESOLVED));
    expect((await sink.calls()).length).to.equal(1);
  });

  it("challenger wins: both bonds go to challenger", async () => {
    const { registry, escalation, reputation, alice, bob, judge, backend, admin } =
      await loadFixture(deployProtocol);

    // Pre-mint 3 judge NFTs (tokenIds 0, 1, 2) so EscalationManager can
    // record their reputation after the panel votes.
    const t0 = await mintJudgeAgent(reputation, admin, admin.address, H(0x01), "judge0");
    const t1 = await mintJudgeAgent(reputation, admin, admin.address, H(0x02), "judge1");
    const t2 = await mintJudgeAgent(reputation, admin, admin.address, H(0x03), "judge2");

    const Sink = await ethers.getContractFactory("CallbackSink");
    const sink = await Sink.deploy();
    await sink.waitForDeployment();

    const bond = ethers.parseEther("0.1");
    const input = makeInput({
      callback: await sink.getAddress(),
      callbackSelector: sink.interface.getFunction("onVerdict").selector,
      mode: Mode.AUDITED,
      challengePeriod: 600n,
      bond,
    });
    const tx = await registry.connect(alice).createAssertion(input, { value: bond });
    const id = (await tx.wait())!.logs
      .map((l) => registry.interface.parseLog({ topics: l.topics as string[], data: l.data }))
      .find((l) => l?.name === "AssertionCreated")!.args.id as string;

    // Judge calls TRUE.
    await registry
      .connect(judge)
      .submitVerdict(id, Outcome.TRUE, H(0x33), H(0x44), 0);

    // Bob challenges.
    await registry.connect(bob).challengeAssertion(id, { value: bond });
    const a1 = await registry.getAssertion(id);
    expect(a1.status).to.equal(BigInt(Status.CHALLENGED));
    expect(a1.challenger).to.equal(bob.address);

    // Panel via escalation: 3 votes all FALSE → flips outcome.
    await escalation.connect(admin).openAppeal(id);
    await escalation.connect(backend).recordPanelVote(id, t0, Outcome.FALSE);
    await escalation.connect(backend).recordPanelVote(id, t1, Outcome.FALSE);
    await escalation.connect(backend).recordPanelVote(id, t2, Outcome.FALSE);

    const bobBalBefore = await ethers.provider.getBalance(bob.address);
    await escalation.connect(admin).closeAppeal(id);
    const bobBalAfter = await ethers.provider.getBalance(bob.address);

    expect(bobBalAfter - bobBalBefore).to.equal(bond * 2n);
    const a2 = await registry.getAssertion(id);
    expect(a2.status).to.equal(BigInt(Status.RESOLVED));
    expect(a2.outcome).to.equal(BigInt(Outcome.FALSE));
  });

  it("INVALID final outcome refunds both asserter and challenger", async () => {
    const { registry, escalation, reputation, alice, bob, judge, backend, admin } =
      await loadFixture(deployProtocol);

    const t0 = await mintJudgeAgent(reputation, admin, admin.address, H(0x01), "judge0");
    const t1 = await mintJudgeAgent(reputation, admin, admin.address, H(0x02), "judge1");
    const t2 = await mintJudgeAgent(reputation, admin, admin.address, H(0x03), "judge2");

    const Sink = await ethers.getContractFactory("CallbackSink");
    const sink = await Sink.deploy();
    await sink.waitForDeployment();

    const bond = ethers.parseEther("0.04");
    const input = makeInput({
      callback: await sink.getAddress(),
      callbackSelector: sink.interface.getFunction("onVerdict").selector,
      mode: Mode.AUDITED,
      challengePeriod: 600n,
      bond,
    });
    const tx = await registry.connect(alice).createAssertion(input, { value: bond });
    const id = (await tx.wait())!.logs
      .map((l) => registry.interface.parseLog({ topics: l.topics as string[], data: l.data }))
      .find((l) => l?.name === "AssertionCreated")!.args.id as string;

    await registry
      .connect(judge)
      .submitVerdict(id, Outcome.TRUE, H(0x33), H(0x44), 0);
    await registry.connect(bob).challengeAssertion(id, { value: bond });

    // 1-1-1 split → plurality returns INVALID.
    await escalation.connect(admin).openAppeal(id);
    await escalation.connect(backend).recordPanelVote(id, t0, Outcome.TRUE);
    await escalation.connect(backend).recordPanelVote(id, t1, Outcome.FALSE);
    await escalation.connect(backend).recordPanelVote(id, t2, Outcome.INVALID);

    const aliceBalBefore = await ethers.provider.getBalance(alice.address);
    const bobBalBefore = await ethers.provider.getBalance(bob.address);
    await escalation.connect(admin).closeAppeal(id);

    expect(await ethers.provider.getBalance(alice.address)).to.equal(
      aliceBalBefore + bond,
    );
    expect(await ethers.provider.getBalance(bob.address)).to.equal(
      bobBalBefore + bond,
    );

    const a = await registry.getAssertion(id);
    expect(a.outcome).to.equal(BigInt(Outcome.INVALID));
    // Callback IS dispatched on INVALID so applications can reset.
    expect((await sink.calls()).length).to.equal(1);
  });

  it("rejects zero-bond challenges on AUDITED assertions", async () => {
    const { registry, alice, judge } = await loadFixture(deployProtocol);

    const Sink = await ethers.getContractFactory("CallbackSink");
    const sink = await Sink.deploy();
    await sink.waitForDeployment();

    // AUDITED with bond = 0 — meaningless but allowed at creation.
    const input = makeInput({
      callback: await sink.getAddress(),
      callbackSelector: sink.interface.getFunction("onVerdict").selector,
      mode: Mode.AUDITED,
      challengePeriod: 600n,
      bond: 0n,
    });
    const tx = await registry.connect(alice).createAssertion(input, { value: 0 });
    const id = (await tx.wait())!.logs
      .map((l) => registry.interface.parseLog({ topics: l.topics as string[], data: l.data }))
      .find((l) => l?.name === "AssertionCreated")!.args.id as string;

    await registry
      .connect(judge)
      .submitVerdict(id, Outcome.TRUE, H(0x33), H(0x44), 0);

    await expect(
      registry.challengeAssertion(id, { value: 0 }),
    ).to.be.revertedWithCustomError(registry, "ZeroBondChallenge");
  });

  it("challenger loses: asserter keeps both bonds", async () => {
    const { registry, escalation, reputation, alice, bob, judge, backend, admin } =
      await loadFixture(deployProtocol);

    const t0 = await mintJudgeAgent(reputation, admin, admin.address, H(0x01), "judge0");
    const t1 = await mintJudgeAgent(reputation, admin, admin.address, H(0x02), "judge1");
    const t2 = await mintJudgeAgent(reputation, admin, admin.address, H(0x03), "judge2");

    const Sink = await ethers.getContractFactory("CallbackSink");
    const sink = await Sink.deploy();
    await sink.waitForDeployment();

    const bond = ethers.parseEther("0.05");
    const input = makeInput({
      callback: await sink.getAddress(),
      callbackSelector: sink.interface.getFunction("onVerdict").selector,
      mode: Mode.AUDITED,
      challengePeriod: 600n,
      bond,
    });
    const tx = await registry.connect(alice).createAssertion(input, { value: bond });
    const id = (await tx.wait())!.logs
      .map((l) => registry.interface.parseLog({ topics: l.topics as string[], data: l.data }))
      .find((l) => l?.name === "AssertionCreated")!.args.id as string;

    await registry
      .connect(judge)
      .submitVerdict(id, Outcome.TRUE, H(0x33), H(0x44), 0);
    await registry.connect(bob).challengeAssertion(id, { value: bond });

    await escalation.connect(admin).openAppeal(id);
    await escalation.connect(backend).recordPanelVote(id, t0, Outcome.TRUE);
    await escalation.connect(backend).recordPanelVote(id, t1, Outcome.TRUE);
    await escalation.connect(backend).recordPanelVote(id, t2, Outcome.FALSE);

    const aliceBalBefore = await ethers.provider.getBalance(alice.address);
    await escalation.connect(admin).closeAppeal(id);
    const aliceBalAfter = await ethers.provider.getBalance(alice.address);

    expect(aliceBalAfter - aliceBalBefore).to.equal(bond * 2n);
    const a = await registry.getAssertion(id);
    expect(a.outcome).to.equal(BigInt(Outcome.TRUE));
  });
});

describe("EscalationManager — panel input validation", () => {
  it("rejects recordPanelVote for an unminted judge tokenId", async () => {
    const { registry, escalation, alice, bob, judge, backend, admin } =
      await loadFixture(deployProtocol);

    const Sink = await ethers.getContractFactory("CallbackSink");
    const sink = await Sink.deploy();
    await sink.waitForDeployment();

    const bond = ethers.parseEther("0.01");
    const input = makeInput({
      callback: await sink.getAddress(),
      callbackSelector: sink.interface.getFunction("onVerdict").selector,
      mode: Mode.AUDITED,
      challengePeriod: 600n,
      bond,
    });
    const tx = await registry.connect(alice).createAssertion(input, { value: bond });
    const id = (await tx.wait())!.logs
      .map((l) => registry.interface.parseLog({ topics: l.topics as string[], data: l.data }))
      .find((l) => l?.name === "AssertionCreated")!.args.id as string;

    await registry
      .connect(judge)
      .submitVerdict(id, Outcome.TRUE, H(0x33), H(0x44), 0);
    await registry.connect(bob).challengeAssertion(id, { value: bond });
    await escalation.connect(admin).openAppeal(id);

    // tokenId 999 has never been minted.
    await expect(
      escalation.connect(backend).recordPanelVote(id, 999, Outcome.FALSE),
    ).to.be.revertedWithCustomError(escalation, "UnknownJudgeToken");
  });
});
