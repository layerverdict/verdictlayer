/**
 * Flight-delay oracle for the ParametricInsurance app.
 *
 * Calls AviationStack `/v1/flights` for a single flight on a single
 * day, normalises the response into a canonical snapshot document, and
 * uploads it to 0G Storage so the judge agent can read it as evidence.
 *
 * The snapshot is deliberately minimal — only the fields a parametric
 * judge needs (delays, departure/arrival times, status). We serialise
 * with sorted keys so the root hash is reproducible: same flight + same
 * day always yields the same root hash, regardless of extraneous
 * AviationStack noise.
 */

import { logger } from "../lib/logger.js";
import { uploadBuffer } from "./storage.js";

const ENDPOINT = "http://api.aviationstack.com/v1/flights";

export interface FlightSnapshot {
  source: "aviationstack";
  fetchedAt: string; // ISO 8601 UTC
  query: {
    flightIata: string;
    flightDate: string; // YYYY-MM-DD
  };
  flight: {
    iata: string;
    icao: string | null;
    number: string | null;
  };
  airline: {
    name: string | null;
    iata: string | null;
  };
  departure: {
    airport: string | null;
    iata: string | null;
    scheduled: string | null;
    estimated: string | null;
    actual: string | null;
    delayMinutes: number | null;
  };
  arrival: {
    airport: string | null;
    iata: string | null;
    scheduled: string | null;
    estimated: string | null;
    actual: string | null;
    delayMinutes: number | null;
  };
  status: string | null;
}

export interface FlightSnapshotResult {
  rootHash: `0x${string}`;
  txHash: string;
  snapshot: FlightSnapshot;
}

export class OracleDisabledError extends Error {
  constructor() {
    super("AVIATIONSTACK_API_KEY is not set");
    this.name = "OracleDisabledError";
  }
}

export class OracleNotFoundError extends Error {
  constructor(flightIata: string, flightDate: string) {
    super(`no flight found for ${flightIata} on ${flightDate}`);
    this.name = "OracleNotFoundError";
  }
}

function normaliseInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normaliseString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

/**
 * Serialise a JS value with sorted object keys. Matches the root hash
 * of a prior snapshot for the same input, even if AviationStack
 * reorders its JSON keys between calls.
 */
function stringifyDeterministic(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const keys = Object.keys(v as Record<string, unknown>).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = walk((v as Record<string, unknown>)[k]);
    return out;
  };

  return JSON.stringify(walk(value));
}

export async function fetchFlightSnapshot(
  flightIata: string,
  flightDate: string,
): Promise<FlightSnapshot> {
  // Read the key fresh each call: the config module snapshots env at
  // import time, but the oracle key is the only env var we mutate from
  // tests, and reading here keeps the module importable even when the
  // key isn't configured.
  const apiKey = process.env.AVIATIONSTACK_API_KEY?.trim();
  if (!apiKey) throw new OracleDisabledError();

  if (!/^[A-Z0-9]{3,8}$/.test(flightIata)) {
    throw new Error("flightIata must be 3-8 alphanumeric characters (e.g. AA123)");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
    throw new Error("flightDate must be YYYY-MM-DD");
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("access_key", apiKey);
  url.searchParams.set("flight_iata", flightIata);
  url.searchParams.set("flight_date", flightDate);
  url.searchParams.set("limit", "1");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: ac.signal });
  } catch (err) {
    throw new Error(`aviationstack fetch failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`aviationstack returned ${res.status}`);
  }

  const body = (await res.json()) as {
    error?: { code?: string; message?: string };
    data?: Array<Record<string, unknown>>;
  };

  if (body.error) {
    throw new Error(`aviationstack error: ${body.error.message ?? body.error.code}`);
  }

  const entry = body.data?.[0];
  if (!entry) throw new OracleNotFoundError(flightIata, flightDate);

  const flight = (entry.flight as Record<string, unknown>) ?? {};
  const airline = (entry.airline as Record<string, unknown>) ?? {};
  const departure = (entry.departure as Record<string, unknown>) ?? {};
  const arrival = (entry.arrival as Record<string, unknown>) ?? {};

  return {
    source: "aviationstack",
    fetchedAt: new Date().toISOString(),
    query: { flightIata, flightDate },
    flight: {
      iata: normaliseString(flight.iata) ?? flightIata,
      icao: normaliseString(flight.icao),
      number: normaliseString(flight.number),
    },
    airline: {
      name: normaliseString(airline.name),
      iata: normaliseString(airline.iata),
    },
    departure: {
      airport: normaliseString(departure.airport),
      iata: normaliseString(departure.iata),
      scheduled: normaliseString(departure.scheduled),
      estimated: normaliseString(departure.estimated),
      actual: normaliseString(departure.actual),
      delayMinutes: normaliseInt(departure.delay),
    },
    arrival: {
      airport: normaliseString(arrival.airport),
      iata: normaliseString(arrival.iata),
      scheduled: normaliseString(arrival.scheduled),
      estimated: normaliseString(arrival.estimated),
      actual: normaliseString(arrival.actual),
      delayMinutes: normaliseInt(arrival.delay),
    },
    status: normaliseString(entry.flight_status),
  };
}

export async function fetchAndUploadFlightSnapshot(
  flightIata: string,
  flightDate: string,
): Promise<FlightSnapshotResult> {
  const snapshot = await fetchFlightSnapshot(flightIata, flightDate);
  const body = Buffer.from(stringifyDeterministic(snapshot), "utf8");
  const label = `flight-${flightIata}-${flightDate}.json`;
  const upload = await uploadBuffer(body, label);
  logger.info(
    { flightIata, flightDate, rootHash: upload.rootHash, size: upload.size },
    "flight snapshot uploaded",
  );
  return { rootHash: upload.rootHash, txHash: upload.txHash, snapshot };
}
