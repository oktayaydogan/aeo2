import { describe, expect, it } from "vitest";
import { fixedViewportTransform } from "./fixedViewport";

describe("fixed viewport transform", () => {
  it("is identity at camera zoom 1", () => {
    expect(fixedViewportTransform(1, 1200, 800)).toEqual({
      x: 0,
      y: 0,
      scale: 1
    });
  });

  it("applies inverse scale and centered translation when zoomed in", () => {
    expect(fixedViewportTransform(2, 1200, 800)).toEqual({
      x: 300,
      y: 200,
      scale: 0.5
    });
  });

  it("keeps a logical screen point fixed after camera zoom", () => {
    const zoom = 1.5;
    const width = 1200;
    const height = 800;
    const transform = fixedViewportTransform(
      zoom,
      width,
      height
    );
    const logical = { x: 180, y: 640 };
    const cameraCenter = {
      x: width / 2,
      y: height / 2
    };

    const containerSpace = {
      x: transform.x + logical.x * transform.scale,
      y: transform.y + logical.y * transform.scale
    };
    const rendered = {
      x:
        cameraCenter.x +
        (containerSpace.x - cameraCenter.x) * zoom,
      y:
        cameraCenter.y +
        (containerSpace.y - cameraCenter.y) * zoom
    };

    expect(rendered.x).toBeCloseTo(logical.x);
    expect(rendered.y).toBeCloseTo(logical.y);
  });

  it("falls back to identity for invalid zoom", () => {
    expect(fixedViewportTransform(0, 1000, 700)).toEqual({
      x: 0,
      y: 0,
      scale: 1
    });
  });
});
