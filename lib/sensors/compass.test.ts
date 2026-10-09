import { describe, expect, it } from "vitest";
import { normalizeHeading, shortestAngleDelta } from "./compass";

describe("compass math", () => {
  it("normalizes headings and follows the short path across north", () => {
    expect(normalizeHeading(-10)).toBe(350);
    expect(normalizeHeading(370)).toBe(10);
    expect(shortestAngleDelta(350, 10)).toBe(20);
    expect(shortestAngleDelta(10, 350)).toBe(-20);
  });
});
