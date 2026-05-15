import { formatUnits } from "viem";

/** Canonical empty bytes32 — used as the "unset" sentinel in every
 *  Verdict contract struct (deliveryEvidence, assertionId, …). */
export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export function isZeroHash(value: string | null | undefined): boolean {
  return !value || value.toLowerCase() === ZERO_BYTES32;
}

export function truncateHash(value: string, head = 6, tail = 4): string {
  if (!value) return "";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function truncateAddress(value: string, chars = 4): string {
  if (!value) return "";
  return `${value.slice(0, 2 + chars)}…${value.slice(-chars)}`;
}

export function formatAmount(
  wei: bigint | string | number,
  decimals = 18,
  fractionDigits = 4,
): string {
  const bi = typeof wei === "bigint" ? wei : BigInt(wei);
  const formatted = formatUnits(bi, decimals);
  const [whole, frac = ""] = formatted.split(".");
  if (!frac) return whole ?? "0";
  const trimmed = frac.slice(0, fractionDigits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : (whole ?? "0");
}

export function formatTimestamp(ts: string | number | Date): string {
  const date = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Returns a `YYYY-MM-DDTHH:mm` string in the user's local timezone,
 * suitable for `<input type="datetime-local">` default values.
 */
export function toLocalDatetimeValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

/**
 * Returns a `YYYY-MM-DD` string in the user's local timezone,
 * suitable for `<input type="date">` default values.
 */
export function toLocalDateValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatRelative(ts: string | number | Date): string {
  const date = ts instanceof Date ? ts : new Date(ts);
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
    ["second", 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return "just now";
}
