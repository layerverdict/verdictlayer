"use client";

import type { AssertionOutcomeLabel } from "@verdict/shared/types";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiBaseUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OutcomeBadge } from "@/components/verdict/outcome-badge";
import { truncateHash } from "@/lib/format";
import { explorerTx, zgMainnet } from "@/lib/web3/chains";

type StreamEvent =
  | { kind: "status"; data: { status: string; message?: string } }
  | { kind: "token"; data: { token: string } }
  | {
      kind: "outcome";
      data: {
        assertionId: string;
        outcome: Exclude<AssertionOutcomeLabel, "PENDING">;
        confidence?: number;
        reasoningRoot?: string;
        verdictTx?: string;
        providerAddress?: string;
        model?: string;
        latencyMs?: number;
        chatId?: string;
        evidenceCited?: string[];
        replay?: boolean;
      };
    }
  | { kind: "error"; data: { message?: string } }
  | { kind: "done"; data: { replay?: boolean } };

interface ReasoningStreamProps {
  assertionId: `0x${string}`;
  onDone?: () => void;
}

export function ReasoningStream({ assertionId, onDone }: ReasoningStreamProps) {
  const [tokens, setTokens] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const [outcome, setOutcome] = useState<StreamEvent["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const url = `${apiBaseUrl}/api/verdict/${assertionId}/stream`;
    const es = new EventSource(url);

    const handle = (kind: StreamEvent["kind"]) => (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as { payload: unknown };
        const payload = parsed.payload;
        if (kind === "token") {
          const text = typeof payload === "string"
            ? payload
            : payload && typeof payload === "object" && "token" in payload
              ? (payload as { token: string }).token
              : null;
          if (text) setTokens((prev) => [...prev, text]);
        } else if (kind === "status") {
          const phase = payload && typeof payload === "object" && "phase" in payload
            ? (payload as { phase: string }).phase
            : typeof payload === "string"
              ? payload
              : null;
          if (phase) setStatus(phase);
        } else if (kind === "outcome") {
          setOutcome(payload as StreamEvent["data"]);
        } else if (kind === "error") {
          const message = payload && typeof payload === "object" && "message" in payload
            ? (payload as { message: string }).message
            : typeof payload === "string"
              ? payload
              : "Unknown error";
          setError(message);
        }
      } catch {
        // ignore malformed frames
      }
    };

    es.addEventListener("status", handle("status") as EventListener);
    es.addEventListener("token", handle("token") as EventListener);
    es.addEventListener("outcome", handle("outcome") as EventListener);
    es.addEventListener("error", handle("error") as EventListener);
    es.addEventListener("done", () => {
      es.close();
      onDoneRef.current?.();
    });
    es.onerror = () => {
      // Browser will auto-retry unless we explicitly close.
    };

    return () => es.close();
  }, [assertionId]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [tokens]);

  const transcript = useMemo(() => tokens.join(""), [tokens]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-4 border-b border-white/5">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-3 text-base">
            TEE Judge · streaming reasoning
            {outcome ? (
              <OutcomeBadge
                outcome={
                  (outcome as { outcome?: AssertionOutcomeLabel }).outcome ?? "PENDING"
                }
              />
            ) : (
              <Badge variant="outline" className="gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                {status}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="font-mono text-[11px]">
            assertion · {truncateHash(assertionId, 10, 6)}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div
          ref={transcriptRef}
          aria-live="polite"
          aria-label="Judge reasoning transcript"
          className="max-h-[60vh] min-h-[260px] overflow-y-auto px-6 py-6 font-mono text-sm leading-relaxed text-white/80"
        >
          <AnimatePresence initial={false}>
            {transcript.length === 0 && !outcome ? (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-white/30"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-white/40" />
                Waiting for the judge to start thinking…
              </motion.div>
            ) : null}
          </AnimatePresence>
          {transcript ? (
            <pre className="whitespace-pre-wrap font-mono text-sm text-white/80">
              {transcript}
              {!outcome ? (
                <span className="ml-0.5 inline-block animate-pulse text-white/40">
                  ▋
                </span>
              ) : null}
            </pre>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        {outcome ? (
          <div className="space-y-3 border-t border-white/10 bg-white/[0.02] px-6 py-4">
            <div className="grid gap-3 text-xs text-white/50 sm:grid-cols-2">
              {"model" in outcome && outcome.model ? (
                <div>
                  TEE judge
                  <div className="font-mono text-white/80">{outcome.model}</div>
                </div>
              ) : null}
              {"latencyMs" in outcome &&
              typeof outcome.latencyMs === "number" ? (
                <div>
                  Inference latency
                  <div className="font-mono text-white/80">
                    {(outcome.latencyMs / 1000).toFixed(2)}s
                  </div>
                </div>
              ) : null}
              {"confidence" in outcome &&
              typeof outcome.confidence === "number" ? (
                <div>
                  Confidence
                  <div className="font-mono text-white/80">
                    {outcome.confidence.toFixed(2)}
                  </div>
                </div>
              ) : null}
              {"providerAddress" in outcome && outcome.providerAddress ? (
                <div>
                  Provider
                  <div className="font-mono text-white/60 break-all">
                    {truncateHash(outcome.providerAddress, 8, 6)}
                  </div>
                </div>
              ) : null}
              {"reasoningRoot" in outcome && outcome.reasoningRoot ? (
                <div className="sm:col-span-2">
                  Reasoning root (on 0G Storage)
                  <div className="font-mono text-white/70 break-all">
                    {outcome.reasoningRoot}
                  </div>
                </div>
              ) : null}
              {"verdictTx" in outcome && outcome.verdictTx ? (
                <div className="sm:col-span-2">
                  Verdict submitted on-chain
                  <a
                    href={explorerTx(zgMainnet.id, outcome.verdictTx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block font-mono text-white/70 underline decoration-white/20 underline-offset-2 hover:text-white hover:decoration-white/60"
                    title="View on 0G Chain Scan"
                  >
                    {truncateHash(outcome.verdictTx, 12, 10)} ↗
                  </a>
                </div>
              ) : null}
            </div>

            {"evidenceCited" in outcome &&
            Array.isArray(outcome.evidenceCited) &&
            outcome.evidenceCited.length > 0 ? (
              <div className="text-xs text-white/50">
                Evidence cited by the judge
                <ul className="mt-1 space-y-1">
                  {outcome.evidenceCited.map((c) => (
                    <li
                      key={c}
                      className="font-mono text-[11px] text-white/60 break-all"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
