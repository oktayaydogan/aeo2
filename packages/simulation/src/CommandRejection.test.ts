import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";
import type {
  BuildingDefinition,
  BuildingState,
  UnitDefinition,
  UnitState
} from "./types";

const HOUSE: BuildingDefinition = {
  kind: "house",
  displayName: "House",
  footprint: { width: 2, height: 2 },
  cost: { wood: 25, food: 0, gold: 0 },
  buildTimeSeconds: 1,
  maxHitPoints: 100,
  populationProvided: 5
};

const TOWN_CENTER: BuildingDefinition = {
  kind: "town-center",
  displayName: "Town Center",
  footprint: { width: 4, height: 4 },
  cost: { wood: 0, food: 0, gold: 0 },
  buildTimeSeconds: 1,
  maxHitPoints: 500,
  populationProvided: 1
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

function villager(id = "v1"): UnitState {
  return {
    id,
    ownerId: "p1",
    kind: "villager",
    position: { x: 2.5, y: 2.5 },
    destination: null,
    speed: 2.4,
    hitPoints: 25,
    activity: "idle",
    cargo: null
  };
}

function townCenter(): BuildingState {
  return {
    id: "tc-1",
    ownerId: "p1",
    kind: "town-center",
    position: { x: 6, y: 6 },
    progress: 1,
    completed: true,
    hitPoints: 500,
    trainingQueue: [],
    rallyPoint: null
  };
}

describe("authoritative command rejection events", () => {
  it("reports insufficient resources for a valid build placement", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [villager()],
      buildingDefinitions: [HOUSE],
      stockpiles: {
        p1: { wood: 0, food: 0, gold: 0 }
      }
    });

    simulation.queueCommand({
      type: "build",
      playerId: "p1",
      unitIds: ["v1"],
      buildingKind: "house",
      position: { x: 10, y: 10 }
    });
    simulation.step();

    expect(simulation.getCommandRejectionsSince(0, "p1")).toEqual([
      expect.objectContaining({
        playerId: "p1",
        commandType: "build",
        reason: "insufficient-resources"
      })
    ]);
  });

  it("reports population cap from authoritative production validation", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [villager()],
      buildings: [townCenter()],
      buildingDefinitions: [TOWN_CENTER],
      unitDefinitions: [VILLAGER],
      stockpiles: {
        p1: { wood: 0, food: 500, gold: 0 }
      }
    });

    simulation.queueCommand({
      type: "train",
      playerId: "p1",
      buildingId: "tc-1",
      unitKind: "villager"
    });
    simulation.step();

    expect(simulation.getCommandRejectionsSince(0, "p1")).toEqual([
      expect.objectContaining({
        commandType: "train",
        reason: "population-cap"
      })
    ]);
  });

  it("keeps rejection sequencing queryable without changing snapshots", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [villager()],
      buildingDefinitions: [HOUSE]
    });

    simulation.queueCommand({
      type: "gather",
      playerId: "p1",
      unitIds: ["v1"],
      resourceId: "missing"
    });
    simulation.step();

    const first = simulation.getCommandRejectionsSince(0, "p1")[0];

    expect(first?.reason).toBe("invalid-resource");
    expect("commandRejections" in simulation.getSnapshot()).toBe(false);

    simulation.queueCommand({
      type: "attack",
      playerId: "p1",
      unitIds: ["v1"],
      targetUnitId: "missing"
    });
    simulation.step();

    const later = simulation.getCommandRejectionsSince(
      first?.sequence ?? 0,
      "p1"
    );

    expect(later).toHaveLength(1);
    expect(later[0]?.reason).toBe("combat-unit-required");
    expect(later[0]?.sequence).toBeGreaterThan(first?.sequence ?? 0);
  });
});
