import { describe, expect, it } from "vitest";

import { sanitiseLabel } from "./storage.js";

describe("sanitiseLabel", () => {
  it("replaces path separators and keeps alphanumerics", () => {
    expect(sanitiseLabel("../etc/passwd")).toBe(".._etc_passwd");
  });

  it("caps length and substitutes empty labels", () => {
    expect(sanitiseLabel("")).toBe("blob");
    const long = "a".repeat(200);
    expect(sanitiseLabel(long).length).toBe(64);
  });

  it("preserves dots/dashes/underscores for human-readable filenames", () => {
    expect(sanitiseLabel("evidence-2024_01.pdf")).toBe("evidence-2024_01.pdf");
  });

  it("strips slashes and other path separators", () => {
    expect(sanitiseLabel("a/b\\c:d")).toBe("a_b_c_d");
  });
});
