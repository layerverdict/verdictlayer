"use client";

import { Plane } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, fetchFlightSnapshot, type FlightSnapshot } from "@/lib/api";
import { toLocalDateValue } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FlightOracleProps {
  uploader: `0x${string}`;
  assertionId?: `0x${string}`;
  onSnapshot(result: { rootHash: `0x${string}`; snapshot: FlightSnapshot }): void;
  /** Suggested default (e.g. policy creation date + flight number). */
  defaultFlightIata?: string;
  defaultFlightDate?: string;
}

/**
 * Flight-delay oracle: calls AviationStack via the backend, uploads the
 * resulting canonical snapshot to 0G Storage, and hands the root hash
 * back to the caller. Used by the Insurance claim dialog as an
 * alternative to an explicit file upload.
 */
export function FlightOracle({
  uploader,
  assertionId,
  onSnapshot,
  defaultFlightIata,
  defaultFlightDate,
}: FlightOracleProps) {
  const [flightIata, setFlightIata] = useState(defaultFlightIata ?? "");
  const [flightDate, setFlightDate] = useState(
    defaultFlightDate ?? toLocalDateValue(new Date()),
  );
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<{
    rootHash: `0x${string}`;
    snapshot: FlightSnapshot;
  } | null>(null);

  async function onFetch(e: FormEvent) {
    e.preventDefault();
    const iata = flightIata.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,8}$/.test(iata)) {
      toast.error("Flight code looks off — use IATA form like AA123");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
      toast.error("Flight date must be YYYY-MM-DD");
      return;
    }

    try {
      setFetching(true);
      const res = await fetchFlightSnapshot({
        flightIata: iata,
        flightDate,
        uploader,
        assertionId,
      });
      setResult({ rootHash: res.rootHash, snapshot: res.snapshot });
      onSnapshot({ rootHash: res.rootHash, snapshot: res.snapshot });
      toast.success("Flight snapshot anchored to 0G Storage", {
        description: res.rootHash.slice(0, 18) + "…",
      });
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Oracle fetch failed");
      }
    } finally {
      setFetching(false);
    }
  }

  if (result) {
    const delay =
      result.snapshot.departure.delayMinutes ??
      result.snapshot.arrival.delayMinutes ??
      null;
    return (
      <div className="space-y-3 rounded-xl border border-green-400/30 bg-green-400/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-green-200">
              <Plane className="h-4 w-4" />
              {result.snapshot.flight.iata} · {result.snapshot.query.flightDate}
            </div>
            <div className="font-mono text-xs text-white/60">{result.rootHash}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              setResult(null);
            }}
          >
            Re-fetch
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-white/70">
          <div>
            <dt className="text-white/40">Status</dt>
            <dd className="capitalize">{result.snapshot.status ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-white/40">Delay</dt>
            <dd>{delay !== null ? `${delay} min` : "—"}</dd>
          </div>
          <div>
            <dt className="text-white/40">Departure</dt>
            <dd>
              {result.snapshot.departure.iata ?? "—"}
              {result.snapshot.departure.actual
                ? ` · actual ${new Date(result.snapshot.departure.actual).toUTCString()}`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="text-white/40">Arrival</dt>
            <dd>
              {result.snapshot.arrival.iata ?? "—"}
              {result.snapshot.arrival.actual
                ? ` · actual ${new Date(result.snapshot.arrival.actual).toUTCString()}`
                : ""}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <form onSubmit={onFetch} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
        <div className="space-y-1.5">
          <Label htmlFor="flight-iata">Flight code (IATA)</Label>
          <Input
            id="flight-iata"
            placeholder="AA123"
            value={flightIata}
            onChange={(e) => setFlightIata(e.target.value)}
            className="font-mono uppercase"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="flight-date">Date</Label>
          <Input
            id="flight-date"
            type="date"
            value={flightDate}
            onChange={(e) => setFlightDate(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={fetching} className={cn("w-full")}>
        {fetching ? "Fetching snapshot…" : "Fetch snapshot from AviationStack"}
      </Button>
      <p className="text-xs text-white/40">
        The backend pulls the flight&apos;s status, uploads a canonical JSON to 0G
        Storage, and returns a root hash you can use as claim evidence.
      </p>
    </form>
  );
}
