import { describe, expect, it, vi } from "vitest";

import { eventBus } from "./events.js";

describe("eventBus", () => {
  it("delivers published events to subscribers keyed by assertionId", () => {
    const id = "0xabc";
    const handler = vi.fn();
    const unsubscribe = eventBus.subscribe(id, handler);

    eventBus.publish(id, { kind: "token", payload: "hi" });
    expect(handler).toHaveBeenCalledOnce();
    const event = handler.mock.calls[0]?.[0];
    expect(event.kind).toBe("token");
    expect(event.payload).toBe("hi");
    expect(typeof event.ts).toBe("number");

    unsubscribe();
    eventBus.publish(id, { kind: "token", payload: "ignored" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("scopes subscriptions by assertion id", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    eventBus.subscribe("0x1", h1);
    eventBus.subscribe("0x2", h2);

    eventBus.publish("0x1", { kind: "done", payload: null });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).not.toHaveBeenCalled();
  });
});
