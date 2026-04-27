/**
 * Fastify API client.
 *
 * All HTTP calls go through `api()` so error handling, auth, and SWR
 * integration live in one place.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorFrom(res: Response, body: unknown): ApiError {
  const message =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : res.statusText || `HTTP ${res.status}`;
  return new ApiError(res.status, message, body);
}

export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await parseBody(res);
  if (!res.ok) throw errorFrom(res, body);
  return body as T;
}

export async function upload<T = unknown>(
  path: string,
  form: FormData,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    body: form,
  });
  const body = await parseBody(res);
  if (!res.ok) throw errorFrom(res, body);
  return body as T;
}

export const apiBaseUrl = BASE_URL;

// SWR fetcher — the default.
export const fetcher = <T = unknown>(path: string) => api<T>(path);

/**
 * Attach a previously-uploaded raw evidence row (`assertionId === null`)
 * to an assertion, typically once the on-chain tx has confirmed and the
 * indexer has mirrored the AssertionCreated event.
 *
 * Retries a couple of times with backoff because the indexer lag between
 * tx confirmation and the event landing in Postgres can be a few seconds.
 */
export async function attachEvidence(input: {
  rootHash: `0x${string}`;
  assertionId: `0x${string}`;
  uploader: `0x${string}`;
}): Promise<{ attached: number }> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await api<{ attached: number }>("/api/evidence/attach", {
        method: "POST",
        body: JSON.stringify(input),
      });
    } catch (err) {
      const isLag = err instanceof ApiError && err.status === 409;
      if (isLag && attempt < maxAttempts) {
        // Indexer hasn't caught up yet — wait a bit and retry.
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error("attachEvidence exhausted retries");
}

export interface ApiFeatures {
  oracles: {
    flight: boolean;
  };
}

export async function getFeatures(): Promise<ApiFeatures> {
  return api<ApiFeatures>("/features");
}

export interface FlightSnapshot {
  source: "aviationstack";
  fetchedAt: string;
  query: { flightIata: string; flightDate: string };
  flight: { iata: string; icao: string | null; number: string | null };
  airline: { name: string | null; iata: string | null };
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

export interface FlightSnapshotResponse {
  rootHash: `0x${string}`;
  txHash: string;
  snapshot: FlightSnapshot;
}

export async function fetchFlightSnapshot(input: {
  flightIata: string;
  flightDate: string;
  uploader: `0x${string}`;
  assertionId?: `0x${string}`;
}): Promise<FlightSnapshotResponse> {
  return api<FlightSnapshotResponse>("/api/oracle/flight", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
