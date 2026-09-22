import { describe, expect, it } from "vitest";
import {
  edgePanVector,
  initialCameraZoom
} from "./cameraViewport";

describe("camera viewport helpers", () => {
  it("returns edge pan directions only inside the edge margin", () => {
    expect(edgePanVector(3, 300, 1200, 700)).toEqual({ x: -1, y: 0 });
    expect(edgePanVector(1198, 300, 1200, 700)).toEqual({ x: 1, y: 0 });
    expect(edgePanVector(600, 2, 1200, 700)).toEqual({ x: 0, y: -1 });
    expect(edgePanVector(600, 699, 1200, 700)).toEqual({ x: 0, y: 1 });
    expect(edgePanVector(600, 350, 1200, 700)).toEqual({ x: 0, y: 0 });
  });

  it("does not pan when the pointer is outside the game surface", () => {
    expect(edgePanVector(-1, 200, 1200, 700)).toEqual({ x: 0, y: 0 });
    expect(edgePanVector(1201, 200, 1200, 700)).toEqual({ x: 0, y: 0 });
  });

  it("keeps initial zoom in a useful desktop range", () => {
    expect(initialCameraZoom(1730, 810)).toBe(1.35);
    expect(initialCameraZoom(1100, 680)).toBeCloseTo(1.15);
    expect(initialCameraZoom(800, 560)).toBeGreaterThanOrEqual(0.9);
  });
});
