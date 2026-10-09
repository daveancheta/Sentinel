import { describe, expect, it } from "vitest";
import { bestMatch, cosineSimilarity } from "./match";

describe("face matching", () => {
  it("computes cosine similarity with safe zero vectors", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });
  it("chooses the highest embedding and applies the threshold", () => {
    const person = { id: 1, name: "Ana", faceEmbeddings: [[1, 0], [0, 1]] } as never;
    expect(bestMatch([0.8, 0.6], [person], 0.7)).toMatchObject({ person, matched: true });
    expect(bestMatch([0, 1], [person], 1.01).matched).toBe(false);
  });
});
