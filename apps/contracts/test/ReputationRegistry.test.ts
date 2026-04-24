import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import type { ContractTransactionResponse } from "ethers";

import type {
  MockVerifier,
  ReputationRegistry,
} from "../typechain-types";

// ───────────────────────── helpers ─────────────────────────

function preimageProof(dataHash: string, isValid = true): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bool"],
    [dataHash, isValid],
  );
}

function transferProof(opts: {
  oldDataHash: string;
  newDataHash: string;
  receiver: string;
  sealedKey?: string;
  isValid?: boolean;
}): string {
  const sealed = opts.sealedKey ?? "0x" + "11".repeat(16);
  const valid = opts.isValid ?? true;
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32", "address", "bytes16", "bool"],
    [opts.oldDataHash, opts.newDataHash, opts.receiver, sealed, valid],
  );
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

async function deployFixture() {
  const [admin, alice, bob, carol, protocol] = await ethers.getSigners();

  const MockVerifierFactory = await ethers.getContractFactory("MockVerifier");
  const verifier = (await MockVerifierFactory.deploy()) as unknown as MockVerifier;
  await verifier.waitForDeployment();

  const RegistryFactory = await ethers.getContractFactory("ReputationRegistry");
  const registry = (await RegistryFactory.deploy(
    "Verdict Judge Agents",
    "JUDGE",
    await verifier.getAddress(),
    "https://chainscan-galileo.0g.ai",
    "https://indexer-storage-testnet-turbo.0g.ai",
    admin.address,
  )) as unknown as ReputationRegistry;
  await registry.waitForDeployment();

  const VERDICT_WRITER_ROLE = await registry.VERDICT_WRITER_ROLE();
  await registry.grantRole(VERDICT_WRITER_ROLE, protocol.address);

  return { registry, verifier, admin, alice, bob, carol, protocol, VERDICT_WRITER_ROLE };
}

async function mintToken(
  registry: ReputationRegistry,
  to: string,
  caller = to,
  hashes: string[] = ["0x" + "aa".repeat(32)],
) {
  const runner = await ethers.getSigner(caller);
  const proofs = hashes.map((h) => preimageProof(h));
  const descriptions = hashes.map((_, i) => `slot-${i}`);
  const tx = await (registry.connect(runner) as any).mint(proofs, descriptions, to);
  const receipt = await tx.wait();
  const event = receipt!.logs
    .map((l: any) => {
      try {
        return registry.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e: any) => e && e.name === "Minted");
  if (!event) throw new Error("Minted event not found");
  return { tokenId: event.args._tokenId as bigint, tx: tx as ContractTransactionResponse };
}

// ───────────────────────── deployment ─────────────────────────

describe("ReputationRegistry — deployment", () => {
  it("sets name, symbol, verifier", async () => {
    const { registry, verifier } = await loadFixture(deployFixture);
    expect(await registry.name()).to.equal("Verdict Judge Agents");
    expect(await registry.symbol()).to.equal("JUDGE");
    expect(await registry.verifier()).to.equal(await verifier.getAddress());
  });

  it("grants DEFAULT_ADMIN_ROLE and ADMIN_ROLE to the deployer-admin", async () => {
    const { registry, admin } = await loadFixture(deployFixture);
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const ADMIN_ROLE = await registry.ADMIN_ROLE();
    expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
    expect(await registry.hasRole(ADMIN_ROLE, admin.address)).to.equal(true);
  });

  it("advertises IERC7857 + IERC7857Metadata via supportsInterface", async () => {
    const { registry } = await loadFixture(deployFixture);
    // Compute interface ids by XOR'ing selectors of all functions.
    const ierc7857Fns = [
      "verifier()",
      "mint(bytes[],string[],address)",
      "transfer(address,uint256,bytes[])",
      "clone(address,uint256,bytes[])",
      "authorizeUsage(uint256,address)",
      "ownerOf(uint256)",
      "authorizedUsersOf(uint256)",
    ];
    const ierc7857MetadataFns = [
      "name()",
      "symbol()",
      "tokenURI(uint256)",
      "update(uint256,bytes[])",
      "dataHashesOf(uint256)",
      "dataDescriptionsOf(uint256)",
    ];
    const xorSelectors = (sigs: string[]) =>
      sigs.reduce(
        (acc, s) => acc ^ parseInt(ethers.id(s).slice(2, 10), 16),
        0,
      ) >>> 0;

    const ierc7857Id = "0x" + xorSelectors(ierc7857Fns).toString(16).padStart(8, "0");
    const ierc7857MetadataId =
      "0x" + xorSelectors(ierc7857MetadataFns).toString(16).padStart(8, "0");

    expect(await registry.supportsInterface(ierc7857Id)).to.equal(true);
    expect(await registry.supportsInterface(ierc7857MetadataId)).to.equal(true);
    // AccessControl interface should still be advertised.
    expect(await registry.supportsInterface("0x01ffc9a7")).to.equal(true);
  });

  it("rejects zero addresses in constructor", async () => {
    const [admin] = await ethers.getSigners();
    const MockVerifier = await ethers.getContractFactory("MockVerifier");
    const verifier = await MockVerifier.deploy();
    await verifier.waitForDeployment();

    const Registry = await ethers.getContractFactory("ReputationRegistry");
    await expect(
      Registry.deploy("X", "Y", ZERO_ADDR, "", "", admin.address),
    ).to.be.revertedWithCustomError(Registry, "ZeroAddress");
    await expect(
      Registry.deploy("X", "Y", await verifier.getAddress(), "", "", ZERO_ADDR),
    ).to.be.revertedWithCustomError(Registry, "ZeroAddress");
  });
});

// ───────────────────────── mint ─────────────────────────

describe("ReputationRegistry — mint", () => {
  it("mints a token, records dataHashes + descriptions, initialises reputation", async () => {
    const { registry, alice } = await loadFixture(deployFixture);
    const hash = "0x" + "ab".repeat(32);
    const proofs = [preimageProof(hash)];
    const descs = ["model-weights"];

    const tx = registry.connect(alice).mint(proofs, descs, alice.address);
    await expect(tx)
      .to.emit(registry, "Minted")
      .withArgs(0n, alice.address, alice.address, [hash], descs)
      .and.to.emit(registry, "ReputationInitialized")
      .withArgs(0n, 1000n);

    expect(await registry.ownerOf(0)).to.equal(alice.address);
    expect(await registry.dataHashesOf(0)).to.deep.equal([hash]);
    expect(await registry.dataDescriptionsOf(0)).to.deep.equal(descs);
    expect(await registry.totalMinted()).to.equal(1n);

    const rep = await registry.reputationOf(0);
    expect(rep.totalVerdicts).to.equal(0n);
    expect(rep.appealsLost).to.equal(0n);
    expect(rep.reputation).to.equal(1000n);
  });

  it("defaults recipient to caller when to == address(0)", async () => {
    const { registry, alice } = await loadFixture(deployFixture);
    const hash = "0x" + "01".repeat(32);
    await registry
      .connect(alice)
      .mint([preimageProof(hash)], ["slot"], ZERO_ADDR);
    expect(await registry.ownerOf(0)).to.equal(alice.address);
  });

  it("reverts when proofs and descriptions lengths differ", async () => {
    const { registry, alice } = await loadFixture(deployFixture);
    await expect(
      registry
        .connect(alice)
        .mint(
          [preimageProof("0x" + "00".repeat(32))],
          ["a", "b"],
          alice.address,
        ),
    )
      .to.be.revertedWithCustomError(registry, "ProofsDescriptionsLengthMismatch")
      .withArgs(1n, 2n);
  });

  it("reverts when a preimage proof is marked invalid by the verifier", async () => {
    const { registry, alice } = await loadFixture(deployFixture);
    const hash = "0x" + "cd".repeat(32);
    await expect(
      registry.connect(alice).mint([preimageProof(hash, false)], ["x"], alice.address),
    )
      .to.be.revertedWithCustomError(registry, "InvalidPreimageProof")
      .withArgs(0n, hash);
  });

  it("auto-increments token ids across multiple mints", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    const m1 = await mintToken(registry, alice.address);
    const m2 = await mintToken(registry, bob.address, bob.address);
    expect(m1.tokenId).to.equal(0n);
    expect(m2.tokenId).to.equal(1n);
  });
});

// ───────────────────────── transfer ─────────────────────────

describe("ReputationRegistry — transfer", () => {
  it("moves ownership, rewrites dataHashes, emits Transferred + PublishedSealedKey", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    const oldHash = "0x" + "11".repeat(32);
    const newHash = "0x" + "22".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [oldHash]);

    const sealed = "0x" + "aa".repeat(16);
    const proofs = [
      transferProof({
        oldDataHash: oldHash,
        newDataHash: newHash,
        receiver: bob.address,
        sealedKey: sealed,
      }),
    ];

    const tx = registry.connect(alice).transfer(bob.address, tokenId, proofs);
    await expect(tx)
      .to.emit(registry, "Transferred")
      .withArgs(tokenId, alice.address, bob.address)
      .and.to.emit(registry, "PublishedSealedKey")
      .withArgs(bob.address, tokenId, [sealed]);

    expect(await registry.ownerOf(tokenId)).to.equal(bob.address);
    expect(await registry.dataHashesOf(tokenId)).to.deep.equal([newHash]);
  });

  it("clears the approved operator after a transfer", async () => {
    const { registry, alice, bob, carol } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);

    await registry.connect(alice).approve(carol.address, tokenId);
    expect(await registry.getApproved(tokenId)).to.equal(carol.address);

    await registry.connect(alice).transfer(bob.address, tokenId, [
      transferProof({ oldDataHash: h, newDataHash: h, receiver: bob.address }),
    ]);
    expect(await registry.getApproved(tokenId)).to.equal(ZERO_ADDR);
  });

  it("reverts when caller is not the owner", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);
    await expect(
      registry
        .connect(bob)
        .transfer(bob.address, tokenId, [
          transferProof({ oldDataHash: h, newDataHash: h, receiver: bob.address }),
        ]),
    ).to.be.revertedWithCustomError(registry, "NotOwner");
  });

  it("reverts when receiver is zero address", async () => {
    const { registry, alice } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);
    await expect(
      registry.connect(alice).transfer(ZERO_ADDR, tokenId, []),
    ).to.be.revertedWithCustomError(registry, "ZeroAddress");
  });

  it("reverts when oldDataHash in the proof does not match the stored hash", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    const stored = "0x" + "11".repeat(32);
    const wrong = "0x" + "99".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [stored]);

    await expect(
      registry.connect(alice).transfer(bob.address, tokenId, [
        transferProof({ oldDataHash: wrong, newDataHash: "0x" + "22".repeat(32), receiver: bob.address }),
      ]),
    )
      .to.be.revertedWithCustomError(registry, "OldDataHashMismatch")
      .withArgs(0n, stored, wrong);
  });

  it("reverts when the proof's receiver doesn't match the target", async () => {
    const { registry, alice, bob, carol } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);

    await expect(
      registry.connect(alice).transfer(bob.address, tokenId, [
        transferProof({ oldDataHash: h, newDataHash: h, receiver: carol.address }),
      ]),
    )
      .to.be.revertedWithCustomError(registry, "ReceiverMismatch")
      .withArgs(0n, bob.address, carol.address);
  });

  it("reverts when the proof is flagged invalid", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);

    await expect(
      registry.connect(alice).transfer(bob.address, tokenId, [
        transferProof({
          oldDataHash: h,
          newDataHash: h,
          receiver: bob.address,
          isValid: false,
        }),
      ]),
    )
      .to.be.revertedWithCustomError(registry, "InvalidTransferValidityProof")
      .withArgs(0n);
  });
});

// ───────────────────────── transferFrom ─────────────────────────

describe("ReputationRegistry — transferFrom", () => {
  it("allows the approved operator to move the token", async () => {
    const { registry, alice, bob, carol } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);

    await registry.connect(alice).approve(carol.address, tokenId);

    await registry.connect(carol).transferFrom(alice.address, bob.address, tokenId, [
      transferProof({ oldDataHash: h, newDataHash: h, receiver: bob.address }),
    ]);

    expect(await registry.ownerOf(tokenId)).to.equal(bob.address);
  });

  it("allows an operator approved-for-all", async () => {
    const { registry, alice, bob, carol } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);

    await registry.connect(alice).setApprovalForAll(carol.address, true);
    expect(await registry.isApprovedForAll(alice.address, carol.address)).to.equal(true);

    await registry.connect(carol).transferFrom(alice.address, bob.address, tokenId, [
      transferProof({ oldDataHash: h, newDataHash: h, receiver: bob.address }),
    ]);
    expect(await registry.ownerOf(tokenId)).to.equal(bob.address);
  });

  it("reverts when caller lacks approval", async () => {
    const { registry, alice, bob, carol } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);

    await expect(
      registry.connect(carol).transferFrom(alice.address, bob.address, tokenId, []),
    ).to.be.revertedWithCustomError(registry, "NotApproved");
  });

  it("reverts when `from` is not the owner", async () => {
    const { registry, alice, bob, carol } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);
    await expect(
      registry.connect(carol).transferFrom(bob.address, carol.address, tokenId, []),
    ).to.be.revertedWithCustomError(registry, "NotOwner");
  });
});

// ───────────────────────── clone ─────────────────────────

describe("ReputationRegistry — clone", () => {
  it("mints a new token copying descriptions, leaving the source intact", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);

    const newHash = "0x" + "22".repeat(32);
    const tx = registry.connect(alice).clone(bob.address, tokenId, [
      transferProof({ oldDataHash: h, newDataHash: newHash, receiver: bob.address }),
    ]);

    await expect(tx)
      .to.emit(registry, "Cloned")
      .withArgs(tokenId, 1n, alice.address, bob.address)
      .and.to.emit(registry, "ReputationInitialized")
      .withArgs(1n, 1000n);

    expect(await registry.ownerOf(tokenId)).to.equal(alice.address);
    expect(await registry.ownerOf(1)).to.equal(bob.address);
    expect(await registry.dataHashesOf(1)).to.deep.equal([newHash]);
    expect(await registry.dataDescriptionsOf(1)).to.deep.equal(
      await registry.dataDescriptionsOf(tokenId),
    );
  });

  it("resets reputation on the clone (starts fresh)", async () => {
    const { registry, alice, bob, protocol } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);
    await registry.connect(protocol).recordVerdict(tokenId, true);

    const newHash = "0x" + "22".repeat(32);
    await registry.connect(alice).clone(bob.address, tokenId, [
      transferProof({ oldDataHash: h, newDataHash: newHash, receiver: bob.address }),
    ]);

    const sourceRep = await registry.reputationOf(tokenId);
    expect(sourceRep.totalVerdicts).to.equal(1n);
    const cloneRep = await registry.reputationOf(1);
    expect(cloneRep.totalVerdicts).to.equal(0n);
    expect(cloneRep.reputation).to.equal(1000n);
  });

  it("cloneFrom respects operator approvals", async () => {
    const { registry, alice, bob, carol } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);

    await registry.connect(alice).setApprovalForAll(carol.address, true);

    await registry
      .connect(carol)
      .cloneFrom(alice.address, bob.address, tokenId, [
        transferProof({ oldDataHash: h, newDataHash: h, receiver: bob.address }),
      ]);

    expect(await registry.ownerOf(1)).to.equal(bob.address);
  });
});

// ───────────────────────── update ─────────────────────────

describe("ReputationRegistry — update", () => {
  it("rewrites dataHashes with Updated event", async () => {
    const { registry, alice } = await loadFixture(deployFixture);
    const oldHash = "0x" + "11".repeat(32);
    const newHash = "0x" + "22".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [oldHash]);

    await expect(registry.connect(alice).update(tokenId, [preimageProof(newHash)]))
      .to.emit(registry, "Updated")
      .withArgs(tokenId, [oldHash], [newHash]);

    expect(await registry.dataHashesOf(tokenId)).to.deep.equal([newHash]);
  });

  it("reverts when caller is not the owner", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);
    await expect(
      registry.connect(bob).update(tokenId, [preimageProof(h)]),
    ).to.be.revertedWithCustomError(registry, "NotOwner");
  });

  it("reverts on an invalid preimage", async () => {
    const { registry, alice } = await loadFixture(deployFixture);
    const h = "0x" + "11".repeat(32);
    const { tokenId } = await mintToken(registry, alice.address, alice.address, [h]);
    await expect(
      registry.connect(alice).update(tokenId, [preimageProof(h, false)]),
    ).to.be.revertedWithCustomError(registry, "InvalidPreimageProof");
  });
});

// ───────────────────────── authorize + approvals ─────────────────────────

describe("ReputationRegistry — authorization & approvals", () => {
  it("authorizeUsage appends and emits Authorization", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    const { tokenId } = await mintToken(registry, alice.address);
    await expect(registry.connect(alice).authorizeUsage(tokenId, bob.address))
      .to.emit(registry, "Authorization")
      .withArgs(alice.address, bob.address, tokenId);
    expect(await registry.authorizedUsersOf(tokenId)).to.deep.equal([bob.address]);
  });

  it("authorizeUsage reverts when caller is not the owner", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    const { tokenId } = await mintToken(registry, alice.address);
    await expect(
      registry.connect(bob).authorizeUsage(tokenId, bob.address),
    ).to.be.revertedWithCustomError(registry, "NotOwner");
  });

  it("approve / getApproved round-trip", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    const { tokenId } = await mintToken(registry, alice.address);
    await expect(registry.connect(alice).approve(bob.address, tokenId))
      .to.emit(registry, "Approval")
      .withArgs(alice.address, bob.address, tokenId);
    expect(await registry.getApproved(tokenId)).to.equal(bob.address);
  });

  it("setApprovalForAll round-trip", async () => {
    const { registry, alice, bob } = await loadFixture(deployFixture);
    await expect(registry.connect(alice).setApprovalForAll(bob.address, true))
      .to.emit(registry, "ApprovalForAll")
      .withArgs(alice.address, bob.address, true);
    expect(await registry.isApprovedForAll(alice.address, bob.address)).to.equal(true);
  });
});

// ───────────────────────── metadata ─────────────────────────

describe("ReputationRegistry — metadata", () => {
  it("tokenURI packs chain + indexer URLs as JSON", async () => {
    const { registry, alice } = await loadFixture(deployFixture);
    const { tokenId } = await mintToken(registry, alice.address);
    const uri = await registry.tokenURI(tokenId);
    expect(uri).to.equal(
      '{"chainURL":"https://chainscan-galileo.0g.ai","indexerURL":"https://indexer-storage-testnet-turbo.0g.ai"}',
    );
  });

  it("tokenURI reverts for a non-existent token", async () => {
    const { registry } = await loadFixture(deployFixture);
    await expect(registry.tokenURI(42)).to.be.revertedWithCustomError(
      registry,
      "TokenDoesNotExist",
    );
  });

  it("dataHashesOf / dataDescriptionsOf revert for a non-existent token", async () => {
    const { registry } = await loadFixture(deployFixture);
    await expect(registry.dataHashesOf(42)).to.be.revertedWithCustomError(
      registry,
      "TokenDoesNotExist",
    );
    await expect(registry.dataDescriptionsOf(42)).to.be.revertedWithCustomError(
      registry,
      "TokenDoesNotExist",
    );
  });
});

// ───────────────────────── admin ─────────────────────────

describe("ReputationRegistry — admin", () => {
  it("updateVerifier swaps the verifier", async () => {
    const { registry, admin } = await loadFixture(deployFixture);
    const NewVerifier = await ethers.getContractFactory("MockVerifier");
    const nv = await NewVerifier.deploy();
    await nv.waitForDeployment();
    const prev = await registry.verifier();
    await expect(registry.connect(admin).updateVerifier(await nv.getAddress()))
      .to.emit(registry, "VerifierUpdated")
      .withArgs(prev, await nv.getAddress());
    expect(await registry.verifier()).to.equal(await nv.getAddress());
  });

  it("updateVerifier rejects zero address", async () => {
    const { registry, admin } = await loadFixture(deployFixture);
    await expect(
      registry.connect(admin).updateVerifier(ZERO_ADDR),
    ).to.be.revertedWithCustomError(registry, "ZeroAddress");
  });

  it("updateVerifier reverts for non-admin caller", async () => {
    const { registry, alice } = await loadFixture(deployFixture);
    await expect(
      registry.connect(alice).updateVerifier(alice.address),
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("updateURLs swaps chain + indexer URLs", async () => {
    const { registry, admin } = await loadFixture(deployFixture);
    await expect(
      registry.connect(admin).updateURLs("https://chainscan.0g.ai", "https://indexer-storage-turbo.0g.ai"),
    )
      .to.emit(registry, "URLsUpdated")
      .withArgs("https://chainscan.0g.ai", "https://indexer-storage-turbo.0g.ai");
  });
});

// ───────────────────────── reputation layer ─────────────────────────

describe("ReputationRegistry — reputation", () => {
  it("recordVerdict(+majority) increments totalVerdicts and adds REPUTATION_REWARD", async () => {
    const { registry, alice, protocol } = await loadFixture(deployFixture);
    const { tokenId } = await mintToken(registry, alice.address);

    await expect(registry.connect(protocol).recordVerdict(tokenId, true))
      .to.emit(registry, "VerdictRecorded")
      .withArgs(tokenId, true, 1n, 1001n);

    const rep = await registry.reputationOf(tokenId);
    expect(rep.totalVerdicts).to.equal(1n);
    expect(rep.appealsLost).to.equal(0n);
    expect(rep.reputation).to.equal(1001n);
  });

  it("recordVerdict(-minority) subtracts REPUTATION_PENALTY_MINORITY", async () => {
    const { registry, alice, protocol } = await loadFixture(deployFixture);
    const { tokenId } = await mintToken(registry, alice.address);

    await expect(registry.connect(protocol).recordVerdict(tokenId, false))
      .to.emit(registry, "VerdictRecorded")
      .withArgs(tokenId, false, -2n, 998n);

    const rep = await registry.reputationOf(tokenId);
    expect(rep.reputation).to.equal(998n);
  });

  it("recordAppealLost subtracts REPUTATION_PENALTY_APPEAL_LOST and increments appealsLost", async () => {
    const { registry, alice, protocol } = await loadFixture(deployFixture);
    const { tokenId } = await mintToken(registry, alice.address);

    await expect(registry.connect(protocol).recordAppealLost(tokenId))
      .to.emit(registry, "AppealLostRecorded")
      .withArgs(tokenId, -10n, 990n);

    const rep = await registry.reputationOf(tokenId);
    expect(rep.reputation).to.equal(990n);
    expect(rep.appealsLost).to.equal(1n);
  });

  it("accumulates multiple updates deterministically", async () => {
    const { registry, alice, protocol } = await loadFixture(deployFixture);
    const { tokenId } = await mintToken(registry, alice.address);

    await registry.connect(protocol).recordVerdict(tokenId, true); // +1 = 1001
    await registry.connect(protocol).recordVerdict(tokenId, true); // +1 = 1002
    await registry.connect(protocol).recordVerdict(tokenId, false); // -2 = 1000
    await registry.connect(protocol).recordAppealLost(tokenId); // -10 = 990

    const rep = await registry.reputationOf(tokenId);
    expect(rep.totalVerdicts).to.equal(3n);
    expect(rep.appealsLost).to.equal(1n);
    expect(rep.reputation).to.equal(990n);
  });

  it("rejects reputation writes without VERDICT_WRITER_ROLE", async () => {
    const { registry, alice } = await loadFixture(deployFixture);
    const { tokenId } = await mintToken(registry, alice.address);
    await expect(
      registry.connect(alice).recordVerdict(tokenId, true),
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("reputation reads revert for unminted tokens", async () => {
    const { registry, protocol } = await loadFixture(deployFixture);
    await expect(registry.reputationOf(99)).to.be.revertedWithCustomError(
      registry,
      "TokenDoesNotExist",
    );
    await expect(
      registry.connect(protocol).recordVerdict(99, true),
    ).to.be.revertedWithCustomError(registry, "TokenDoesNotExist");
  });
});

// ───────────────────────── MockVerifier safety ─────────────────────────

describe("MockVerifier — mainnet guard", () => {
  it("deploys on hardhat (chain id 31337)", async () => {
    // the fixture above already proves this; this guards against regressions.
    const factory = await ethers.getContractFactory("MockVerifier");
    const v = await factory.deploy();
    await v.waitForDeployment();
    expect(await v.getAddress()).to.not.equal(ZERO_ADDR);
  });
});
