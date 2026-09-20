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
  maxHitPoints: 40,
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

const SPEARMAN: UnitDefinition = {
  kind: "spearman",
  displayName: "Spearman",
  cost: { wood: 25, food: 45, gold: 0 },
  trainTimeSeconds: 0.5,
  maxHitPoints: 45,
  speed: 2.35,
  attackDamage: 3,
  attackRange: 0.8,
  attackCooldownSeconds: 0.3,
  populationCost: 1,
  bonuses: [
    {
      targetKind: "archer",
      damage: 5
    }
  ]
};

const FORGED_WEAPONS: TechnologyDefinition = {
  kind: "forged-weapons",
  displayName: "Forged Weapons",
  cost: { wood: 0, food: 75, gold: 75 },
  researchTimeSeconds: 0.2,
  buildingKind: "barracks",
  attackDamageBonus: 1
};

function enemyArcher(): UnitState {
  return {
    id: "enemy-archer",
    ownerId: "player-2",
    kind: "archer",
    position: { x: 11, y: 8 },
    destination: null,
    speed: 2.45,
    hitPoints: 30,
    activity: "idle",
    cargo: null
  };
}

function runSteps(simulation: Simulation, count: number): void {
  for (let step = 0; step < count; step += 1) {
    simulation.step();
  }
}

describe("Phase 2 skirmish vertical slice", () => {
  it("researches, produces counter units, wins a fight, and performs a ranged siege", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 24, height: 20 },
      buildingDefinitions: [
        TOWN_CENTER,
        HOUSE,
        BARRACKS,
        ARCHERY_RANGE
      ],
      unitDefinitions: [MILITIA, ARCHER, SPEARMAN],
      technologyDefinitions: [FORGED_WEAPONS],
      units: [enemyArcher()],
      buildings: [
        {
          id: "player-town-center",
          ownerId: "player-1",
          kind: "town-center",
          position: { x: 2, y: 8 },
          progress: 1,
          completed: true,
          hitPoints: 40,
          trainingQueue: []
        },
        {
          id: "player-house",
          ownerId: "player-1",
          kind: "house",
          position: { x: 2, y: 3 },
          progress: 1,
          completed: true,
          hitPoints: 550,
          trainingQueue: []
        },
        {
          id: "player-barracks",
          ownerId: "player-1",
          kind: "barracks",
          position: { x: 6, y: 8 },
          progress: 1,
          completed: true,
          hitPoints: 1200,
          trainingQueue: []
        },
        {
          id: "player-range",
          ownerId: "player-1",
          kind: "archery-range",
          position: { x: 6, y: 13 },
          progress: 1,
          completed: true,
          hitPoints: 1050,
          trainingQueue: []
        },
        {
          id: "enemy-town-center",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 16, y: 8 },
          progress: 1,
          completed: true,
          hitPoints: 40,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-1": {
          wood: 200,
          food: 300,
          gold: 300
        }
      }
    });

    simulation.queueCommand({
      type: "research",
      playerId: "player-1",
      buildingId: "player-barracks",
      technologyKind: "forged-weapons"
    });
    runSteps(simulation, 5);

    expect(
      simulation.getSnapshot().technologies.find(
        (entry) => entry.playerId === "player-1"
      )?.researched
    ).toContain("forged-weapons");

    simulation.queueCommand({
      type: "train",
      playerId: "player-1",
      buildingId: "player-barracks",
      unitKind: "spearman"
    });
    simulation.queueCommand({
      type: "train",
      playerId: "player-1",
      buildingId: "player-range",
      unitKind: "archer"
    });
    runSteps(simulation, 20);

    const trained = simulation.getSnapshot().units.filter(
      (unit) => unit.ownerId === "player-1"
    );
    const spearman = trained.find(
      (unit) => unit.kind === "spearman"
    );
    const archer = trained.find(
      (unit) => unit.kind === "archer"
    );

    expect(spearman).toBeDefined();
    expect(archer).toBeDefined();

    simulation.queueCommand({
      type: "attack",
      playerId: "player-1",
      unitIds: [spearman?.id ?? ""],
      targetUnitId: "enemy-archer"
    });
    runSteps(simulation, 40);

    expect(
      simulation.getSnapshot().units.some(
        (unit) => unit.id === "enemy-archer"
      )
    ).toBe(false);

    simulation.queueCommand({
      type: "attack-building",
      playerId: "player-1",
      unitIds: [archer?.id ?? ""],
      targetBuildingId: "enemy-town-center"
    });
    runSteps(simulation, 240);

    expect(simulation.getSnapshot().match).toEqual({
      status: "ended",
      winnerPlayerId: "player-1",
      loserPlayerId: "player-2",
      reason: "town-center-destroyed"
    });
  });
});
