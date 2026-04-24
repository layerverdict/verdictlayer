/**
 * Callback-address → app-slug router.
 *
 * Assertion rows coming from the API expose their callback contract;
 * we use it to attribute an assertion to one of the four applications.
 */

import { maybeContractAddress } from "./addresses";

export type AppSlug = "escrow" | "insurance" | "milestones" | "authenticity" | "unknown";

export const APP_LABEL: Record<AppSlug, string> = {
  escrow: "Escrow",
  insurance: "Insurance",
  milestones: "Milestones",
  authenticity: "Authenticity",
  unknown: "Unknown",
};

export function appSlugForCallback(callback: string): AppSlug {
  const c = callback.toLowerCase();
  const escrow = maybeContractAddress("escrow")?.toLowerCase();
  const insurance = maybeContractAddress("parametricInsurance")?.toLowerCase();
  const milestones = maybeContractAddress("milestoneVault")?.toLowerCase();
  const authenticity = maybeContractAddress("authenticityCertifier")?.toLowerCase();

  if (escrow && c === escrow) return "escrow";
  if (insurance && c === insurance) return "insurance";
  if (milestones && c === milestones) return "milestones";
  if (authenticity && c === authenticity) return "authenticity";
  return "unknown";
}
