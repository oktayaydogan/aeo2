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

const TOWN_CENTER: BuildingDefinition = {
  kind: "town-center",
  displayName: "Town Center",
  footprint: { width: 4, height: 4 },
  cost: { wood: 0, food: 0, gold: 0 },
  buildTimeSeconds: 1,
  maxHitPoints: 2400,
  populationProvided: 5
};

const WOOD_DEPOT: BuildingDefinition = {
  kind: "wood-depot",
  displayName: "Wood Depot",
  footprint: { width: 2, height: 2 },
  cost: { wood: 80, food: 0, gold: 0 },
  buildTimeSeconds: 12,
  maxHitPoints: 650,
  populationProvided: 0,
  dropOffAccepts: ["wood"]
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

  it("builds a wood drop-off near a discovered distant forest", () => {
    const villagers = [
      unit("worker-1", "player-2", "villager", { x: 7, y: 5 }),
      unit("worker-2", "player-2", "villager", { x: 7.5, y: 5 }),
      unit("worker-3", "player-2", "villager", { x: 7, y: 5.5 }),
      unit("worker-4", "player-2", "villager", { x: 7.5, y: 5.5 })
    ];
    const buildings = new Map<string, BuildingState>([
      [
        "tc",
        {
          id: "tc",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 1, y: 3 },
          progress: 1,
          completed: true,
          hitPoints: 2400,
          trainingQueue: []
        }
      ],
      [
        "barracks",
        {
          id: "barracks",
          ownerId: "player-2",
          kind: "barracks",
          position: { x: 1, y: 9 },
          progress: 1,
          completed: true,
          hitPoints: 1000,
          trainingQueue: []
        }
      ]
    ]);
    const commands: GameCommand[] = [];
    let buildSequence = 0;
    const system = new AiSystem({
      tickRate: 20,
      mapWidth: 30,
      mapHeight: 30,
      definitions: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1,
          targetVillagers: 4,
          targetMilitary: 0,
          attackThreshold: 99
        }
      ],
      units: new Map(villagers.map((entry) => [entry.id, entry])),
      buildings,
      resources: new Map([
        [
          "tree-edge",
          {
            id: "tree-edge",
            kind: "wood",
            position: { x: 10.5, y: 5.5 },
            amount: 80,
            blocksMovement: true
          }
        ]
      ]),
      unitDefinitions: new Map(),
      buildingDefinitions: new Map([
        [TOWN_CENTER.kind, TOWN_CENTER],
        [WOOD_DEPOT.kind, WOOD_DEPOT]
      ]),
      technologyDefinitions: new Map(),
      calculatePopulation: (): PlayerPopulationState => ({
        playerId: "player-2",
        used: 4,
        queued: 0,
        cap: 20
      }),
      getStockpile: () => ({ wood: 200, food: 0, gold: 0 }),
      hasTechnology: () => false,
      canPlaceBuilding: () => true,
      findBuildApproach: (_builder, _definition, position) => ({
        ...position
      }),
      canReach: () => true,
      executeCommand: (command) => {
        commands.push(command);

        if (command.type !== "build") {
          return;
        }

        buildSequence += 1;
        buildings.set(`planned-${buildSequence}`, {
          id: `planned-${buildSequence}`,
          ownerId: command.playerId,
          kind: command.buildingKind,
          position: { ...command.position },
          progress: 0,
          completed: false,
          hitPoints: 1,
          trainingQueue: []
        });

        for (const unitId of command.unitIds) {
          const builder = villagers.find((entry) => entry.id === unitId);
          if (builder) {
            builder.buildTask = {};
          }
        }
      }
    });

    system.process(1);

    const build = commands.find(
      (command) =>
        command.type === "build" &&
        command.buildingKind === "wood-depot"
    );

    expect(build).toBeDefined();

    if (build?.type === "build") {
      expect(
        Math.hypot(
          build.position.x - 10.5,
          build.position.y - 5.5
        )
      ).toBeLessThan(6);
    }
  });

  it("does not duplicate a drop-off beside an already covered resource", () => {
    const worker = unit("worker", "player-2", "villager", {
      x: 9,
      y: 5
    });
    const buildings = new Map<string, BuildingState>([
      [
        "tc",
        {
          id: "tc",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 1, y: 3 },
          progress: 1,
          completed: true,
          hitPoints: 2400,
          trainingQueue: []
        }
      ],
      [
        "wood-depot",
        {
          id: "wood-depot",
          ownerId: "player-2",
          kind: "wood-depot",
          position: { x: 9, y: 4 },
          progress: 1,
          completed: true,
          hitPoints: 650,
          trainingQueue: []
        }
      ]
    ]);
    const commands: GameCommand[] = [];
    const system = new AiSystem({
      tickRate: 20,
      mapWidth: 30,
      mapHeight: 30,
      definitions: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1,
          targetVillagers: 4,
          targetMilitary: 0,
          attackThreshold: 99
        }
      ],
      units: new Map([
        [worker.id, worker],
        ["worker-2", unit("worker-2", "player-2", "villager", { x: 9, y: 5.5 })],
        ["worker-3", unit("worker-3", "player-2", "villager", { x: 9.5, y: 5 })],
        ["worker-4", unit("worker-4", "player-2", "villager", { x: 9.5, y: 5.5 })]
      ]),
      buildings,
      resources: new Map([
        [
          "tree-covered",
          {
            id: "tree-covered",
            kind: "wood",
            position: { x: 10.5, y: 5.5 },
            amount: 80,
            blocksMovement: true
          }
        ]
      ]),
      unitDefinitions: new Map(),
      buildingDefinitions: new Map([
        [TOWN_CENTER.kind, TOWN_CENTER],
        [WOOD_DEPOT.kind, WOOD_DEPOT]
      ]),
      technologyDefinitions: new Map(),
      calculatePopulation: () => ({
        playerId: "player-2",
        used: 4,
        queued: 0,
        cap: 20
      }),
      getStockpile: () => ({ wood: 200, food: 0, gold: 0 }),
      hasTechnology: () => false,
      canPlaceBuilding: () => true,
      findBuildApproach: () => ({ x: 8, y: 5 }),
      canReach: () => true,
      executeCommand: (command) => commands.push(command)
    });

    system.process(1);

    expect(
      commands.some(
        (command) =>
          command.type === "build" &&
          command.buildingKind === "wood-depot"
      )
    ).toBe(false);
  });
});
