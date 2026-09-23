import { describe, expect, it } from "vitest";
import type {
  GameCommand,
  PlayerPopulationState,
  ResourceStockpile,
  UnitDefinition
} from "../types";
import { AiSystem, type AiUnit } from "./AiSystem";

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
    speed: 2.5,
    hitPoints: 40,
    activity: "idle",
    cargo: null
  };
}

function createSystem(): {
  system: AiSystem<AiUnit>;
  commands: GameCommand[];
  attacker: AiUnit;
} {
  const attacker = unit("enemy", "player-2", "militia", { x: 6, y: 2 });
  const target = unit("target", "player-1", "villager", { x: 2, y: 2 });
  const units = new Map([
    [attacker.id, attacker],
    [target.id, target]
  ]);
  const commands: GameCommand[] = [];
  const population: PlayerPopulationState = {
    playerId: "player-2",
    used: 1,
    queued: 0,
    cap: 5
  };
  const stockpile: ResourceStockpile = { wood: 0, food: 0, gold: 0 };

  const system = new AiSystem({
    tickRate: 20,
    mapWidth: 20,
    mapHeight: 20,
    definitions: [
      {
        playerId: "player-2",
        enemyPlayerId: "player-1",
        thinkIntervalTicks: 1
      }
    ],
    units,
    buildings: new Map(),
    resources: new Map(),
    unitDefinitions: new Map([[MILITIA.kind, MILITIA]]),
    buildingDefinitions: new Map(),
    technologyDefinitions: new Map(),
    calculatePopulation: () => population,
    getStockpile: () => stockpile,
    hasTechnology: () => false,
    canPlaceBuilding: () => false,
    findBuildApproach: () => null,
    canReach: () => true,
    executeCommand: (command) => {
      commands.push(command);
    }
  });

  return { system, commands, attacker };
}

describe("AiSystem", () => {
  it("produces deterministic commands without mutating gameplay entities", () => {
    const first = createSystem();
    const second = createSystem();

    first.system.process(1);
    second.system.process(1);

    expect(first.commands).toEqual(second.commands);
    expect(first.commands).toEqual([
      {
        type: "attack",
        playerId: "player-2",
        unitIds: ["enemy"],
        targetUnitId: "target"
      }
    ]);
    expect(first.system.getStates()).toEqual([
      { playerId: "player-2", mode: "attacking" }
    ]);
    expect(first.attacker.activity).toBe("idle");
    expect(first.attacker.attackTask).toBeUndefined();
  });

  it("does not think before the configured interval", () => {
    const { system, commands } = createSystem();

    system.process(0);

    expect(commands).toEqual([]);
    expect(system.getStates()[0]?.mode).toBe("waiting");
  });
});
