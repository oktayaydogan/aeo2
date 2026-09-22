import { describe, expect, it } from "vitest";
import type {
  BuildingState,
  UnitState
} from "@aeo2/simulation";
import {
  describeBuildingWork,
  describeUnitWork
} from "./hudWorkState";

function unit(
  id: string,
  activity: UnitState["activity"],
  queue: UnitState["orderQueue"] = []
): UnitState {
  return {
    id,
    ownerId: "player-1",
    kind: "villager",
    position: { x: 1, y: 1 },
    destination: null,
    speed: 2.4,
    hitPoints: 25,
    activity,
    cargo: null,
    orderQueue: queue
  };
}

describe("HUD work state", () => {
  it("describes active and queued unit orders from snapshot state", () => {
    expect(
      describeUnitWork([
        unit("v1", "moving", [
          { type: "gather" },
          { type: "build" }
        ])
      ])
    ).toEqual([
      "Current · Move",
      "Queue · Gather › Build"
    ]);
  });

  it("marks divergent multi-selection work as mixed", () => {
    expect(
      describeUnitWork([
        unit("v1", "moving", [{ type: "move" }]),
        unit("v2", "gathering", [{ type: "gather" }])
      ])
    ).toEqual([
      "Current · Mixed",
      "Queue · Mixed"
    ]);
  });

  it("summarizes production and research progress", () => {
    const building: BuildingState = {
      id: "b1",
      ownerId: "player-1",
      kind: "barracks",
      position: { x: 4, y: 4 },
      progress: 1,
      completed: true,
      hitPoints: 100,
      trainingQueue: [
        { unitKind: "militia", progress: 0.42 },
        { unitKind: "spearman", progress: 0 }
      ],
      researchQueue: [
        {
          technologyKind: "forged-weapons",
          progress: 0.63
        }
      ],
      rallyPoint: null
    };

    expect(describeBuildingWork(building, [])).toEqual([
      "Production · Militia 42% › Spearman",
      "Research · Forged Weapons 63%"
    ]);
  });

  it("reconciles immediately to empty/idle when queues disappear", () => {
    const building: BuildingState = {
      id: "b1",
      ownerId: "player-1",
      kind: "barracks",
      position: { x: 4, y: 4 },
      progress: 1,
      completed: true,
      hitPoints: 100,
      trainingQueue: [],
      researchQueue: [],
      rallyPoint: null
    };

    expect(describeBuildingWork(building, [])).toEqual([
      "Production · Empty",
      "Research · Idle"
    ]);
    expect(describeUnitWork([unit("v1", "idle", [])])).toEqual([
      "Current · Idle",
      "Queue · Empty"
    ]);
  });
});
