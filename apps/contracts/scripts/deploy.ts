import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ethers, network, run } from "hardhat";

/**
 * Verdict protocol deployment script.
 *
 * Deploy order (each depends on the previous):
 *   1. Verifier            (TEE variant; attestation contract can be
 *                          replaced via `updateVerifier` post-deploy)
 *   2. ReputationRegistry  (requires verifier)
 *   3. AssertionRegistry   (requires reputation)
 *   4. VerdictEnforcer     (standalone; roles wired after)
 *   5. EscalationManager   (requires registry + reputation)
 *   6. Four application contracts
 *
 * Role wiring:
 *   - enforcer.authorizeRegistry(registry)
 *   - registry.setEnforcer(enforcer)           → grants ENFORCER_ROLE on enforcer
 *   - registry.grantRole(ENFORCER_ROLE, escalation)
 *   - registry.grantRole(JUDGE_ROLE, judgeRelayer)
 *   - reputation.grantRole(VERDICT_WRITER_ROLE, escalation)
 *   - escalation.grantRole(PANEL_ROLE, judgeRelayer)
 *
 * Emits a deployment manifest at
 *   packages/shared/deployments/<chainId>.json
 * which api + web read via loadDeployment(chainId).
 */

const MANIFEST_DIR = resolve(__dirname, "../../../packages/shared/deployments");

// VerifierType enum mirror.
const VerifierType = { TEE: 0, ZKP: 1 } as const;

interface Manifest {
  chainId: number;
  network: string;
  deployedAt: string;
  deployer: string;
  judgeRelayer: string;
  feeSink: string;
  bonds: {
    escrow: string;
    insurance: string;
    milestoneVault: string;
    authenticity: string;
  };
  contracts: {
    verifier: string;
    reputationRegistry: string;
    assertionRegistry: string;
    verdictEnforcer: string;
    escalationManager: string;
    escrow: string;
    parametricInsurance: string;
    milestoneVault: string;
    authenticityCertifier: string;
  };
}

function pickConfig(chainId: number) {
  // Sensible per-network defaults. Override via env.
  const judgeRelayer = process.env.JUDGE_RELAYER_ADDRESS;
  const feeSink = process.env.FEE_SINK_ADDRESS;
  if (!judgeRelayer) {
    throw new Error(
      "JUDGE_RELAYER_ADDRESS env is required; set it to the backend-signer that submits verdicts.",
    );
  }
  if (!feeSink) {
    throw new Error(
      "FEE_SINK_ADDRESS env is required; set it to the treasury address that collects INVALID bonds.",
    );
  }

  // Attestation contract = the address a Verifier cross-checks. v1 leaves
  // this unset (zero) so the contract falls through to pure signature check.
  const attestationContract =
    process.env.ATTESTATION_CONTRACT ?? ethers.ZeroAddress;

  const tag = chainId === 16661 ? "mainnet" : chainId === 16602 ? "testnet" : "local";

  return {
    judgeRelayer,
    feeSink,
    attestationContract,
    tag,
    // Bonds: small on testnet / local, larger on mainnet. All in wei.
    bonds: {
      escrow: ethers.parseEther(chainId === 16661 ? "0.05" : "0.001"),
      insurance: ethers.parseEther(chainId === 16661 ? "0.01" : "0.0005"),
      milestoneVault: ethers.parseEther(chainId === 16661 ? "0.01" : "0.0005"),
      authenticity: ethers.parseEther(chainId === 16661 ? "0.005" : "0.0001"),
    },
  };
}

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const cfg = pickConfig(chainId);

  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);
  console.log("Chain id      :", chainId, `(${cfg.tag})`);
  console.log("Judge relayer :", cfg.judgeRelayer);
  console.log("Fee sink      :", cfg.feeSink);

  const deployerBal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer bal  :", ethers.formatEther(deployerBal), "0G");

  // 1. Verifier (TEE variant). attestationContract address is stored but
  //    v1 verifier falls through to signature check when zero.
  const VerifierFactory = await ethers.getContractFactory("Verifier");
  const verifier = await VerifierFactory.deploy(
    cfg.attestationContract,
    VerifierType.TEE,
  );
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("  Verifier             →", verifierAddr);

  // 2. ReputationRegistry
  const ReputationFactory = await ethers.getContractFactory("ReputationRegistry");
  const reputation = await ReputationFactory.deploy(
    "Verdict Judges",
    "vJUDGE",
    verifierAddr,
    "https://chainscan.0g.ai",
    chainId === 16661
      ? "https://indexer-storage-turbo.0g.ai"
      : "https://indexer-storage-testnet-turbo.0g.ai",
    deployer.address,
  );
  await reputation.waitForDeployment();
  const reputationAddr = await reputation.getAddress();
  console.log("  ReputationRegistry   →", reputationAddr);

  // 3. AssertionRegistry
  const RegistryFactory = await ethers.getContractFactory("AssertionRegistry");
  const registry = await RegistryFactory.deploy(
    deployer.address,
    cfg.feeSink,
    reputationAddr,
  );
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("  AssertionRegistry    →", registryAddr);

  // 4. VerdictEnforcer
  const EnforcerFactory = await ethers.getContractFactory("VerdictEnforcer");
  const enforcer = await EnforcerFactory.deploy(deployer.address);
  await enforcer.waitForDeployment();
  const enforcerAddr = await enforcer.getAddress();
  console.log("  VerdictEnforcer      →", enforcerAddr);

  // 5. EscalationManager
  const EscalationFactory = await ethers.getContractFactory("EscalationManager");
  const escalation = await EscalationFactory.deploy(
    deployer.address,
    registryAddr,
    reputationAddr,
  );
  await escalation.waitForDeployment();
  const escalationAddr = await escalation.getAddress();
  console.log("  EscalationManager    →", escalationAddr);

  // 6. Application contracts
  const EscrowFactory = await ethers.getContractFactory("Escrow");
  const escrow = await EscrowFactory.deploy(registryAddr, enforcerAddr, cfg.bonds.escrow);
  await escrow.waitForDeployment();
  console.log("  Escrow               →", await escrow.getAddress());

  const InsuranceFactory = await ethers.getContractFactory("ParametricInsurance");
  const insurance = await InsuranceFactory.deploy(
    registryAddr,
    enforcerAddr,
    cfg.bonds.insurance,
  );
  await insurance.waitForDeployment();
  console.log("  ParametricInsurance  →", await insurance.getAddress());

  const VaultFactory = await ethers.getContractFactory("MilestoneVault");
  const vault = await VaultFactory.deploy(
    registryAddr,
    enforcerAddr,
    cfg.bonds.milestoneVault,
  );
  await vault.waitForDeployment();
  console.log("  MilestoneVault       →", await vault.getAddress());

  const CertifierFactory = await ethers.getContractFactory("AuthenticityCertifier");
  const certifier = await CertifierFactory.deploy(
    registryAddr,
    enforcerAddr,
    cfg.bonds.authenticity,
  );
  await certifier.waitForDeployment();
  console.log("  AuthenticityCertifier→", await certifier.getAddress());

  // ── Role wiring ─────────────────────────────────────────────────────
  console.log("Wiring roles…");

  await (await enforcer.authorizeRegistry(registryAddr)).wait();
  await (await registry.setEnforcer(enforcerAddr)).wait();
  await (
    await registry.grantRole(await registry.ENFORCER_ROLE(), escalationAddr)
  ).wait();
  await (
    await registry.grantRole(await registry.JUDGE_ROLE(), cfg.judgeRelayer)
  ).wait();
  await (
    await reputation.grantRole(
      await reputation.VERDICT_WRITER_ROLE(),
      escalationAddr,
    )
  ).wait();
  await (
    await escalation.grantRole(await escalation.PANEL_ROLE(), cfg.judgeRelayer)
  ).wait();
  console.log("  roles wired.");

  // ── Manifest ────────────────────────────────────────────────────────
  const manifest: Manifest = {
    chainId,
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    judgeRelayer: cfg.judgeRelayer,
    feeSink: cfg.feeSink,
    bonds: {
      escrow: cfg.bonds.escrow.toString(),
      insurance: cfg.bonds.insurance.toString(),
      milestoneVault: cfg.bonds.milestoneVault.toString(),
      authenticity: cfg.bonds.authenticity.toString(),
    },
    contracts: {
      verifier: verifierAddr,
      reputationRegistry: reputationAddr,
      assertionRegistry: registryAddr,
      verdictEnforcer: enforcerAddr,
      escalationManager: escalationAddr,
      escrow: await escrow.getAddress(),
      parametricInsurance: await insurance.getAddress(),
      milestoneVault: await vault.getAddress(),
      authenticityCertifier: await certifier.getAddress(),
    },
  };

  if (!existsSync(MANIFEST_DIR)) mkdirSync(MANIFEST_DIR, { recursive: true });
  const manifestPath = resolve(MANIFEST_DIR, `${chainId}.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("\nManifest written:", manifestPath);

  // ── Optional etherscan/chainscan verify on 0G networks ──────────────
  if (process.env.VERIFY === "true" && chainId !== 31337) {
    console.log("Running verify step…");
    const verifyList: { name: string; address: string; args: unknown[] }[] = [
      {
        name: "Verifier",
        address: verifierAddr,
        args: [cfg.attestationContract, VerifierType.TEE],
      },
      {
        name: "ReputationRegistry",
        address: reputationAddr,
        args: [
          "Verdict Judges",
          "vJUDGE",
          verifierAddr,
          "https://chainscan.0g.ai",
          chainId === 16661
            ? "https://indexer-storage-turbo.0g.ai"
            : "https://indexer-storage-testnet-turbo.0g.ai",
          deployer.address,
        ],
      },
      {
        name: "AssertionRegistry",
        address: registryAddr,
        args: [deployer.address, cfg.feeSink, reputationAddr],
      },
      {
        name: "VerdictEnforcer",
        address: enforcerAddr,
        args: [deployer.address],
      },
      {
        name: "EscalationManager",
        address: escalationAddr,
        args: [deployer.address, registryAddr, reputationAddr],
      },
      {
        name: "Escrow",
        address: await escrow.getAddress(),
        args: [registryAddr, enforcerAddr, cfg.bonds.escrow],
      },
      {
        name: "ParametricInsurance",
        address: await insurance.getAddress(),
        args: [registryAddr, enforcerAddr, cfg.bonds.insurance],
      },
      {
        name: "MilestoneVault",
        address: await vault.getAddress(),
        args: [registryAddr, enforcerAddr, cfg.bonds.milestoneVault],
      },
      {
        name: "AuthenticityCertifier",
        address: await certifier.getAddress(),
        args: [registryAddr, enforcerAddr, cfg.bonds.authenticity],
      },
    ];
    for (const v of verifyList) {
      try {
        await run("verify:verify", {
          address: v.address,
          constructorArguments: v.args,
        });
        console.log("  ✓", v.name);
      } catch (err) {
        console.warn("  ✗", v.name, (err as Error).message.slice(0, 120));
      }
    }
  }

  console.log("\n✓ Deployment complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
