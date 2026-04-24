import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { HDNodeWallet } from "ethers";

import type { Verifier } from "../typechain-types";

// VerifierType enum matches the Solidity enum: TEE = 0, ZKP = 1.
const TEE = 0;
const ZKP = 1;

// Proof byte layout indicators.
const IND_TEE_PUBLIC = 0x00; // bit 7 = 0 (TEE), bit 6 = 0 (public)
const IND_TEE_PRIVATE = 0x40; // bit 6 = 1 (private)
const IND_ZKP_PUBLIC = 0x80; // bit 7 = 1 (ZKP)

// Hex helpers
const HASH = (b: number) => "0x" + b.toString(16).padStart(2, "0").repeat(32);
const SEAL = (b: number) => "0x" + b.toString(16).padStart(2, "0").repeat(16);

async function deployFixture() {
  const [admin, alice, bob] = await ethers.getSigners();

  const VerifierFactory = await ethers.getContractFactory("Verifier");
  const teeVerifier = (await VerifierFactory.deploy(
    ethers.ZeroAddress,
    TEE,
  )) as unknown as Verifier;
  await teeVerifier.waitForDeployment();

  const zkpVerifier = (await VerifierFactory.deploy(
    ethers.ZeroAddress,
    ZKP,
  )) as unknown as Verifier;
  await zkpVerifier.waitForDeployment();

  return { teeVerifier, zkpVerifier, admin, alice, bob };
}

/**
 * Produce the inner message hash the verifier expects.
 * Mirrors `_createMessageHash` in Solidity:
 *   inner = keccak256(newHash || (isPrivate ? oldHash : "") || nonce)
 *   (EIP-191 personal-sign is applied by ethers.signMessage below.)
 *
 * Note the Solidity side feeds the hex string of `inner` to personal_sign,
 * not the raw bytes. So we produce the hex string and sign its UTF-8 bytes.
 */
function innerHashHex(
  isPrivate: boolean,
  newDataHash: string,
  oldDataHash: string,
  nonce: string,
): string {
  const packed = isPrivate
    ? ethers.solidityPacked(
        ["bytes32", "bytes32", "bytes"],
        [newDataHash, oldDataHash, nonce],
      )
    : ethers.solidityPacked(["bytes32", "bytes"], [newDataHash, nonce]);
  const inner = ethers.keccak256(packed);
  // Strings.toHexString(uint256(inner), 32) → "0x" + 64 lower-case hex chars.
  return inner; // already 0x + 64 hex
}

/**
 * Sign the EIP-191 message. ethers.Wallet.signMessage handles the prefix
 * automatically, but we pass the *hex string* as the message bytes because
 * that's what `Strings.toHexString` yields on the Solidity side.
 */
async function signAccessibility(
  signer: HDNodeWallet,
  isPrivate: boolean,
  newDataHash: string,
  oldDataHash: string,
  nonce: string,
): Promise<string> {
  const innerHex = innerHashHex(isPrivate, newDataHash, oldDataHash, nonce);
  // message is the hex string of `inner` (lowercase, 0x-prefixed)
  const msg = ethers.toUtf8Bytes(innerHex);
  return signer.signMessage(msg);
}

/**
 * Build a proof byte blob matching the Solidity byte layout.
 */
function encodeProof(params: {
  indicator: number;
  signature: string;
  nonce: string;
  newDataHash: string;
  oldDataHash?: string;
  sealedKey?: string;
}): string {
  const parts: string[] = [];
  parts.push(ethers.solidityPacked(["uint8"], [params.indicator]));
  parts.push(params.signature);
  parts.push(params.nonce);
  parts.push(params.newDataHash);
  const isPrivate = (params.indicator & 0x40) !== 0;
  if (isPrivate) {
    parts.push(params.oldDataHash ?? ethers.ZeroHash);
    parts.push(params.sealedKey ?? SEAL(0));
  }
  return ethers.concat(parts);
}

describe("Verifier — verifyPreimage", () => {
  it("returns each 32-byte proof as its dataHash and marks valid", async () => {
    const { teeVerifier } = await loadFixture(deployFixture);
    const h1 = HASH(0xaa);
    const h2 = HASH(0xbb);
    const outputs = await teeVerifier.verifyPreimage.staticCall([h1, h2]);
    expect(outputs.length).to.equal(2);
    expect(outputs[0]!.dataHash).to.equal(h1);
    expect(outputs[0]!.isValid).to.equal(true);
    expect(outputs[1]!.dataHash).to.equal(h2);
  });

  it("reverts when a proof isn't exactly 32 bytes", async () => {
    const { teeVerifier } = await loadFixture(deployFixture);
    await expect(teeVerifier.verifyPreimage.staticCall(["0x1234"]))
      .to.be.revertedWithCustomError(teeVerifier, "InvalidDataHashLength")
      .withArgs(2n);
  });
});

describe("Verifier — verifyTransferValidity (public)", () => {
  it("recovers the receiver from a valid TEE public-data proof", async () => {
    const { teeVerifier } = await loadFixture(deployFixture);
    const signer = ethers.Wallet.createRandom();

    const newHash = HASH(0x22);
    const nonce = ethers.randomBytes(48);
    const nonceHex = ethers.hexlify(nonce);

    const sig = await signAccessibility(signer, false, newHash, ethers.ZeroHash, nonceHex);
    const proof = encodeProof({
      indicator: IND_TEE_PUBLIC,
      signature: sig,
      nonce: nonceHex,
      newDataHash: newHash,
    });

    const outputs = await teeVerifier.verifyTransferValidity.staticCall([proof]);
    expect(outputs.length).to.equal(1);
    const out = outputs[0]!;
    expect(out.isValid).to.equal(true);
    expect(out.receiver).to.equal(signer.address);
    expect(out.newDataHash).to.equal(newHash);
    // Public data leaves oldDataHash/sealedKey at defaults.
    expect(out.oldDataHash).to.equal(ethers.ZeroHash);
  });

  it("marks the proof nonce as used after a state-changing call", async () => {
    const { teeVerifier } = await loadFixture(deployFixture);
    const signer = ethers.Wallet.createRandom();
    const newHash = HASH(0x44);
    const nonceHex = ethers.hexlify(ethers.randomBytes(48));

    const sig = await signAccessibility(signer, false, newHash, ethers.ZeroHash, nonceHex);
    const proof = encodeProof({
      indicator: IND_TEE_PUBLIC,
      signature: sig,
      nonce: nonceHex,
      newDataHash: newHash,
    });

    const nonceKey = ethers.keccak256(nonceHex);
    expect(await teeVerifier.isProofUsed(nonceKey)).to.equal(false);

    await (await teeVerifier.verifyTransferValidity([proof])).wait();
    expect(await teeVerifier.isProofUsed(nonceKey)).to.equal(true);

    await expect(teeVerifier.verifyTransferValidity([proof]))
      .to.be.revertedWithCustomError(teeVerifier, "ProofAlreadyUsed")
      .withArgs(nonceKey);
  });

  it("reverts when the proof indicator oracle type doesn't match the verifier", async () => {
    const { teeVerifier } = await loadFixture(deployFixture);
    const signer = ethers.Wallet.createRandom();
    const newHash = HASH(0x55);
    const nonceHex = ethers.hexlify(ethers.randomBytes(48));

    const sig = await signAccessibility(signer, false, newHash, ethers.ZeroHash, nonceHex);
    // ZKP indicator fed to TEE verifier.
    const proof = encodeProof({
      indicator: IND_ZKP_PUBLIC,
      signature: sig,
      nonce: nonceHex,
      newDataHash: newHash,
    });

    await expect(teeVerifier.verifyTransferValidity.staticCall([proof]))
      .to.be.revertedWithCustomError(teeVerifier, "OracleTypeMismatch");
  });

  it("reverts on a proof shorter than the public minimum", async () => {
    const { teeVerifier } = await loadFixture(deployFixture);
    await expect(teeVerifier.verifyTransferValidity.staticCall(["0x00"]))
      .to.be.revertedWithCustomError(teeVerifier, "InvalidProofLength")
      .withArgs(1n);
  });
});

describe("Verifier — verifyTransferValidity (private)", () => {
  it("extracts oldDataHash, sealedKey, and receiver from a valid private proof", async () => {
    const { teeVerifier } = await loadFixture(deployFixture);
    const signer = ethers.Wallet.createRandom();

    const oldHash = HASH(0x11);
    const newHash = HASH(0x22);
    const sealed = SEAL(0x33);
    const nonceHex = ethers.hexlify(ethers.randomBytes(48));

    const sig = await signAccessibility(signer, true, newHash, oldHash, nonceHex);
    const proof = encodeProof({
      indicator: IND_TEE_PRIVATE,
      signature: sig,
      nonce: nonceHex,
      newDataHash: newHash,
      oldDataHash: oldHash,
      sealedKey: sealed,
    });

    const outputs = await teeVerifier.verifyTransferValidity.staticCall([proof]);
    const out = outputs[0]!;
    expect(out.isValid).to.equal(true);
    expect(out.receiver).to.equal(signer.address);
    expect(out.oldDataHash).to.equal(oldHash);
    expect(out.newDataHash).to.equal(newHash);
    expect(out.sealedKey).to.equal(sealed);
  });

  it("reverts when a private proof is too short", async () => {
    const { teeVerifier } = await loadFixture(deployFixture);
    const signer = ethers.Wallet.createRandom();
    const newHash = HASH(0x66);
    const nonceHex = ethers.hexlify(ethers.randomBytes(48));
    const sig = await signAccessibility(signer, true, newHash, HASH(0x77), nonceHex);
    // Encode as private but then chop off the sealedKey.
    const full = encodeProof({
      indicator: IND_TEE_PRIVATE,
      signature: sig,
      nonce: nonceHex,
      newDataHash: newHash,
      oldDataHash: HASH(0x77),
      sealedKey: SEAL(0xff),
    });
    const truncated = ethers.dataSlice(full, 0, 180); // below PROOF_LEN_PRIVATE_MIN (190)

    await expect(teeVerifier.verifyTransferValidity.staticCall([truncated]))
      .to.be.revertedWithCustomError(teeVerifier, "InvalidProofLength");
  });
});

describe("Verifier — ZKP variant", () => {
  it("accepts a ZKP-indicator proof when deployed with VerifierType.ZKP", async () => {
    const { zkpVerifier } = await loadFixture(deployFixture);
    const signer = ethers.Wallet.createRandom();
    const newHash = HASH(0x88);
    const nonceHex = ethers.hexlify(ethers.randomBytes(48));

    const sig = await signAccessibility(signer, false, newHash, ethers.ZeroHash, nonceHex);
    const proof = encodeProof({
      indicator: IND_ZKP_PUBLIC,
      signature: sig,
      nonce: nonceHex,
      newDataHash: newHash,
    });

    const outputs = await zkpVerifier.verifyTransferValidity.staticCall([proof]);
    const out = outputs[0]!;
    expect(out.isValid).to.equal(true);
    expect(out.receiver).to.equal(signer.address);
  });
});
