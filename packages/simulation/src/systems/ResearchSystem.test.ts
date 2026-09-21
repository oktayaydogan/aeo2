import { describe, expect, it, vi } from "vitest";
import { ResearchSystem } from "./ResearchSystem";
import type {
  BuildingState,
  ResourceStockpile,
  TechnologyDefinition
} from "../types";

const FORGED_WEAPONS: TechnologyDefinition = {
  kind: "forged-weapons",
  displayName: "Forged Weapons",
  cost: { wood: 0, food: 75, gold: 75 },
  researchTimeSeconds: 0.2,
  buildingKind: "barracks",
  attackDamageBonus: 1
};

function barracks(
  overrides: Partial<BuildingState> = {}
): BuildingState {
  return {
    id: "barracks-1",
    ownerId: "player-1",
    kind: "barracks",
    position: { x: 4, y: 4 },
    progress: 1,
    completed: true,
    hitPoints: 1200,
    trainingQueue: [],
    researchQueue: [],
    rallyPoint: null,
    ...overrides
  };
}

function createSystem(): ResearchSystem {
  return new ResearchSystem(
    20,
    new Map([[FORGED_WEAPONS.kind, FORGED_WEAPONS]])
  );
}

describe("ResearchSystem", () => {
  it("deducts cost once and queues valid research", () => {
    const system = createSystem();
    const building = barracks();
    const stockpile: ResourceStockpile = {
      wood: 10,
      food: 100,
      gold: 100
    };

    expect(
      system.startResearch(
        "player-1",
        building,
        FORGED_WEAPONS,
        () => stockpile
      )
    ).toBe(true);

    expect(stockpile).toEqual({
      wood: 10,
      food: 25,
      gold: 25
    });
    expect(building.researchQueue).toEqual([
      {
        technologyKind: "forged-weapons",
        progress: 0
      }
    ]);

    expect(
      system.startResearch(
        "player-1",
        building,
        FORGED_WEAPONS,
        () => stockpile
      )
    ).toBe(false);
    expect(stockpile).toEqual({
      wood: 10,
      food: 25,
      gold: 25
    });
  });

  it("preserves the stockpile lookup boundary for valid but unaffordable research", () => {
    const system = createSystem();
    const building = barracks();
    const stockpile: ResourceStockpile = {
      wood: 0,
      food: 0,
      gold: 0
    };
    const ensureStockpile = vi.fn(() => stockpile);

    expect(
      system.startResearch(
        "player-1",
        building,
        FORGED_WEAPONS,
        ensureStockpile
      )
    ).toBe(false);

    expect(ensureStockpile).toHaveBeenCalledOnce();
    expect(building.researchQueue).toHaveLength(0);
  });

  it("rejects structural invalid commands before touching stockpile state", () => {
    const system = createSystem();
    const ensureStockpile = vi.fn(
      (): ResourceStockpile => ({ wood: 0, food: 100, gold: 100 })
    );

    expect(
      system.startResearch(
        "player-2",
        barracks(),
        FORGED_WEAPONS,
        ensureStockpile
      )
    ).toBe(false);

    expect(ensureStockpile).not.toHaveBeenCalled();
  });

  it("advances research on fixed ticks and completes at the same boundary", () => {
    const system = createSystem();
    const building = barracks();
    const stockpile: ResourceStockpile = {
      wood: 0,
      food: 100,
      gold: 100
    };

    system.startResearch(
      "player-1",
      building,
      FORGED_WEAPONS,
      () => stockpile
    );

    system.step([building]);
    system.step([building]);
    system.step([building]);

    expect(system.hasTechnology("player-1", "forged-weapons")).toBe(false);
    expect(building.researchQueue?.[0]?.progress).toBeCloseTo(0.75);

    system.step([building]);

    expect(system.hasTechnology("player-1", "forged-weapons")).toBe(true);
    expect(system.getResearched("player-1")).toEqual([
      "forged-weapons"
    ]);
    expect(building.researchQueue).toHaveLength(0);
    expect(system.getAttackDamageBonus("player-1")).toBe(1);
  });

  it("drops queued research whose definition no longer exists", () => {
    const system = createSystem();
    const building = barracks({
      researchQueue: [
        {
          technologyKind: "forged-weapons",
          progress: 0
        }
      ]
    });

    const missingDefinitions = new ResearchSystem(20, new Map());
    missingDefinitions.step([building]);

    expect(building.researchQueue).toHaveLength(0);
    expect(
      missingDefinitions.hasTechnology("player-1", "forged-weapons")
    ).toBe(false);
  });
});
