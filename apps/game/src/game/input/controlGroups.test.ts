import { describe, expect, it } from "vitest";
import type { SimulationSnapshot } from "@aeo2/simulation";
import { ControlGroupManager } from "./controlGroups";

function snapshot(
  unitIds: readonly string[] = [],
  buildingIds: readonly string[] = []
): SimulationSnapshot {
  return {
    tick: 0,
    units: unitIds.map((id, index) => ({
      id,
      ownerId: "player-1",
      kind: "villager",
      position: { x: index + 1, y: 1 },
      destination: null,
      speed: 2.4,
      hitPoints: 25,
      activity: "idle",
      cargo: null
    })),
    resources: [],
    stockpiles: [],
    population: [],
    aiPlayers: [],
    technologies: [],
    match: {
      status: "playing",
      winnerPlayerId: null,
      loserPlayerId: null,
      reason: null
    },
    buildings: buildingIds.map((id, index) => ({
      id,
      ownerId: "player-1",
      kind: "house",
      position: { x: index + 4, y: 4 },
      progress: 1,
      completed: true,
      hitPoints: 100,
      trainingQueue: [],
      rallyPoint: null
    }))
  };
}

describe("ControlGroupManager", () => {
  it("stores canonical unit ids and recalls them", () => {
    const manager = new ControlGroupManager();

    manager.assign(1, {
      unitIds: ["u-b", "u-a", "u-b"],
      buildingId: "ignored-building"
    });

    expect(manager.get(1)).toEqual({
      unitIds: ["u-a", "u-b"]
    });
    expect(manager.recall(1, snapshot(["u-a", "u-b"]), 1000)).toEqual({
      unitIds: ["u-a", "u-b"],
      shouldCenter: false
    });
  });

  it("prunes destroyed members and removes an empty group", () => {
    const manager = new ControlGroupManager();

    manager.assign(2, { unitIds: ["u-a", "u-b"] });

    expect(manager.recall(2, snapshot(["u-b"]), 1000)).toEqual({
      unitIds: ["u-b"],
      shouldCenter: false
    });
    expect(manager.get(2)).toEqual({ unitIds: ["u-b"] });

    expect(manager.recall(2, snapshot(), 1500)).toBeNull();
    expect(manager.get(2)).toBeUndefined();
  });

  it("stores a building when no units are selected", () => {
    const manager = new ControlGroupManager();

    manager.assign(3, {
      unitIds: [],
      buildingId: "house-1"
    });

    expect(manager.recall(3, snapshot([], ["house-1"]), 1000)).toEqual({
      unitIds: [],
      buildingId: "house-1",
      shouldCenter: false
    });
  });

  it("flags only a fast second recall as camera-centering", () => {
    const manager = new ControlGroupManager();

    manager.assign(4, { unitIds: ["u-a"] });

    expect(
      manager.recall(4, snapshot(["u-a"]), 1000)?.shouldCenter
    ).toBe(false);
    expect(
      manager.recall(4, snapshot(["u-a"]), 1250)?.shouldCenter
    ).toBe(true);
    expect(
      manager.recall(4, snapshot(["u-a"]), 2000)?.shouldCenter
    ).toBe(false);
  });

  it("clears a group when Ctrl+slot is assigned with no selection", () => {
    const manager = new ControlGroupManager();

    manager.assign(5, { unitIds: ["u-a"] });
    manager.assign(5, { unitIds: [] });

    expect(manager.get(5)).toBeUndefined();
  });
});
