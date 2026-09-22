import { describe, expect, it } from "vitest";
import {
  nextCameraZoom,
  normalizeWheelDelta
} from "./cameraZoom";

describe("camera zoom math", () => {
  it("keeps wheel and trackpad zoom inside camera bounds", () => {
    expect(nextCameraZoom(1, -100)).toBeCloseTo(1.1);
    expect(nextCameraZoom(1, 100)).toBeCloseTo(0.9);
    expect(nextCameraZoom(1.79, -1000)).toBe(1.8);
    expect(nextCameraZoom(0.56, 1000)).toBe(0.55);
  });

  it("normalizes line and page wheel deltas deterministically", () => {
    expect(normalizeWheelDelta(2, 1, 900)).toBe(32);
    expect(normalizeWheelDelta(-1, 2, 900)).toBe(-900);
    expect(normalizeWheelDelta(12, 0, 900)).toBe(12);
  });
});
