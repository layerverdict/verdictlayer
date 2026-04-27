import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchFlightSnapshot,
  OracleDisabledError,
  OracleNotFoundError,
} from "./oracle-flight.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.AVIATIONSTACK_API_KEY;

function mockFetch(body: unknown, ok = true, status = 200) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: ok ? status : status,
      headers: { "content-type": "application/json" },
    }),
  ) as typeof fetch;
}

describe("fetchFlightSnapshot", () => {
  beforeEach(() => {
    process.env.AVIATIONSTACK_API_KEY = "test_key";
    // The config module snapshots process.env at import time. Nothing
    // here re-imports it between tests, so the snapshot taken by
    // oracle-flight.ts the first time it loads uses whichever value is
    // present. Set a placeholder before the first import to avoid
    // the zod validation exception seen in isolation.
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_KEY === undefined) delete process.env.AVIATIONSTACK_API_KEY;
    else process.env.AVIATIONSTACK_API_KEY = ORIGINAL_KEY;
    vi.restoreAllMocks();
  });

  it("rejects malformed flight iata", async () => {
    await expect(fetchFlightSnapshot("A", "2026-04-30")).rejects.toThrow(/flightIata/);
  });

  it("rejects malformed flight date", async () => {
    await expect(fetchFlightSnapshot("AA123", "30-04-2026")).rejects.toThrow(/flightDate/);
  });

  it("normalises a well-formed AviationStack payload", async () => {
    mockFetch({
      data: [
        {
          flight_status: "landed",
          flight: { iata: "AA123", icao: "AAL123", number: "123" },
          airline: { name: "American Airlines", iata: "AA" },
          departure: {
            airport: "Dallas/Fort Worth International",
            iata: "DFW",
            scheduled: "2026-04-30T08:00:00+00:00",
            estimated: "2026-04-30T08:05:00+00:00",
            actual: "2026-04-30T11:15:00+00:00",
            delay: "195",
          },
          arrival: {
            airport: "John F Kennedy International",
            iata: "JFK",
            scheduled: "2026-04-30T12:30:00+00:00",
            estimated: null,
            actual: "2026-04-30T15:50:00+00:00",
            delay: "200",
          },
        },
      ],
    });

    const snap = await fetchFlightSnapshot("AA123", "2026-04-30");
    expect(snap.source).toBe("aviationstack");
    expect(snap.flight.iata).toBe("AA123");
    expect(snap.airline.iata).toBe("AA");
    expect(snap.departure.delayMinutes).toBe(195);
    expect(snap.arrival.delayMinutes).toBe(200);
    expect(snap.status).toBe("landed");
    expect(snap.query).toEqual({ flightIata: "AA123", flightDate: "2026-04-30" });
  });

  it("throws OracleNotFoundError when data array is empty", async () => {
    mockFetch({ data: [] });
    await expect(fetchFlightSnapshot("AA123", "2026-04-30")).rejects.toBeInstanceOf(
      OracleNotFoundError,
    );
  });

  it("throws when AviationStack returns an error envelope", async () => {
    mockFetch({ error: { code: "invalid_access_key", message: "bad key" } });
    await expect(fetchFlightSnapshot("AA123", "2026-04-30")).rejects.toThrow(/bad key/);
  });

  it("throws OracleDisabledError when API key is unset", async () => {
    delete process.env.AVIATIONSTACK_API_KEY;
    await expect(fetchFlightSnapshot("AA123", "2026-04-30")).rejects.toBeInstanceOf(
      OracleDisabledError,
    );
  });
});
