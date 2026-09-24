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

  it("allows villagers to approach a building from all four sides", () => {
    const definition: BuildingDefinition = {
      kind: "house",
      displayName: "House",
      footprint: { width: 2, height: 2 },
      cost: { wood: 25, food: 0, gold: 0 },
      buildTimeSeconds: 9,
      maxHitPoints: 550,
      populationProvided: 5
    };
    const navigation = new GridNavigation({ width: 20, height: 20 });
    const system = new ConstructionSystem(
      20,
      navigation,
      new Map(),
      new Map([[definition.kind, definition]]),
      new Map(),
      new Map(),
      () => true
    );
    const position = { x: 8, y: 8 };
    const builders = [
      {
        id: "north",
        ownerId: "p1",
        kind: "villager" as const,
        position: { x: 8.5, y: 6.5 },
        destination: null,
        speed: 2.4,
        hitPoints: 25,
        activity: "idle" as const,
        cargo: null,
        waypoints: []
      },
      {
        id: "south",
        ownerId: "p1",
        kind: "villager" as const,
        position: { x: 8.5, y: 11.5 },
        destination: null,
        speed: 2.4,
        hitPoints: 25,
        activity: "idle" as const,
        cargo: null,
        waypoints: []
      },
      {
        id: "west",
        ownerId: "p1",
        kind: "villager" as const,
        position: { x: 6.5, y: 8.5 },
        destination: null,
        speed: 2.4,
        hitPoints: 25,
        activity: "idle" as const,
        cargo: null,
        waypoints: []
      },
      {
        id: "east",
        ownerId: "p1",
        kind: "villager" as const,
        position: { x: 11.5, y: 8.5 },
        destination: null,
        speed: 2.4,
        hitPoints: 25,
        activity: "idle" as const,
        cargo: null,
        waypoints: []
      }
    ] satisfies ConstructionUnit[];
    const reserved: { x: number; y: number }[] = [];
    const sides = new Set<string>();

    for (const unit of builders) {
      const target = system.findBuildApproachPosition(
        unit,
        definition,
        position,
        reserved
      );

      expect(target).not.toBeNull();

      if (!target) {
        continue;
      }

      reserved.push(target);

      if (target.y < position.y) {
        sides.add("north");
      } else if (target.y > position.y + definition.footprint.height) {
        sides.add("south");
      } else if (target.x < position.x) {
        sides.add("west");
      } else if (target.x > position.x + definition.footprint.width) {
        sides.add("east");
      }
    }

    expect(sides).toEqual(new Set(["north", "south", "west", "east"]));
  });

  it("assigns distinct perimeter slots before reusing a slot", () => {
    const definition: BuildingDefinition = {
      kind: "house",
      displayName: "House",
      footprint: { width: 2, height: 2 },
      cost: { wood: 25, food: 0, gold: 0 },
      buildTimeSeconds: 9,
      maxHitPoints: 550,
      populationProvided: 5
    };
    const system = new ConstructionSystem(
      20,
      new GridNavigation({ width: 20, height: 20 }),
      new Map(),
      new Map([[definition.kind, definition]]),
      new Map(),
      new Map(),
      () => true
    );
    const position = { x: 8, y: 8 };
    const reserved: { x: number; y: number }[] = [];

    for (let index = 0; index < 4; index += 1) {
      const unit: ConstructionUnit = {
        id: `builder-${index}`,
        ownerId: "p1",
        kind: "villager",
        position: { x: 8 + index * 0.1, y: 5 },
        destination: null,
        speed: 2.4,
        hitPoints: 25,
        activity: "idle",
        cargo: null,
        waypoints: []
      };
      const target = system.findBuildApproachPosition(
        unit,
        definition,
        position,
        reserved
      );

      expect(target).not.toBeNull();

      if (target) {
        reserved.push(target);
      }
    }

    expect(new Set(reserved.map((point) => `${point.x},${point.y}`)).size).toBe(
      4
    );
  });

  it("uses diminishing returns for multiple builders", () => {
    const definition: BuildingDefinition = {
      kind: "house",
      displayName: "House",
      footprint: { width: 2, height: 2 },
      cost: { wood: 25, food: 0, gold: 0 },
      buildTimeSeconds: 9,
      maxHitPoints: 550,
      populationProvided: 5
    };
    const building: BuildingState = {
      id: "house-1",
      ownerId: "p1",
      kind: "house",
      position: { x: 8, y: 8 },
      progress: 0,
      completed: false,
      hitPoints: 1,
      trainingQueue: [],
      rallyPoint: null
    };
    const north: ConstructionUnit = {
      id: "builder-1",
      ownerId: "p1",
      kind: "villager",
      position: { x: 8.5, y: 7.5 },
      destination: null,
      speed: 2.4,
      hitPoints: 25,
      activity: "idle",
      cargo: null,
      waypoints: [],
      buildTask: {
        buildingId: building.id,
        target: { x: 8.5, y: 7.5 }
      }
    };
    const south: ConstructionUnit = {
      ...north,
      id: "builder-2",
      position: { x: 8.5, y: 10.5 },
      buildTask: {
        buildingId: building.id,
        target: { x: 8.5, y: 10.5 }
      }
    };
    const units = new Map([
      [north.id, north],
      [south.id, south]
    ]);
    const system = new ConstructionSystem(
      20,
      new GridNavigation({ width: 20, height: 20 }),
      new Map([[building.id, building]]),
      new Map([[definition.kind, definition]]),
      new Map(),
      units,
      () => true
    );

    system.step(units.values());

    expect(building.progress).toBeCloseTo((4 / 3) / (9 * 20), 8);
    expect(north.activity).toBe("building");
    expect(south.activity).toBe("building");
  });
});
