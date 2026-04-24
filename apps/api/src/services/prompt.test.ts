import { describe, expect, it } from "vitest";

import { buildUserPrompt, parseJudgeDecision } from "./prompt.js";

const H = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as `0x${string}`;
const ASSERTER = ("0x" + "1".repeat(40)) as `0x${string}`;

describe("buildUserPrompt", () => {
  it("renders claim + evidence hashes with mime annotations", () => {
    const prompt = buildUserPrompt({
      claim: "The sky is blue",
      mode: "INSTANT",
      asserter: ASSERTER,
      evidence: [
        {
          rootHash: H(1),
          mime: "text/plain",
          size: 11,
          uploader: ASSERTER,
          content: "hello world",
        },
        {
          rootHash: H(2),
          mime: "image/png",
          size: 124_000,
          uploader: ASSERTER,
          contentNote: "image/png, 124000 bytes",
        },
      ],
    });

    expect(prompt).toContain("CLAIM:");
    expect(prompt).toContain("The sky is blue");
    expect(prompt).toContain(H(1));
    expect(prompt).toContain("hello world");
    expect(prompt).toContain(H(2));
    expect(prompt).toContain("[image/png, 124000 bytes]");
    expect(prompt).toContain("INSTANT");
  });

  it("notes the absence of evidence", () => {
    const prompt = buildUserPrompt({
      claim: "empty",
      mode: "AUDITED",
      asserter: ASSERTER,
      evidence: [],
    });
    expect(prompt).toContain("(no evidence provided)");
  });
});

describe("parseJudgeDecision", () => {
  it("extracts trailing JSON without fences", () => {
    const completion = [
      "The facts show mobile layout is broken...",
      '{"outcome":"FALSE","confidence":0.92,"evidenceCited":["' + H(3) + '"]}',
    ].join("\n");
    const d = parseJudgeDecision(completion);
    expect(d.outcome).toBe("FALSE");
    expect(d.confidence).toBe(0.92);
    expect(d.evidenceCited).toEqual([H(3)]);
  });

  it("tolerates markdown-fenced JSON", () => {
    const completion = [
      "Analysis complete.",
      "```json",
      '{"outcome":"TRUE","confidence":0.5,"evidenceCited":[]}',
      "```",
    ].join("\n");
    const d = parseJudgeDecision(completion);
    expect(d.outcome).toBe("TRUE");
    expect(d.confidence).toBe(0.5);
    expect(d.evidenceCited).toEqual([]);
  });

  it("rejects decisions with an unknown outcome", () => {
    const bad = '{"outcome":"MAYBE","confidence":1,"evidenceCited":[]}';
    expect(() => parseJudgeDecision(bad)).toThrow(/expected schema/);
  });

  it("rejects decisions whose confidence is out of range", () => {
    const bad = '{"outcome":"TRUE","confidence":2,"evidenceCited":[]}';
    expect(() => parseJudgeDecision(bad)).toThrow(/expected schema/);
  });

  it("rejects evidence hashes of wrong length", () => {
    const bad = '{"outcome":"TRUE","confidence":0.5,"evidenceCited":["0xabc"]}';
    expect(() => parseJudgeDecision(bad)).toThrow(/expected schema/);
  });

  it("rejects completions without a JSON block", () => {
    expect(() => parseJudgeDecision("no json at all")).toThrow(/missing trailing JSON/);
  });
});
