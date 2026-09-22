import { describe, expect, it } from "vitest";
import {
  cursorForCommandIntent,
  resolveCommandIntent
} from "./commandIntent";

describe("command intent", () => {
  it("prioritizes placement mode over hovered targets", () => {
    expect(
      resolveCommandIntent({
        placementActive: true,
        hasSelectedUnits: true,
        hasSelectedBuilding: false,
        overResource: true,
        overEnemyUnit: true,
        overEnemyBuilding: false
      })
    ).toBe("build");
  });

  it("maps selected-unit target context to attack, gather, and move", () => {
    const base = {
      placementActive: false,
      hasSelectedUnits: true,
      hasSelectedBuilding: false
    };

    expect(
      resolveCommandIntent({
        ...base,
        overResource: false,
        overEnemyUnit: true,
        overEnemyBuilding: false
      })
    ).toBe("attack");

    expect(
      resolveCommandIntent({
        ...base,
        overResource: true,
        overEnemyUnit: false,
        overEnemyBuilding: false
      })
    ).toBe("gather");

    expect(
      resolveCommandIntent({
        ...base,
        overResource: false,
        overEnemyUnit: false,
        overEnemyBuilding: false
      })
    ).toBe("move");
  });

  it("uses rally intent for a selected building and default otherwise", () => {
    expect(
      resolveCommandIntent({
        placementActive: false,
        hasSelectedUnits: false,
        hasSelectedBuilding: true,
        overResource: false,
        overEnemyUnit: false,
        overEnemyBuilding: false
      })
    ).toBe("rally");

    expect(
      resolveCommandIntent({
        placementActive: false,
        hasSelectedUnits: false,
        hasSelectedBuilding: false,
        overResource: false,
        overEnemyUnit: false,
        overEnemyBuilding: false
      })
    ).toBe("none");

    expect(cursorForCommandIntent("attack")).toBe("crosshair");
    expect(cursorForCommandIntent("move")).toBe("move");
    expect(cursorForCommandIntent("none")).toBe("default");
  });
});
