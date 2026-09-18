import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";
import type { SimulationSnapshot, UnitState } from "./types";

function villager(): UnitState {
  return {
    id: "villager-1",
    ownerId: "player-1",
    kind: "villager",
    position: { x: 2, y: 2 },
    destination: null,
    speed: 2.4,
    activity: "idle",
    cargo: null
  };
}

function createEconomySimulation(): Simulation {
  return new Simulation({
    tickRate: 20,
    map: {
      width: 20,
      height: 20
    },
    units: [villager()],
    resources: [
      {
        id: "tree-1",
        kind: "wood",
        position: { x: 4, y: 2 },
        amount: 30
      }
    ],
    dropOffPoints: [
      {
        id: "town-center-1",
        ownerId: "player-1",
        position: { x: 1, y: 2 }
      }
    ],
    stockpiles: {
      "player-1": {
        wood: 0,
        food: 0,
        gold: 0
      }
    }
  });
}

function runSteps(simulation: Simulation, count: number): SimulationSnapshot {
  for (let index = 0; index < count; index += 1) {
    simulation.step();
  }

  return simulation.getSnapshot();
}

describe("Simulation economy loop", () => {
  it("gathers a resource, returns it, and deposits into the player stockpile", () => {
    const simulation = createEconomySimulation();

    simulation.queueCommand({
      type: "gather",
      playerId: "player-1",
      unitIds: ["villager-1"],
      resourceId: "tree-1"
    });

    const snapshot = runSteps(simulation, 600);
    const stockpile = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-1"
    );
    const resource = snapshot.resources.find(
      (entry) => entry.id === "tree-1"
    );
    const unit = snapshot.units.find((entry) => entry.id === "villager-1");

    expect(stockpile?.resources.wood).toBeCloseTo(30, 5);
    expect(resource?.amount).toBeCloseTo(0, 5);
    expect(unit?.cargo).toBeNull();
    expect(unit?.activity).toBe("idle");
  });

  it("manual movement cancels the active gather task", () => {
    const simulation = createEconomySimulation();

    simulation.queueCommand({
      type: "gather",
      playerId: "player-1",
      unitIds: ["villager-1"],
      resourceId: "tree-1"
    });

    runSteps(simulation, 30);

    const beforeMove = simulation.getSnapshot().resources[0]?.amount;

    simulation.queueCommand({
      type: "move",
      playerId: "player-1",
      unitIds: ["villager-1"],
      target: { x: 8, y: 8 }
    });

    const snapshot = runSteps(simulation, 60);
    const resource = snapshot.resources.find(
      (entry) => entry.id === "tree-1"
    );

    expect(resource?.amount).toBeCloseTo(beforeMove ?? 0, 5);
  });

  it("rejects gather commands for units the player does not own", () => {
    const simulation = createEconomySimulation();

    simulation.queueCommand({
      type: "gather",
      playerId: "player-2",
      unitIds: ["villager-1"],
      resourceId: "tree-1"
    });

    const snapshot = runSteps(simulation, 200);
    const resource = snapshot.resources.find(
      (entry) => entry.id === "tree-1"
    );
    const stockpile = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-1"
    );

    expect(resource?.amount).toBe(30);
    expect(stockpile?.resources.wood).toBe(0);
  });
});


describe("Simulation building construction", () => {
  const houseDefinition = {
    kind: "house" as const,
    displayName: "House",
    footprint: { width: 2, height: 2 },
    cost: { wood: 25, food: 0, gold: 0 },
    buildTimeSeconds: 8,
    maxHitPoints: 550,
    populationProvided: 5
  };

  function createBuildingSimulation(wood: number): Simulation {
    return new Simulation({
      tickRate: 20,
      map: {
        width: 20,
        height: 20
      },
      units: [villager()],
      buildingDefinitions: [houseDefinition],
      stockpiles: {
        "player-1": {
          wood,
          food: 0,
          gold: 0
        }
      }
    });
  }

  it("deducts resources and completes a villager-built house", () => {
    const simulation = createBuildingSimulation(100);

    simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: ["villager-1"],
      buildingKind: "house",
      position: { x: 4, y: 4 }
    });

    const snapshot = runSteps(simulation, 500);
    const building = snapshot.buildings[0];
    const stockpile = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-1"
    );
    const unit = snapshot.units.find((entry) => entry.id === "villager-1");

    expect(building?.kind).toBe("house");
    expect(building?.completed).toBe(true);
    expect(building?.progress).toBe(1);
    expect(building?.hitPoints).toBe(550);
    expect(stockpile?.resources.wood).toBe(75);
    expect(unit?.activity).toBe("idle");
  });

  it("rejects construction when the player cannot afford it", () => {
    const simulation = createBuildingSimulation(0);

    simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: ["villager-1"],
      buildingKind: "house",
      position: { x: 4, y: 4 }
    });

    const snapshot = runSteps(simulation, 20);

    expect(snapshot.buildings).toHaveLength(0);
  });

  it("rejects overlapping building placement", () => {
    const simulation = createBuildingSimulation(100);

    simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: ["villager-1"],
      buildingKind: "house",
      position: { x: 4, y: 4 }
    });
    simulation.step();

    simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: ["villager-1"],
      buildingKind: "house",
      position: { x: 5, y: 5 }
    });

    const snapshot = runSteps(simulation, 20);

    expect(snapshot.buildings).toHaveLength(1);
  });
});
