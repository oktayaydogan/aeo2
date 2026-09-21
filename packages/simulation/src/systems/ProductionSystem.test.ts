import { describe, expect, it, vi } from "vitest";
import {
  MAX_TRAINING_QUEUE,
  ProductionSystem
} from "./ProductionSystem";
import type {
  BuildingDefinition,
  BuildingState,
  ResourceStockpile,
  UnitDefinition,
  UnitState
} from "../types";

const HOUSE: BuildingDefinition = {
  kind: "house",
  displayName: "House",
  footprint: { width: 2, height: 2 },
  cost: { wood: 25, food: 0, gold: 0 },
  buildTimeSeconds: 8,
  maxHitPoints: 550,
  populationProvided: 5
};

const BARRACKS: BuildingDefinition = {
  kind: "barracks",
  displayName: "Barracks",
  footprint: { width: 3, height: 3 },
  cost: { wood: 75, food: 0, gold: 0 },
  buildTimeSeconds: 15,
  maxHitPoints: 1200,
  populationProvided: 0
};

const MILITIA: UnitDefinition = {
  kind: "militia",
  displayName: "Militia",
  cost: { wood: 0, food: 60, gold: 20 },
  trainTimeSeconds: 0.2,
  maxHitPoints: 40,
  speed: 2.5,
  attackDamage: 4,
  attackRange: 0.75,
  attackCooldownSeconds: 1.4,
  populationCost: 1
};

const VILLAGER: UnitDefinition = {
  kind: "villager",
  displayName: "Villager",
  cost: { wood: 0, food: 50, gold: 0 },
  trainTimeSeconds: 0.2,
  maxHitPoints: 25,
  speed: 2.4,
  attackDamage: 0,
  attackRange: 0,
  attackCooldownSeconds: 1,
  populationCost: 1
};

function unit(
  id: string,
  kind: UnitState["kind"] = "villager"
): UnitState {
  return {
    id,
    ownerId: "player-1",
    kind,
    position: { x: 1, y: 1 },
    destination: null,
    speed: kind === "villager" ? 2.4 : 2.5,
    hitPoints: kind === "villager" ? 25 : 40,
    activity: "idle",
    cargo: null
  };
}

function building(
  kind: BuildingState["kind"],
  id: string,
  overrides: Partial<BuildingState> = {}
): BuildingState {
  return {
    id,
    ownerId: "player-1",
    kind,
    position: { x: 5, y: 5 },
    progress: 1,
    completed: true,
    hitPoints: 1000,
    trainingQueue: [],
    researchQueue: [],
    rallyPoint: null,
    ...overrides
  };
}

function createSystem(): ProductionSystem {
  return new ProductionSystem(
    20,
    new Map([
      [VILLAGER.kind, VILLAGER],
      [MILITIA.kind, MILITIA]
    ]),
    new Map([
      [HOUSE.kind, HOUSE],
      [BARRACKS.kind, BARRACKS]
    ])
  );
}

describe("ProductionSystem", () => {
  it("calculates used, queued and completed-building population capacity", () => {
    const system = createSystem();
    const barracks = building("barracks", "barracks-1", {
      trainingQueue: [{ unitKind: "militia", progress: 0 }]
    });
    const house = building("house", "house-1");

    expect(
      system.calculatePopulation(
        "player-1",
        [unit("villager-1"), unit("militia-1", "militia")],
        [barracks, house]
      )
    ).toEqual({
      playerId: "player-1",
      used: 2,
      queued: 1,
      cap: 5
    });
  });

  it("queues valid training and deducts resources exactly once", () => {
    const system = createSystem();
    const barracks = building("barracks", "barracks-1");
    const house = building("house", "house-1");
    const stockpile: ResourceStockpile = {
      wood: 0,
      food: 100,
      gold: 100
    };

    expect(
      system.startTraining(
        "player-1",
        barracks,
        MILITIA,
        [unit("villager-1")],
        [barracks, house],
        () => stockpile
      )
    ).toBe(true);

    expect(stockpile).toEqual({ wood: 0, food: 40, gold: 80 });
    expect(barracks.trainingQueue).toEqual([
      { unitKind: "militia", progress: 0 }
    ]);
  });

  it("rejects training at population cap before touching stockpile state", () => {
    const system = createSystem();
    const barracks = building("barracks", "barracks-1");
    const house = building("house", "house-1");
    const units = Array.from({ length: 5 }, (_, index) =>
      unit(`villager-${index + 1}`)
    );
    const ensureStockpile = vi.fn(
      (): ResourceStockpile => ({ wood: 0, food: 100, gold: 100 })
    );

    expect(
      system.startTraining(
        "player-1",
        barracks,
        MILITIA,
        units,
        [barracks, house],
        ensureStockpile
      )
    ).toBe(false);

    expect(ensureStockpile).not.toHaveBeenCalled();
    expect(barracks.trainingQueue).toHaveLength(0);
  });

  it("rejects invalid producer and full queue without charging", () => {
    const system = createSystem();
    const house = building("house", "house-1");
    const barracks = building("barracks", "barracks-1", {
      trainingQueue: Array.from(
        { length: MAX_TRAINING_QUEUE },
        () => ({ unitKind: "militia" as const, progress: 0 })
      )
    });
    const ensureStockpile = vi.fn(
      (): ResourceStockpile => ({ wood: 0, food: 500, gold: 500 })
    );

    expect(
      system.startTraining(
        "player-1",
        house,
        MILITIA,
        [],
        [house],
        ensureStockpile
      )
    ).toBe(false);
    expect(
      system.startTraining(
        "player-1",
        barracks,
        MILITIA,
        [],
        [barracks],
        ensureStockpile
      )
    ).toBe(false);
    expect(ensureStockpile).not.toHaveBeenCalled();
  });

  it("completes training on fixed ticks and routes spawned unit to rally point", () => {
    const system = createSystem();
    const barracks = building("barracks", "barracks-1", {
      trainingQueue: [{ unitKind: "militia", progress: 0 }],
      rallyPoint: { x: 12, y: 9 }
    });
    const spawnUnit = vi.fn(() => "militia-1");
    const routeToRallyPoint = vi.fn();
    const callbacks = {
      findSpawnPosition: vi.fn(() => ({ x: 8, y: 6 })),
      spawnUnit,
      routeToRallyPoint
    };

    system.step([barracks], callbacks);
    system.step([barracks], callbacks);
    system.step([barracks], callbacks);

    expect(spawnUnit).not.toHaveBeenCalled();
    expect(barracks.trainingQueue[0]?.progress).toBeCloseTo(0.75);

    system.step([barracks], callbacks);

    expect(spawnUnit).toHaveBeenCalledOnce();
    expect(routeToRallyPoint).toHaveBeenCalledWith(
      "militia-1",
      { x: 12, y: 9 }
    );
    expect(barracks.trainingQueue).toHaveLength(0);
  });

  it("keeps a completed queue item blocked when no spawn position is available", () => {
    const system = createSystem();
    const barracks = building("barracks", "barracks-1", {
      trainingQueue: [{ unitKind: "militia", progress: 1 }]
    });
    const spawnUnit = vi.fn();

    system.step([barracks], {
      findSpawnPosition: () => null,
      spawnUnit,
      routeToRallyPoint: vi.fn()
    });

    expect(spawnUnit).not.toHaveBeenCalled();
    expect(barracks.trainingQueue[0]?.progress).toBe(1);
  });
});
