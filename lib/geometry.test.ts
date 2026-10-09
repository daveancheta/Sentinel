import { describe, expect, it } from "vitest";
import { directionFromCenter, iou, distanceFromHeight } from "./geometry";

describe("geometry", () => {
  it("maps normalized centers to sides and stereo pan", () => {
    expect(directionFromCenter(0.1)).toEqual({ side: "left", pan: -0.8 });
    expect(directionFromCenter(0.5).side).toBe("front");
    expect(directionFromCenter(0.9).side).toBe("right");
  });
  it("computes box overlap and rough distance", () => {
    expect(iou({ xMin: 0, yMin: 0, width: 1, height: 1 }, { xMin: 0.5, yMin: 0.5, width: 1, height: 1 })).toBeCloseTo(1 / 7);
    expect(distanceFromHeight(0.6)).toBe("malapit");
    expect(distanceFromHeight(0.1)).toBe("malayo");
  });
});
