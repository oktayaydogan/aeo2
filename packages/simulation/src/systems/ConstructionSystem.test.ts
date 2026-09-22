import { describe, expect, it } from "vitest";
import { GridNavigation } from "../GridNavigation";
import {
  ConstructionSystem,
  type ConstructionUnit
} from "./ConstructionSystem";
import type {
  BuildingDefinition,
  BuildingState,
  ResourceNodeState
} from "../types";

describe("ConstructionSystem", () => {
  it("keeps a separated builder contributing instead of repeatedly repathing", () => {
    const definition: BuildingDefinition = {
      kind: "house",
      displayName: "House",
      footprint: { width: 2, height: 2 },
      cost: { wood: 25, food: 0, gold: 0 },
      buildTimeSeconds: 1,
      maxHitPoints: 100,
      populationProvided: 5
    };
    const building: BuildingState = {
      id: "house-1",
      ownerId: "p1",
      kind: "house",
      position: { x: 4, y: 4 },
      progress: 0,
      completed: false,
      hitPoints: 1,
      trainingQueue: [],
      rallyPoint: null
    };
    const unit: ConstructionUnit = {
      id: "villager-1",
      ownerId: "p1",
      kind: "villager",
      position: { x: 2.72, y: 4.5 },
      destination: null,
      speed: 2.4,
      hitPoints: 25,
      activity: "building",
      cargo: null,
      waypoints: [],
      buildTask: {
        buildingId: building.id,
        target: { x: 3.5, y: 4.5 }
      }
    };
    let repathCount = 0;
    const buildings = new Map([[building.id, building]]);
    const units = new Map([[unit.id, unit]]);
    const system = new ConstructionSystem(
      20,
      new GridNavigation({ width: 20, height: 20 }),
      buildings,
      new Map([[definition.kind, definition]]),
      new Map(),
      units,
      () => {
        repathCount += 1;
        return true;
      }
    );

    system.step(units.values());

    expect(repathCount).toBe(0);
    expect(unit.activity).toBe("building");
    expect(building.progress).toBeGreaterThan(0);
  });

  it("advances construction to completion without Simulation orchestration", () => {
    const definition: BuildingDefinition = {
      kind: "house",
      displayName: "House",
      footprint: { width: 2, height: 2 },
      cost: { wood: 25, food: 0, gold: 0 },
      buildTimeSeconds: 1,
      maxHitPoints: 100,
      populationProvided: 5
    };
    const building: BuildingState = {
      id: "house-1",
      ownerId: "p1",
      kind: "house",
      position: { x: 4, y: 4 },
      progress: 0,
      completed: false,
      hitPoints: 1,
      trainingQueue: [],
      rallyPoint: null
    };
    const unit: ConstructionUnit = {
      id: "villager-1",
      ownerId: "p1",
      kind: "villager",
      position: { x: 3.5, y: 4.5 },
      destination: null,
      speed: 2.4,
      hitPoints: 25,
      activity: "moving",
      cargo: null,
      waypoints: [],
      buildTask: {
        buildingId: building.id,
        target: { x: 3.5, y: 4.5 }
      }
    };

    const buildings = new Map([[building.id, building]]);
    const definitions = new Map([[definition.kind, definition]]);
    const resources = new Map<string, ResourceNodeState>();
    const units = new Map([[unit.id, unit]]);
    const system = new ConstructionSystem(
      20,
      new GridNavigation({ width: 20, height: 20 }),
      buildings,
      definitions,
      resources,
      units,
      () => true
    );

    for (let index = 0; index < 20; index += 1) {
      system.step(units.values());
    }

    expect(building.completed).toBe(true);
    expect(building.progress).toBe(1);
    expect(building.hitPoints).toBe(100);

    system.step(units.values());

    expect(unit.buildTask).toBeUndefined();
    expect(unit.activity).toBe("idle");
  });

  it("rejects occupied construction cells and accepts a clear footprint", () => {
    const definition: BuildingDefinition = {
      kind: "house",
      displayName: "House",
      footprint: { width: 2, height: 2 },
      cost: { wood: 25, food: 0, gold: 0 },
      buildTimeSeconds: 1,
      maxHitPoints: 100,
      populationProvided: 5
    };
    const existing: BuildingState = {
      id: "house-existing",
      ownerId: "p1",
      kind: "house",
      position: { x: 4, y: 4 },
      progress: 1,
      completed: true,
      hitPoints: 100,
      trainingQueue: [],
      rallyPoint: null
    };
    const units = new Map<string, ConstructionUnit>();
    const system = new ConstructionSystem(
      20,
      new GridNavigation({ width: 20, height: 20 }),
      new Map([[existing.id, existing]]),
      new Map([[definition.kind, definition]]),
      new Map(),
      units,
      () => true
    );

    expect(system.canPlaceBuilding(definition, { x: 4, y: 4 })).toBe(false);
    expect(system.canPlaceBuilding(definition, { x: 8, y: 8 })).toBe(true);
  });
});
