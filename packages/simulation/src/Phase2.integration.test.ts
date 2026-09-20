import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";
import type {
  BuildingDefinition,
  TechnologyDefinition,
  UnitDefinition,
  UnitState
} from "./types";

const TOWN_CENTER: BuildingDefinition = {
  kind: "town-center",
  displayName: "Town Center",
  footprint: { width: 4, height: 4 },
  cost: { wood: 275, food: 0, gold: 100 },
  buildTimeSeconds: 1,
  maxHitPoints: 120,
  populationProvided: 10
};

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

const ARCHERY_RANGE: BuildingDefinition = {
  kind: "archery-range",
  displayName: "Archery Range",
  footprint: { width: 3, height: 3 },
  cost: { wood: 100, food: 0, gold: 0 },
  buildTimeSeconds: 1,
  maxHitPoints: 1050,
  populationProvided: 0
};

const VILLAGER: UnitDefinition = {
  kind: "villager",
  displayName: "Villager",
  cost: { wood: 0, food: 50, gold: 0 },
  trainTimeSeconds: 0.5,
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
  trainTimeSeconds: 0.5,
  maxHitPoints: 40,
  speed: 2.5,
  attackDamage: 4,
  attackRange: 0.75,
  attackCooldownSeconds: 0.3,
  populationCost: 1
};

const ARCHER: UnitDefinition = {
  kind: "archer",
  displayName: "Archer",
  cost: { wood: 25, food: 0, gold: 45 },
  trainTimeSeconds: 0.5,
  maxHitPoints: 30,
  speed: 2.45,
  attackDamage: 4,
  attackRange: 4.5,
  attackCooldownSeconds: 0.4,
  populationCost: 1
};

const FORGED_WEAPONS: TechnologyDefinition = {
  kind: "forged-weapons",
  displayName: "Forged Weapons",
  cost: { wood: 0, food: 75, gold: 75 },
  researchTimeSeconds: 0.2,
  buildingKind: "barracks",
  attackDamageBonus: 1
};

function villager(id: string, x: number, y: number): UnitState {
  return {
    id,
    ownerId: "player-2",
    kind: "villager",
    position: { x, y },
    destination: null,
    speed: 2.4,
    hitPoints: 25,
    activity: "idle",
    cargo: null
  };
}

describe("Phase 2 skirmish vertical slice", () => {
  it("builds an economy, expands production, researches, and launches an attack", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 30, height: 22 },
      buildingDefinitions: [
        TOWN_CENTER,
        HOUSE,
        BARRACKS,
        ARCHERY_RANGE
      ],
      unitDefinitions: [VILLAGER, MILITIA, ARCHER],
      technologyDefinitions: [FORGED_WEAPONS],
      units: [
        villager("ai-villager-1", 16, 7),
        villager("ai-villager-2", 16.7, 7)
      ],
      resources: [
        {
          id: "ai-wood",
          kind: "wood",
          position: { x: 19, y: 5 },
          amount: 1000
        },
        {
          id: "ai-food",
          kind: "food",
          position: { x: 19, y: 10 },
          amount: 1000
        },
        {
          id: "ai-gold",
          kind: "gold",
          position: { x: 19, y: 13 },
          amount: 1000
        }
      ],
      dropOffPoints: [
        {
          id: "ai-dropoff",
          ownerId: "player-2",
          position: { x: 17.5, y: 9 }
        }
      ],
      buildings: [
        {
          id: "player-town-center",
          ownerId: "player-1",
          kind: "town-center",
          position: { x: 2, y: 8 },
          progress: 1,
          completed: true,
          hitPoints: 120,
          trainingQueue: []
        },
        {
          id: "ai-town-center",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 15, y: 8 },
          progress: 1,
          completed: true,
          hitPoints: 120,
          trainingQueue: []
        },
        {
          id: "ai-house",
          ownerId: "player-2",
          kind: "house",
          position: { x: 15, y: 3 },
          progress: 1,
          completed: true,
          hitPoints: 550,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-2": {
          wood: 250,
          food: 500,
          gold: 300
        }
      },
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1,
          targetVillagers: 3,
          targetMilitary: 4,
          attackThreshold: 4
        }
      ]
    });

    let reachedAttack = false;

    for (let step = 0; step < 1800; step += 1) {
      simulation.step();
      const snapshot = simulation.getSnapshot();

      if (
        snapshot.aiPlayers.find(
          (entry) => entry.playerId === "player-2"
        )?.mode === "attacking"
      ) {
        reachedAttack = true;
      }

      if (snapshot.match.status === "ended") {
        break;
      }
    }

    const snapshot = simulation.getSnapshot();
    const aiBuildings = snapshot.buildings.filter(
      (building) => building.ownerId === "player-2"
    );
    const aiUnits = snapshot.units.filter(
      (unit) => unit.ownerId === "player-2"
    );

    expect(
      aiBuildings.some(
        (building) => building.kind === "barracks"
      )
    ).toBe(true);
    expect(
      aiBuildings.some(
        (building) => building.kind === "archery-range"
      )
    ).toBe(true);
    expect(
      aiUnits.filter((unit) => unit.kind !== "villager").length
    ).toBeGreaterThanOrEqual(4);
    expect(
      snapshot.technologies.find(
        (entry) => entry.playerId === "player-2"
      )?.researched
    ).toContain("forged-weapons");
    expect(reachedAttack).toBe(true);

    if (snapshot.match.status === "ended") {
      expect(snapshot.match.winnerPlayerId).toBe("player-2");
    }
  });
});
