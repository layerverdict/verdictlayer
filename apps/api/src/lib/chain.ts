/**
 * Chain layer.
 *
 * Owns the singleton ethers v6 provider + backend hot-signer, exposes
 * typed contract instances for the Verdict protocol. Addresses come from
 * the deployment manifest produced by `apps/contracts/scripts/deploy.ts`
 * (read via `@verdict/shared/deployments`).
 *
 * Design:
 *   - One provider per process (JSON-RPC polling).
 *   - One signer, used for submitting verdicts and (in development) for
 *     acting as judge relayer. In production the relayer is a separate
 *     address but still shares RPC.
 *   - Contracts are returned pre-connected to the signer so write methods
 *     just work; read-only queries can use `.connect(provider)`.
 */

import { ethers, type Contract } from "ethers";
import {
  loadAbi,
  loadDeployment,
  type DeploymentManifest,
} from "@verdict/shared";
import { config } from "../config.js";

let cachedProvider: ethers.JsonRpcProvider | undefined;
let cachedSigner: ethers.Wallet | undefined;
let cachedDeployment: DeploymentManifest | undefined;
let cachedContracts: ChainContracts | undefined;

export interface ChainContracts {
  assertionRegistry: Contract;
  verdictEnforcer: Contract;
  escalationManager: Contract;
  reputationRegistry: Contract;
  escrow: Contract;
  parametricInsurance: Contract;
  milestoneVault: Contract;
  authenticityCertifier: Contract;
}

export function getProvider(): ethers.JsonRpcProvider {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID, {
      staticNetwork: true,
    });
  }
  return cachedProvider;
}

export function getSigner(): ethers.Wallet {
  if (!cachedSigner) {
    cachedSigner = new ethers.Wallet(config.PRIVATE_KEY, getProvider());
  }
  return cachedSigner;
}

export async function getDeployment(): Promise<DeploymentManifest> {
  if (!cachedDeployment) {
    cachedDeployment = await loadDeployment(config.CHAIN_ID);
  }
  return cachedDeployment;
}

export async function getContracts(): Promise<ChainContracts> {
  if (cachedContracts) return cachedContracts;

  const [manifest, assertionAbi, enforcerAbi, escalationAbi, reputationAbi, escrowAbi, insuranceAbi, vaultAbi, certifierAbi] =
    await Promise.all([
      getDeployment(),
      loadAbi("AssertionRegistry"),
      loadAbi("VerdictEnforcer"),
      loadAbi("EscalationManager"),
      loadAbi("ReputationRegistry"),
      loadAbi("Escrow"),
      loadAbi("ParametricInsurance"),
      loadAbi("MilestoneVault"),
      loadAbi("AuthenticityCertifier"),
    ]);

  const signer = getSigner();
  const c: ChainContracts = {
    assertionRegistry: new ethers.Contract(manifest.contracts.assertionRegistry, assertionAbi as ethers.InterfaceAbi, signer),
    verdictEnforcer: new ethers.Contract(manifest.contracts.verdictEnforcer, enforcerAbi as ethers.InterfaceAbi, signer),
    escalationManager: new ethers.Contract(manifest.contracts.escalationManager, escalationAbi as ethers.InterfaceAbi, signer),
    reputationRegistry: new ethers.Contract(manifest.contracts.reputationRegistry, reputationAbi as ethers.InterfaceAbi, signer),
    escrow: new ethers.Contract(manifest.contracts.escrow, escrowAbi as ethers.InterfaceAbi, signer),
    parametricInsurance: new ethers.Contract(manifest.contracts.parametricInsurance, insuranceAbi as ethers.InterfaceAbi, signer),
    milestoneVault: new ethers.Contract(manifest.contracts.milestoneVault, vaultAbi as ethers.InterfaceAbi, signer),
    authenticityCertifier: new ethers.Contract(manifest.contracts.authenticityCertifier, certifierAbi as ethers.InterfaceAbi, signer),
  };

  cachedContracts = c;
  return c;
}

/**
 * Reset the chain layer. Test-only — in production the singletons are
 * stable for the process lifetime.
 */
export function __resetChainClients() {
  cachedProvider = undefined;
  cachedSigner = undefined;
  cachedDeployment = undefined;
  cachedContracts = undefined;
}
