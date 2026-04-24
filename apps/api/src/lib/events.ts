/**
 * SSE event bus.
 *
 * In-memory EventEmitter keyed by assertionId. Judgment and indexer jobs
 * publish tokens + status updates here; the `/api/verdict/:id/stream`
 * route subscribes and pipes tokens back to the browser.
 *
 * For a single-process deployment this is fine. When we scale to
 * multiple API instances we'll replace this with Redis pub/sub on
 * channel `verdict:<id>` — the API surface (`subscribe`, `publish`) is
 * intentionally narrow to make that swap drop-in.
 */

import { EventEmitter } from "node:events";

export type EventKind =
  | "token"
  | "status"
  | "outcome"
  | "error"
  | "done";

export interface VerdictEvent {
  kind: EventKind;
  payload: unknown;
  ts: number;
}

class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Streams spawn one listener per open SSE connection; lift the cap.
    this.emitter.setMaxListeners(0);
  }

  publish(assertionId: string, event: Omit<VerdictEvent, "ts">) {
    this.emitter.emit(assertionId, { ...event, ts: Date.now() });
  }

  subscribe(assertionId: string, handler: (event: VerdictEvent) => void): () => void {
    this.emitter.on(assertionId, handler);
    return () => this.emitter.off(assertionId, handler);
  }
}

export const eventBus = new EventBus();
