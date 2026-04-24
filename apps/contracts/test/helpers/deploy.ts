import { ethers } from "hardhat";

import type {
  AssertionRegistry,
  VerdictEnforcer,
  EscalationManager,
  ReputationRegistry,
  MockVerifier,
} from "../../typechain-types";

// Shared enum mirrors IVerdictTypes.
export const Mode = { INSTANT: 0, AUDITED: 1 } as const;
export const Outcome = {
  PENDING: 0,
  TRUE: 1,
  FALSE: 2,
  INVALID: 3,
  ESCALATED: 4,
} as const;
export const Status = {
  OPEN: 0,
  VERDICTED: 1,
  CHALLENGED: 2,
  RESOLVED: 3,
} as const;

export async function deployProtocol() {
  const [admin, feeSink, judge, backend, alice, bob, charlie] =
    await ethers.getSigners();

  const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
  const mockVerifier = (await MockVerifierFactory.deploy()) as unknown as MockVerifier;
  await mockVerifier.waitForDeployment();

  const ReputationFactory = await ethers.getContractFactory("ReputationRegistry");
  const reputation = (await ReputationFactory.deploy(
    "Verdict Judges",
    "vJUDGE",
    await mockVerifier.getAddress(),
    "https://0g.ai",
    "https://indexer-storage-testnet-turbo.0g.ai",
    admin.address,
  )) as unknown as ReputationRegistry;
  await reputation.waitForDeployment();

  const RegistryFactory = await ethers.getContractFactory("AssertionRegistry");
  const registry = (await RegistryFactory.deploy(
    admin.address,
    feeSink.address,
    await reputation.getAddress(),
  )) as unknown as AssertionRegistry;
  await registry.waitForDeployment();

  const EnforcerFactory = await ethers.getContractFactory("VerdictEnforcer");
  const enforcer = (await EnforcerFactory.deploy(
    admin.address,
  )) as unknown as VerdictEnforcer;
  await enforcer.waitForDeployment();

  const EscalationFactory = await ethers.getContractFactory("EscalationManager");
  const escalation = (await EscalationFactory.deploy(
    admin.address,
    await registry.getAddress(),
    await reputation.getAddress(),
  )) as unknown as EscalationManager;
  await escalation.waitForDeployment();

  // Wire up roles.
  await enforcer
    .connect(admin)
    .authorizeRegistry(await registry.getAddress());
  await registry.connect(admin).setEnforcer(await enforcer.getAddress());
  await registry
    .connect(admin)
    .grantRole(await registry.JUDGE_ROLE(), judge.address);
  // Escalation manager needs to call registry.resolveAssertion
  // ENFORCER_ROLE is granted by setEnforcer only to the enforcer address.
  // We need escalation to have ENFORCER_ROLE too (it calls resolveAssertion
  // on the CHALLENGED path).
  await registry
    .connect(admin)
    .grantRole(await registry.ENFORCER_ROLE(), await escalation.getAddress());
  // Escalation manager also needs VERDICT_WRITER_ROLE on reputation.
  await reputation
    .connect(admin)
    .grantRole(
      await reputation.VERDICT_WRITER_ROLE(),
      await escalation.getAddress(),
    );
  await escalation
    .connect(admin)
    .grantRole(await escalation.PANEL_ROLE(), backend.address);

  return {
    admin,
    feeSink,
    judge,
    backend,
    alice,
    bob,
    charlie,
    mockVerifier,
    reputation,
    registry,
    enforcer,
    escalation,
  };
}

/// @notice Mint a judge-agent NFT via MockVerifier-formatted proofs.
///         Minter signer is passed explicitly so the owner/creator address
///         lines up with the NFT event data.
export async function mintJudgeAgent(
  reputation: ReputationRegistry,
  minter: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  owner: string,
  dataHash: string,
  description: string,
): Promise<bigint> {
  const proof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bool"],
    [dataHash, true],
  );
  const tx = await reputation
    .connect(minter)
    .mint([proof], [description], owner);
  const receipt = await tx.wait();
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = reputation.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed?.name === "Minted") {
        return parsed.args._tokenId as bigint;
      }
    } catch {}
  }
  throw new Error("Minted event not found");
}
