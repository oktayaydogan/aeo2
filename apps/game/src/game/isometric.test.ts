import { describe, expect, it } from "vitest";
import {
  gridToScreen,
  isometricMapBounds,
  type IsometricProjection
} from "./isometric";

describe("isometricMapBounds", () => {
  const projection: IsometricProjection = {
    tileWidth: 64,
    tileHeight: 32,
    originX: 700,
    originY: 110
  };

  it("contains all four map corners with requested padding", () => {
    const bounds = isometricMapBounds(20, 20, projection, 100, 50);
    const corners = [
      gridToScreen({ x: 0, y: 0 }, projection),
      gridToScreen({ x: 20, y: 0 }, projection),
      gridToScreen({ x: 20, y: 20 }, projection),
      gridToScreen({ x: 0, y: 20 }, projection)
    ];

    for (const point of corners) {
      expect(point.x).toBeGreaterThan(bounds.x);
      expect(point.x).toBeLessThan(bounds.x + bounds.width);
      expect(point.y).toBeGreaterThan(bounds.y);
      expect(point.y).toBeLessThan(bounds.y + bounds.height);
    }
  });
});
