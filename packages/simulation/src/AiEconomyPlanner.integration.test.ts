import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";
import type {
  BuildingDefinition,
  UnitDefinition,
  UnitState
} from "./types";

const TOWN_CENTER: BuildingDefinition = {
  kind: "town-center",
  displayName: "Town Center",
  footprint: { width: 4, height: 4 },
  cost: { wood: 275, food: 0, gold: 100 },
  buildTimeSeconds: 40,
  maxHitPoints: 2400,
  populationProvided: 10
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

const FOOD_BARRACKS: BuildingDefinition = {
  ...BARRACKS,
  cost: { wood: 0, food: 75, gold: 0 }
};

const VILLAGER: UnitDefinition = {
  kind: "villager",
  displayName: "Villager",
  cost: { wood: 0, food: 50, gold: 0 },
  trainTimeSeconds: 10,
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
  trainTimeSeconds: 12,
  maxHitPoints: 40,
  speed: 2.5,
  attackDamage: 4,
  attackRange: 0.75,
  attackCooldownSeconds: 1.4,
  populationCost: 1
};

function villager(
  id: string,
  position: { x: number; y: number }
): UnitState {
  return {
    id,
    ownerId: "player-2",
    kind: "villager",
    position,
    destination: null,
    speed: 2.4,
    hitPoints: 25,
    activity: "idle",
    cargo: null
  };
}

function runSteps(simulation: Simulation, count: number): void {
  for (let index = 0; index < count; index += 1) {
    simulation.step();
  }
}

describe("AI economy planner integration", () => {
  it("does not overwrite a construction assignment with a gather order in the same think tick", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 24, height: 24 },
      buildingDefinitions: [TOWN_CENTER, BARRACKS],
      unitDefinitions: [VILLAGER, MILITIA],
      units: [villager("ai-builder", { x: 7, y: 7 })],
      resources: [
        {
          id: "nearby-food",
          kind: "food",
          position: { x: 6, y: 7 },
          amount: 200
        }
      ],
      buildings: [
        {
          id: "ai-town-center",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 8, y: 8 },
          progress: 1,
          completed: true,
          hitPoints: 2400,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-2": { wood: 75, food: 0, gold: 0 }
      },
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1,
          targetVillagers: 1,
          targetMilitary: 2,
          attackThreshold: 99
        }
      ]
    });

    runSteps(simulation, 80);

    const barracks = simulation
      .getSnapshot()
      .buildings.find(
        (building) =>
          building.ownerId === "player-2" &&
          building.kind === "barracks"
      );

    expect(barracks?.completed).toBe(true);
  });

  it("preserves resources reserved for a missing production building", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 24, height: 24 },
      buildingDefinitions: [TOWN_CENTER, FOOD_BARRACKS],
      unitDefinitions: [VILLAGER, MILITIA],
      units: [villager("ai-villager", { x: 7, y: 7 })],
      buildings: [
        {
          id: "ai-town-center",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 8, y: 8 },
          progress: 1,
          completed: true,
          hitPoints: 2400,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-2": { wood: 0, food: 50, gold: 0 }
      },
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1,
          targetVillagers: 2,
          targetMilitary: 2,
          attackThreshold: 99
        }
      ]
    });

    runSteps(simulation, 2);

    const townCenter = simulation
      .getSnapshot()
      .buildings.find((building) => building.id === "ai-town-center");
    const stockpile = simulation
      .getSnapshot()
      .stockpiles.find((entry) => entry.playerId === "player-2");

    expect(townCenter?.trainingQueue).toHaveLength(0);
    expect(stockpile?.resources.food).toBe(50);
  });

  it("falls back to a reachable resource when the preferred kind is unreachable", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: {
        width: 10,
        height: 10,
        blocked: Array.from({ length: 10 }, (_, y) => ({ x: 5, y }))
      },
      unitDefinitions: [VILLAGER],
      units: [villager("ai-villager", { x: 2, y: 2 })],
      resources: [
        {
          id: "blocked-food",
          kind: "food",
          position: { x: 7, y: 2 },
          amount: 200
        },
        {
          id: "reachable-wood",
          kind: "wood",
          position: { x: 3, y: 2 },
          amount: 200
        }
      ],
      dropOffPoints: [
        {
          id: "ai-dropoff",
          ownerId: "player-2",
          position: { x: 2, y: 3 }
        }
      ],
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1,
          targetVillagers: 1,
          targetMilitary: 0,
          attackThreshold: 99
        }
      ]
    });

    runSteps(simulation, 100);

    const stockpile = simulation
      .getSnapshot()
      .stockpiles.find((entry) => entry.playerId === "player-2");

    expect(stockpile?.resources.wood).toBeGreaterThan(0);
    expect(stockpile?.resources.food).toBe(0);
  });
});
