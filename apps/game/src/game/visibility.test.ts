import { describe, expect, it } from "vitest";
import { FogOfWar } from "./visibility";

describe("FogOfWar", () => {
  it("marks cells visible around a vision source", () => {
    const fog = new FogOfWar(20, 20);

    fog.update([{ x: 5.5, y: 5.5, radius: 2.2 }]);

    expect(fog.stateAtCell(5, 5)).toBe("visible");
    expect(fog.stateAtCell(7, 5)).toBe("visible");
    expect(fog.stateAtCell(9, 9)).toBe("unexplored");
  });

  it("keeps previously visible cells explored after the source moves", () => {
    const fog = new FogOfWar(20, 20);

    fog.update([{ x: 4.5, y: 4.5, radius: 2 }]);
    expect(fog.stateAtCell(4, 4)).toBe("visible");

    fog.update([{ x: 12.5, y: 12.5, radius: 2 }]);

    expect(fog.stateAtCell(4, 4)).toBe("explored");
    expect(fog.stateAtCell(12, 12)).toBe("visible");
  });

  it("clears current visibility when there are no sources but preserves exploration", () => {
    const fog = new FogOfWar(8, 8);

    fog.update([{ x: 3.5, y: 3.5, radius: 1.5 }]);
    const explored = fog.exploredCellCount();

    fog.update([]);

    expect(fog.visibleCellCount()).toBe(0);
    expect(fog.exploredCellCount()).toBe(explored);
    expect(fog.stateAtCell(3, 3)).toBe("explored");
  });
});
