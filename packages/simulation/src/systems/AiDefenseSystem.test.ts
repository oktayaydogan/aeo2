import { describe, expect, it } from "vitest";
import type {
  BuildingDefinition,
  BuildingState,
  GameCommand,
  PlayerPopulationState,
  ResourceStockpile,
  UnitDefinition
} from "../types";
import { AiSystem, type AiUnit } from "./AiSystem";

const TOWN_CENTER: BuildingDefinition = {
  kind: "town-center",
  displayName: "Town Center",
  footprint: { width: 4, height: 4 },
  cost: { wood: 275, food: 0, gold: 100 },
  buildTimeSeconds: 40,
  maxHitPoints: 2400,
  populationProvided: 10
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

function unit(
  id: string,
  ownerId: string,
  kind: AiUnit["kind"],
  position: { x: number; y: number }
): AiUnit {
  return {
    id,
    ownerId,
    kind,
    position,
    destination: null,
    speed: kind === "villager" ? 2.4 : 2.5,
    hitPoints: kind === "villager" ? 25 : 40,
    activity: "idle",
    cargo: null
  };
}

function createDefenseSystem(enemyPosition = { x: 8, y: 6 }) {
  const defender = unit("defender", "player-2", "militia", { x: 6, y: 7 });
  const worker = unit("worker", "player-2", "villager", { x: 7, y: 6 });
  const enemy = unit("enemy", "player-1", "militia", enemyPosition);
  const units = new Map([
    [defender.id, defender],
    [worker.id, worker],
    [enemy.id, enemy]
  ]);
  const buildings = new Map<string, BuildingState>([
    [
      "ai-town-center",
      {
        id: "ai-town-center",
        ownerId: "player-2",
        kind: "town-center",
        position: { x: 4, y: 4 },
        progress: 1,
        completed: true,
        hitPoints: 2400,
        trainingQueue: []
      }
    ]
  ]);
  const commands: GameCommand[] = [];
  const population: PlayerPopulationState = {
    playerId: "player-2",
    used: 2,
    queued: 0,
    cap: 10
  };
  const stockpile: ResourceStockpile = {
    wood: 0,
    food: 0,
    gold: 0
  };

  const system = new AiSystem({
    tickRate: 20,
    mapWidth: 30,
    mapHeight: 30,
    definitions: [
      {
        playerId: "player-2",
        enemyPlayerId: "player-1",
        thinkIntervalTicks: 1
      }
    ],
    units,
    buildings,
    resources: new Map(),
    unitDefinitions: new Map([
      [MILITIA.kind, MILITIA],
      [VILLAGER.kind, VILLAGER]
    ]),
    buildingDefinitions: new Map([[TOWN_CENTER.kind, TOWN_CENTER]]),
    technologyDefinitions: new Map(),
    calculatePopulation: () => population,
    getStockpile: () => stockpile,
    hasTechnology: () => false,
    canPlaceBuilding: () => false,
    findBuildApproach: () => null,
    canReach: () => true,
    executeCommand: (command) => commands.push(command)
  });

  return { system, units, commands, enemy };
}

describe("AiSystem defense state", () => {
  it("prioritizes visible base threats and retreats endangered workers", () => {
    const { system, commands } = createDefenseSystem();

    system.process(1);

    expect(system.getStates()[0]?.mode).toBe("defending");
    expect(commands).toContainEqual({
      type: "attack",
      playerId: "player-2",
      unitIds: ["defender"],
      targetUnitId: "enemy"
    });
    expect(
      commands.some(
        (command) =>
          command.type === "move" &&
          command.playerId === "player-2" &&
          command.unitIds.includes("worker")
      )
    ).toBe(true);
  });

  it("holds defense briefly after a threat clears, then resumes and can re-enter", () => {
    const { system, units, commands, enemy } = createDefenseSystem();

    system.process(1);
    units.delete(enemy.id);
    commands.splice(0);

    system.process(2);
    expect(system.getStates()[0]?.mode).toBe("defending");

    system.process(62);
    expect(system.getStates()[0]?.mode).toBe("idle");

    units.set(enemy.id, {
      ...enemy,
      position: { x: 8, y: 6 }
    });
    system.process(63);

    expect(system.getStates()[0]?.mode).toBe("defending");
    expect(
      commands.some(
        (command) =>
          command.type === "attack" &&
          command.targetUnitId === "enemy"
      )
    ).toBe(true);
  });

  it("ignores an enemy outside current AI visibility", () => {
    const { system, commands } = createDefenseSystem({ x: 25, y: 25 });

    system.process(1);

    expect(system.getStates()[0]?.mode).toBe("idle");
    expect(commands).toEqual([]);
  });
});
