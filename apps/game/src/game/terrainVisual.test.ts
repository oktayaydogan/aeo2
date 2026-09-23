import { describe, expect, it } from "vitest";
import {
  terrainAccentOffsets,
  terrainCellVisual
} from "./terrainVisual";

describe("terrain visual derivation", () => {
  it("is deterministic for the same seed and coordinate", () => {
    expect(terrainCellVisual(4, 7, 1337, false)).toEqual(
      terrainCellVisual(4, 7, 1337, false)
    );
    expect(terrainAccentOffsets(91)).toEqual(
      terrainAccentOffsets(91)
    );
  });

  it("changes seeded presentation without changing terrain semantics", () => {
    const first = terrainCellVisual(4, 7, 1337, false);
    const second = terrainCellVisual(4, 7, 7331, false);

    expect(first.variant).not.toBe(second.variant);
    expect(first.fill).not.toBe(0);
    expect(second.fill).not.toBe(0);
  });

  it("uses a distinct blocked-terrain palette", () => {
    const grass = terrainCellVisual(2, 2, 42, false);
    const stone = terrainCellVisual(2, 2, 42, true);

    expect(stone.fill).not.toBe(grass.fill);
    expect(stone.line).not.toBe(grass.line);
  });
});
