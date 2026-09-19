import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";
import type {
  BuildingDefinition,
  UnitDefinition,
  UnitState
} from "./types";

const HOUSE: BuildingDefinition = {
  kind: "house",
  displayName: "House",
  footprint: { width: 2, height: 2 },
  cost: { wood: 25, food: 0, gold: 0 },
  buildTimeSeconds: 1,
  maxHitPoints: 550,
  populationProvided: 5
};

const BARRACKS: BuildingDefinition = {
  kind: "barracks",
  displayName: "Barracks",
  footprint: { width: 3, height: 3 },
  cost: { wood: 75, food: 0, gold: 0 },
  buildTimeSeconds: 1,
  maxHitPoints: 1200,
  populationProvided: 0
};

const TOWN_CENTER: BuildingDefinition = {
  kind: "town-center",
  displayName: "Town Center",
  footprint: { width: 4, height: 4 },
  cost: { wood: 275, food: 0, gold: 100 },
  buildTimeSeconds: 1,
  maxHitPoints: 12,
  populationProvided: 10
};

const VILLAGER: UnitDefinition = {
  kind: "villager",
  displayName: "Villager",
  cost: { wood: 0, food: 50, gold: 0 },
  trainTimeSeconds: 1,
  maxHitPoints: 25,
  speed: 2.4,
  attackDamage: 0,
  attackRange: 0,
  attackCooldownSeconds: 1,
  populationCost: 1
};

const MILITIA: UnitDefinition = {
  kind: "militia",
  displayName: "Militia",
  cost: { wood: 0, food: 60, gold: 20 },
  trainTimeSeconds: 1,
  maxHitPoints: 40,
  speed: 2.5,
  attackDamage: 4,
  attackRange: 0.75,
  attackCooldownSeconds: 0.1,
  populationCost: 1
};

function runUntil(
  simulation: Simulation,
  predicate: () => boolean,
  maxSteps = 1000
): void {
  for (let step = 0; step < maxSteps; step += 1) {
    if (predicate()) return;
    simulation.step();
  }

  throw new Error("Phase 1 integration condition was not reached.");
}

describe("Phase 1 gameplay vertical slice", () => {
  it("gathers, builds, trains, fights, and wins as one continuous simulation", () => {
    const villager: UnitState = {
      id: "villager-1",
      ownerId: "player-1",
      kind: "villager",
      position: { x: 2, y: 2 },
      destination: null,
      speed: 2.4,
      hitPoints: 25,
      activity: "idle",
      cargo: null
    };

    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 24, height: 24 },
      buildingDefinitions: [HOUSE, BARRACKS, TOWN_CENTER],
      unitDefinitions: [VILLAGER, MILITIA],
      units: [villager],
      resources: [
        {
          id: "tree-1",
          kind: "wood",
          position: { x: 3.5, y: 2 },
          amount: 25
        }
      ],
      buildings: [
        {
          id: "player-town-center",
          ownerId: "player-1",
          kind: "town-center",
          position: { x: 1, y: 5 },
          progress: 1,
          completed: true,
          hitPoints: 12,
          trainingQueue: []
        },
        {
          id: "enemy-town-center",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 17, y: 15 },
          progress: 1,
          completed: true,
          hitPoints: 12,
          trainingQueue: []
        }
      ],
      dropOffPoints: [
        {
          id: "player-dropoff",
          ownerId: "player-1",
          position: { x: 1.5, y: 5 }
        }
      ],
      stockpiles: {
        "player-1": {
          wood: 75,
          food: 100,
          gold: 100
        }
      }
    });

    simulation.queueCommand({
      type: "gather",
      playerId: "player-1",
      unitIds: ["villager-1"],
      resourceId: "tree-1"
    });

    runUntil(
      simulation,
      () =>
        (simulation.getSnapshot().stockpiles.find(
          (entry) => entry.playerId === "player-1"
        )?.resources.wood ?? 0) >= 100
    );

    simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: ["villager-1"],
      buildingKind: "house",
      position: { x: 8, y: 3 }
    });

    runUntil(
      simulation,
      () =>
        simulation.getSnapshot().buildings.some(
          (building) =>
            building.ownerId === "player-1" &&
            building.kind === "house" &&
            building.completed
        )
    );

    simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: ["villager-1"],
      buildingKind: "barracks",
      position: { x: 10, y: 6 }
    });

    runUntil(
      simulation,
      () =>
        simulation.getSnapshot().buildings.some(
          (building) =>
            building.ownerId === "player-1" &&
            building.kind === "barracks" &&
            building.completed
        )
    );

    const barracks = simulation
      .getSnapshot()
      .buildings.find(
        (building) =>
          building.ownerId === "player-1" &&
          building.kind === "barracks"
      );

    expect(barracks).toBeDefined();

    simulation.queueCommand({
      type: "train",
      playerId: "player-1",
      buildingId: barracks?.id ?? "",
      unitKind: "militia"
    });

    runUntil(
      simulation,
      () =>
        simulation.getSnapshot().units.some(
          (unit) =>
            unit.ownerId === "player-1" &&
            unit.kind === "militia"
        )
    );

    const militia = simulation
      .getSnapshot()
      .units.find(
        (unit) =>
          unit.ownerId === "player-1" &&
          unit.kind === "militia"
      );

    expect(militia).toBeDefined();

    simulation.queueCommand({
      type: "attack-building",
      playerId: "player-1",
      unitIds: [militia?.id ?? ""],
      targetBuildingId: "enemy-town-center"
    });

    runUntil(
      simulation,
      () => simulation.getSnapshot().match.status === "ended"
    );

    const snapshot = simulation.getSnapshot();

    expect(snapshot.match).toEqual({
      status: "ended",
      winnerPlayerId: "player-1",
      loserPlayerId: "player-2",
      reason: "town-center-destroyed"
    });
    expect(
      snapshot.buildings.some(
        (building) => building.id === "enemy-town-center"
      )
    ).toBe(false);
  });
});
