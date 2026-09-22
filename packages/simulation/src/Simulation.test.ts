import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";
import type {
  BuildingDefinition,
  SimulationSnapshot,
  UnitDefinition,
  UnitState
} from "./types";

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

const TOWN_CENTER: BuildingDefinition = {
  kind: "town-center",
  displayName: "Town Center",
  footprint: { width: 4, height: 4 },
  cost: { wood: 275, food: 0, gold: 100 },
  buildTimeSeconds: 40,
  maxHitPoints: 2400,
  populationProvided: 10
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

function villager(
  id = "villager-1",
  ownerId = "player-1",
  position = { x: 2, y: 2 }
): UnitState {
  return {
    id,
    ownerId,
    kind: "villager",
    position: { ...position },
    destination: null,
    speed: 2.4,
    hitPoints: 25,
    activity: "idle",
    cargo: null
  };
}

function militia(
  id: string,
  ownerId: string,
  position: { x: number; y: number },
  hitPoints = 40
): UnitState {
  return {
    id,
    ownerId,
    kind: "militia",
    position: { ...position },
    destination: null,
    speed: 2.5,
    hitPoints,
    activity: "idle",
    cargo: null
  };
}

function runSteps(simulation: Simulation, count: number): SimulationSnapshot {
  for (let index = 0; index < count; index += 1) {
    simulation.step();
  }

  return simulation.getSnapshot();
}

describe("Simulation economy loop", () => {
  function createEconomySimulation(): Simulation {
    return new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [villager()],
      resources: [
        {
          id: "tree-1",
          kind: "wood",
          position: { x: 4, y: 2 },
          amount: 30
        }
      ],
      dropOffPoints: [
        {
          id: "town-center-dropoff",
          ownerId: "player-1",
          position: { x: 1, y: 2 }
        }
      ],
      stockpiles: {
        "player-1": { wood: 0, food: 0, gold: 0 }
      }
    });
  }

  it("gathers a resource, returns it, and deposits into the player stockpile", () => {
    const simulation = createEconomySimulation();

    simulation.queueCommand({
      type: "gather",
      playerId: "player-1",
      unitIds: ["villager-1"],
      resourceId: "tree-1"
    });

    const snapshot = runSteps(simulation, 600);
    const stockpile = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-1"
    );
    const resource = snapshot.resources.find((entry) => entry.id === "tree-1");
    const unit = snapshot.units.find((entry) => entry.id === "villager-1");

    expect(stockpile?.resources.wood).toBeCloseTo(30, 5);
    expect(resource?.amount).toBeCloseTo(0, 5);
    expect(unit?.cargo).toBeNull();
    expect(unit?.activity).toBe("idle");
  });

  it("manual movement cancels the active gather task", () => {
    const simulation = createEconomySimulation();

    simulation.queueCommand({
      type: "gather",
      playerId: "player-1",
      unitIds: ["villager-1"],
      resourceId: "tree-1"
    });

    runSteps(simulation, 30);
    const beforeMove = simulation.getSnapshot().resources[0]?.amount;

    simulation.queueCommand({
      type: "move",
      playerId: "player-1",
      unitIds: ["villager-1"],
      target: { x: 8, y: 8 }
    });

    const snapshot = runSteps(simulation, 60);
    const resource = snapshot.resources.find((entry) => entry.id === "tree-1");

    expect(resource?.amount).toBeCloseTo(beforeMove ?? 0, 5);
  });

  it("rejects gather commands for units the player does not own", () => {
    const simulation = createEconomySimulation();

    simulation.queueCommand({
      type: "gather",
      playerId: "player-2",
      unitIds: ["villager-1"],
      resourceId: "tree-1"
    });

    const snapshot = runSteps(simulation, 200);
    const resource = snapshot.resources.find((entry) => entry.id === "tree-1");
    const stockpile = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-1"
    );

    expect(resource?.amount).toBe(30);
    expect(stockpile?.resources.wood).toBe(0);
  });
});

describe("Simulation building construction", () => {
  function createBuildingSimulation(wood: number): Simulation {
    return new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [villager()],
      buildingDefinitions: [HOUSE],
      stockpiles: {
        "player-1": { wood, food: 0, gold: 0 }
      }
    });
  }

  it("deducts resources and completes a villager-built house", () => {
    const simulation = createBuildingSimulation(100);

    simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: ["villager-1"],
      buildingKind: "house",
      position: { x: 4, y: 4 }
    });

    const snapshot = runSteps(simulation, 500);
    const building = snapshot.buildings[0];
    const stockpile = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-1"
    );
    const population = snapshot.population.find(
      (entry) => entry.playerId === "player-1"
    );

    expect(building?.completed).toBe(true);
    expect(building?.hitPoints).toBe(550);
    expect(stockpile?.resources.wood).toBe(75);
    expect(population?.cap).toBe(5);
  });

  it("rejects construction when the player cannot afford it", () => {
    const simulation = createBuildingSimulation(0);

    simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: ["villager-1"],
      buildingKind: "house",
      position: { x: 4, y: 4 }
    });

    expect(runSteps(simulation, 20).buildings).toHaveLength(0);
  });

  it("rejects overlapping building placement", () => {
    const simulation = createBuildingSimulation(100);

    simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: ["villager-1"],
      buildingKind: "house",
      position: { x: 4, y: 4 }
    });
    simulation.step();

    simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: ["villager-1"],
      buildingKind: "house",
      position: { x: 5, y: 5 }
    });

    expect(runSteps(simulation, 20).buildings).toHaveLength(1);
  });

  it("routes movement around building footprints", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 12, height: 10 },
      units: [villager("villager-1", "player-1", { x: 2.5, y: 4.5 })],
      buildingDefinitions: [HOUSE],
      buildings: [
        {
          id: "house-1",
          ownerId: "player-1",
          kind: "house",
          position: { x: 4, y: 3 },
          progress: 1,
          completed: true,
          hitPoints: 550,
          trainingQueue: []
        }
      ]
    });

    simulation.queueCommand({
      type: "move",
      playerId: "player-1",
      unitIds: ["villager-1"],
      target: { x: 8.5, y: 4.5 }
    });

    for (let index = 0; index < 120; index += 1) {
      simulation.step();
      const unit = simulation
        .getSnapshot()
        .units.find((entry) => entry.id === "villager-1");

      expect(unit).toBeDefined();

      const cellX = Math.floor(unit?.position.x ?? 0);
      const cellY = Math.floor(unit?.position.y ?? 0);
      const insideHouse = cellX >= 4 && cellX <= 5 && cellY >= 3 && cellY <= 4;

      expect(insideHouse).toBe(false);
    }

    const unit = simulation
      .getSnapshot()
      .units.find((entry) => entry.id === "villager-1");

    expect(unit?.position.x).toBeCloseTo(8.5, 1);
    expect(unit?.position.y).toBeCloseTo(4.5, 1);
  });
});

describe("Simulation population and training", () => {
  it("trains a militia when population capacity is available", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [villager()],
      buildingDefinitions: [HOUSE, BARRACKS],
      unitDefinitions: [MILITIA],
      buildings: [
        {
          id: "house-1",
          ownerId: "player-1",
          kind: "house",
          position: { x: 10, y: 10 },
          progress: 1,
          completed: true,
          hitPoints: 550,
          trainingQueue: []
        },
        {
          id: "barracks-1",
          ownerId: "player-1",
          kind: "barracks",
          position: { x: 4, y: 4 },
          progress: 1,
          completed: true,
          hitPoints: 1200,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-1": { wood: 0, food: 100, gold: 100 }
      }
    });

    simulation.queueCommand({
      type: "train",
      playerId: "player-1",
      buildingId: "barracks-1",
      unitKind: "militia"
    });

    const snapshot = runSteps(simulation, 300);
    const militiaUnit = snapshot.units.find((unit) => unit.kind === "militia");
    const stockpile = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-1"
    );
    const population = snapshot.population.find(
      (entry) => entry.playerId === "player-1"
    );

    expect(militiaUnit?.ownerId).toBe("player-1");
    expect(stockpile?.resources.food).toBe(40);
    expect(stockpile?.resources.gold).toBe(80);
    expect(population?.used).toBe(2);
    expect(population?.queued).toBe(0);
    expect(population?.cap).toBe(5);
  });

  it("blocks training at the population cap without charging resources", () => {
    const units = Array.from({ length: 5 }, (_, index) =>
      villager(
        `villager-${index + 1}`,
        "player-1",
        { x: 1 + index * 0.5, y: 1 }
      )
    );

    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units,
      buildingDefinitions: [HOUSE, BARRACKS],
      unitDefinitions: [VILLAGER, MILITIA],
      buildings: [
        {
          id: "house-1",
          ownerId: "player-1",
          kind: "house",
          position: { x: 10, y: 10 },
          progress: 1,
          completed: true,
          hitPoints: 550,
          trainingQueue: []
        },
        {
          id: "barracks-1",
          ownerId: "player-1",
          kind: "barracks",
          position: { x: 5, y: 5 },
          progress: 1,
          completed: true,
          hitPoints: 1200,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-1": { wood: 0, food: 100, gold: 100 }
      }
    });

    simulation.queueCommand({
      type: "train",
      playerId: "player-1",
      buildingId: "barracks-1",
      unitKind: "militia"
    });
    simulation.step();

    const snapshot = simulation.getSnapshot();
    const barracks = snapshot.buildings.find(
      (building) => building.id === "barracks-1"
    );
    const stockpile = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-1"
    );

    expect(snapshot.population[0]).toMatchObject({
      used: 5,
      queued: 0,
      cap: 5
    });
    expect(barracks?.trainingQueue).toHaveLength(0);
    expect(stockpile?.resources.food).toBe(100);
    expect(stockpile?.resources.gold).toBe(100);
  });

  it("trains villagers from the Town Center", () => {
    const units = Array.from({ length: 8 }, (_, index) =>
      villager(
        `villager-${index + 1}`,
        "player-1",
        { x: 1 + (index % 4) * 0.7, y: 1 + Math.floor(index / 4) * 0.7 }
      )
    );

    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units,
      buildingDefinitions: [TOWN_CENTER],
      unitDefinitions: [VILLAGER],
      buildings: [
        {
          id: "town-center-1",
          ownerId: "player-1",
          kind: "town-center",
          position: { x: 6, y: 6 },
          progress: 1,
          completed: true,
          hitPoints: 2400,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-1": { wood: 0, food: 100, gold: 0 }
      }
    });

    simulation.queueCommand({
      type: "train",
      playerId: "player-1",
      buildingId: "town-center-1",
      unitKind: "villager"
    });

    const snapshot = runSteps(simulation, 240);
    const population = snapshot.population.find(
      (entry) => entry.playerId === "player-1"
    );

    expect(snapshot.units.filter((unit) => unit.kind === "villager")).toHaveLength(9);
    expect(population).toMatchObject({
      used: 9,
      queued: 0,
      cap: 10
    });
    expect(
      snapshot.stockpiles.find((entry) => entry.playerId === "player-1")
        ?.resources.food
    ).toBe(50);
  });
});

describe("Simulation melee combat", () => {
  it("chases and kills an enemy unit using attack cooldowns", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      unitDefinitions: [MILITIA],
      units: [
        militia("militia-player", "player-1", { x: 2, y: 2 }),
        militia("militia-enemy", "player-2", { x: 4, y: 2 }, 12)
      ]
    });

    simulation.queueCommand({
      type: "attack",
      playerId: "player-1",
      unitIds: ["militia-player"],
      targetUnitId: "militia-enemy"
    });

    const snapshot = runSteps(simulation, 140);

    expect(snapshot.units.some((unit) => unit.id === "militia-enemy")).toBe(false);
    expect(
      snapshot.units.find((unit) => unit.id === "militia-player")?.activity
    ).toBe("idle");
  });

  it("lets deterministic enemy AI acquire and attack the nearest player unit", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      unitDefinitions: [MILITIA],
      units: [
        villager("player-target", "player-1", { x: 2, y: 2 }),
        militia("enemy-ai", "player-2", { x: 6, y: 2 })
      ],
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1
        }
      ]
    });

    const snapshot = runSteps(simulation, 260);

    expect(snapshot.units.some((unit) => unit.id === "player-target")).toBe(false);
    expect(snapshot.units.some((unit) => unit.id === "enemy-ai")).toBe(true);
  });
});


describe("Simulation rally points", () => {
  it("moves a trained unit toward the selected building rally point", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      buildingDefinitions: [TOWN_CENTER],
      unitDefinitions: [VILLAGER],
      buildings: [
        {
          id: "town-center-1",
          ownerId: "player-1",
          kind: "town-center",
          position: { x: 4, y: 4 },
          progress: 1,
          completed: true,
          hitPoints: 2400,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-1": { wood: 0, food: 100, gold: 0 }
      }
    });

    simulation.queueCommand({
      type: "set-rally-point",
      playerId: "player-1",
      buildingId: "town-center-1",
      target: { x: 12.5, y: 12.5 }
    });
    simulation.queueCommand({
      type: "train",
      playerId: "player-1",
      buildingId: "town-center-1",
      unitKind: "villager"
    });

    const snapshot = runSteps(simulation, 260);
    const trained = snapshot.units.find((unit) => unit.kind === "villager");

    expect(snapshot.buildings[0]?.rallyPoint).toEqual({
      x: 12.5,
      y: 12.5
    });
    expect(trained?.position.x).toBeGreaterThan(8);
    expect(trained?.position.y).toBeGreaterThan(8);
  });

  it("rejects rally changes from a different player", () => {
    const simulation = new Simulation({
      map: { width: 20, height: 20 },
      buildingDefinitions: [TOWN_CENTER],
      buildings: [
        {
          id: "town-center-1",
          ownerId: "player-1",
          kind: "town-center",
          position: { x: 4, y: 4 },
          progress: 1,
          completed: true,
          hitPoints: 2400,
          trainingQueue: []
        }
      ]
    });

    simulation.queueCommand({
      type: "set-rally-point",
      playerId: "player-2",
      buildingId: "town-center-1",
      target: { x: 10, y: 10 }
    });
    simulation.step();

    expect(simulation.getSnapshot().buildings[0]?.rallyPoint).toBeNull();
  });
});

describe("Simulation AI state", () => {
  it("transitions from waiting to attacking", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      unitDefinitions: [MILITIA],
      units: [
        villager("target", "player-1", { x: 2, y: 2 }),
        militia("enemy", "player-2", { x: 6, y: 2 })
      ],
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 5
        }
      ]
    });

    expect(simulation.getSnapshot().aiPlayers[0]?.mode).toBe("waiting");
    runSteps(simulation, 6);
    expect(simulation.getSnapshot().aiPlayers[0]?.mode).toBe("attacking");
  });
});


describe("Simulation building combat and match outcome", () => {
  const FRAGILE_TOWN_CENTER = {
    ...TOWN_CENTER,
    maxHitPoints: 12
  };

  it("ends the match when the enemy Town Center is destroyed", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      buildingDefinitions: [FRAGILE_TOWN_CENTER],
      unitDefinitions: [MILITIA],
      units: [
        militia("player-militia", "player-1", { x: 3.4, y: 5 })
      ],
      buildings: [
        {
          id: "enemy-town-center",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 4, y: 4 },
          progress: 1,
          completed: true,
          hitPoints: 12,
          trainingQueue: []
        }
      ]
    });

    simulation.queueCommand({
      type: "attack-building",
      playerId: "player-1",
      unitIds: ["player-militia"],
      targetBuildingId: "enemy-town-center"
    });

    const snapshot = runSteps(simulation, 100);

    expect(
      snapshot.buildings.some(
        (building) => building.id === "enemy-town-center"
      )
    ).toBe(false);
    expect(snapshot.match).toEqual({
      status: "ended",
      winnerPlayerId: "player-1",
      loserPlayerId: "player-2",
      reason: "town-center-destroyed"
    });
  });

  it("lets enemy AI siege the Town Center when no defending units remain", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      buildingDefinitions: [FRAGILE_TOWN_CENTER],
      unitDefinitions: [MILITIA],
      units: [
        militia("enemy-ai", "player-2", { x: 3.4, y: 5 })
      ],
      buildings: [
        {
          id: "player-town-center",
          ownerId: "player-1",
          kind: "town-center",
          position: { x: 4, y: 4 },
          progress: 1,
          completed: true,
          hitPoints: 12,
          trainingQueue: []
        }
      ],
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1
        }
      ]
    });

    const snapshot = runSteps(simulation, 100);

    expect(snapshot.match.status).toBe("ended");
    expect(snapshot.match.winnerPlayerId).toBe("player-2");
    expect(snapshot.match.loserPlayerId).toBe("player-1");
  });

  it("releases pathfinding cells after a non-Town-Center building is destroyed", () => {
    const fragileHouse = {
      ...HOUSE,
      maxHitPoints: 4
    };

    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 12, height: 10 },
      buildingDefinitions: [fragileHouse],
      unitDefinitions: [MILITIA],
      units: [
        militia("attacker", "player-1", { x: 3.4, y: 4.5 })
      ],
      buildings: [
        {
          id: "enemy-house",
          ownerId: "player-2",
          kind: "house",
          position: { x: 4, y: 4 },
          progress: 1,
          completed: true,
          hitPoints: 4,
          trainingQueue: []
        }
      ]
    });

    simulation.queueCommand({
      type: "attack-building",
      playerId: "player-1",
      unitIds: ["attacker"],
      targetBuildingId: "enemy-house"
    });

    runSteps(simulation, 5);

    expect(simulation.getSnapshot().buildings).toHaveLength(0);
    expect(simulation.getSnapshot().match.status).toBe("playing");

    simulation.queueCommand({
      type: "move",
      playerId: "player-1",
      unitIds: ["attacker"],
      target: { x: 5.5, y: 4.5 }
    });

    const snapshot = runSteps(simulation, 30);
    const attacker = snapshot.units.find((unit) => unit.id === "attacker");

    expect(attacker?.position.x).toBeGreaterThan(4);
  });
});


describe("Phase 2 ranged production and research", () => {
  const ARCHERY_RANGE = {
    kind: "archery-range" as const,
    displayName: "Archery Range",
    footprint: { width: 3, height: 3 },
    cost: { wood: 100, food: 0, gold: 0 },
    buildTimeSeconds: 18,
    maxHitPoints: 1050,
    populationProvided: 0
  };

  const ARCHER = {
    kind: "archer" as const,
    displayName: "Archer",
    cost: { wood: 25, food: 0, gold: 45 },
    trainTimeSeconds: 2,
    maxHitPoints: 30,
    speed: 2.45,
    attackDamage: 4,
    attackRange: 4.5,
    attackCooldownSeconds: 1.7,
    populationCost: 1
  };

  const FORGED_WEAPONS = {
    kind: "forged-weapons" as const,
    displayName: "Forged Weapons",
    cost: { wood: 0, food: 75, gold: 75 },
    researchTimeSeconds: 0.1,
    buildingKind: "barracks" as const,
    attackDamageBonus: 1
  };

  it("trains an Archer from an Archery Range", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      buildingDefinitions: [HOUSE, ARCHERY_RANGE],
      unitDefinitions: [ARCHER],
      buildings: [
        {
          id: "house-1",
          ownerId: "player-1",
          kind: "house",
          position: { x: 10, y: 10 },
          progress: 1,
          completed: true,
          hitPoints: 550,
          trainingQueue: []
        },
        {
          id: "range-1",
          ownerId: "player-1",
          kind: "archery-range",
          position: { x: 4, y: 4 },
          progress: 1,
          completed: true,
          hitPoints: 1050,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-1": { wood: 100, food: 0, gold: 100 }
      }
    });

    simulation.queueCommand({
      type: "train",
      playerId: "player-1",
      buildingId: "range-1",
      unitKind: "archer"
    });

    const snapshot = runSteps(simulation, 60);

    expect(
      snapshot.units.some(
        (unit) =>
          unit.ownerId === "player-1" &&
          unit.kind === "archer"
      )
    ).toBe(true);
  });

  it("researches a permanent attack bonus and applies it to combat", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      buildingDefinitions: [BARRACKS],
      unitDefinitions: [MILITIA],
      technologyDefinitions: [FORGED_WEAPONS],
      units: [
        militia("attacker", "player-1", { x: 2, y: 2 }),
        militia("target", "player-2", { x: 2.5, y: 2 })
      ],
      buildings: [
        {
          id: "barracks-1",
          ownerId: "player-1",
          kind: "barracks",
          position: { x: 6, y: 6 },
          progress: 1,
          completed: true,
          hitPoints: 1200,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-1": { wood: 0, food: 100, gold: 100 }
      }
    });

    simulation.queueCommand({
      type: "research",
      playerId: "player-1",
      buildingId: "barracks-1",
      technologyKind: "forged-weapons"
    });

    runSteps(simulation, 3);

    expect(
      simulation.getSnapshot().technologies.find(
        (entry) => entry.playerId === "player-1"
      )?.researched
    ).toContain("forged-weapons");

    simulation.queueCommand({
      type: "attack",
      playerId: "player-1",
      unitIds: ["attacker"],
      targetUnitId: "target"
    });

    simulation.step();

    expect(
      simulation.getSnapshot().units.find(
        (unit) => unit.id === "target"
      )?.hitPoints
    ).toBe(35);
  });
});

describe("Phase 2 skirmish AI economy", () => {
  it("moves idle villagers onto deterministic resource gathering jobs", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      unitDefinitions: [VILLAGER, MILITIA],
      units: [
        villager("ai-villager-1", "player-2", { x: 6, y: 6 }),
        villager("ai-villager-2", "player-2", { x: 6.5, y: 6 })
      ],
      resources: [
        {
          id: "ai-tree",
          kind: "wood",
          position: { x: 8, y: 6 },
          amount: 100
        },
        {
          id: "ai-food",
          kind: "food",
          position: { x: 6, y: 8 },
          amount: 100
        }
      ],
      dropOffPoints: [
        {
          id: "ai-dropoff",
          ownerId: "player-2",
          position: { x: 5.5, y: 6 }
        }
      ],
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1,
          targetVillagers: 2,
          targetMilitary: 0,
          attackThreshold: 99
        }
      ]
    });

    const snapshot = runSteps(simulation, 100);
    const resources = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-2"
    )?.resources;

    expect((resources?.wood ?? 0) + (resources?.food ?? 0)).toBeGreaterThan(0);
    expect(snapshot.aiPlayers[0]?.mode).toBe("military");
  });

  it("queues military production before the attack threshold is reached", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      buildingDefinitions: [BARRACKS, TOWN_CENTER],
      unitDefinitions: [VILLAGER, MILITIA],
      units: [
        villager("ai-villager-1", "player-2", { x: 4, y: 4 })
      ],
      buildings: [
        {
          id: "ai-town-center",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 2, y: 8 },
          progress: 1,
          completed: true,
          hitPoints: 2400,
          trainingQueue: []
        },
        {
          id: "ai-barracks",
          ownerId: "player-2",
          kind: "barracks",
          position: { x: 8, y: 8 },
          progress: 1,
          completed: true,
          hitPoints: 1200,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-2": { wood: 0, food: 200, gold: 100 }
      },
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1,
          targetVillagers: 1,
          targetMilitary: 2,
          attackThreshold: 2
        }
      ]
    });

    runSteps(simulation, 2);

    const barracks = simulation.getSnapshot().buildings.find(
      (building) => building.id === "ai-barracks"
    );

    expect(barracks?.trainingQueue[0]?.unitKind).toBe("militia");
    expect(simulation.getSnapshot().aiPlayers[0]?.mode).toBe("military");
  });
});


describe("Phase 2 skirmish AI construction and research", () => {
  it("constructs a missing Barracks from its own economy", () => {
    const fastBarracks = {
      ...BARRACKS,
      buildTimeSeconds: 1
    };

    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 24, height: 24 },
      buildingDefinitions: [TOWN_CENTER, fastBarracks],
      unitDefinitions: [VILLAGER, MILITIA],
      units: [
        villager("ai-builder", "player-2", { x: 7, y: 7 })
      ],
      buildings: [
        {
          id: "ai-town-center",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 8, y: 8 },
          progress: 1,
          completed: true,
          hitPoints: 2400,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-2": { wood: 75, food: 0, gold: 0 }
      },
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1,
          targetVillagers: 1,
          targetMilitary: 2,
          attackThreshold: 99
        }
      ]
    });

    runSteps(simulation, 2);

    expect(
      simulation.getSnapshot().buildings.some(
        (building) =>
          building.ownerId === "player-2" &&
          building.kind === "barracks"
      )
    ).toBe(true);
  });

  it("researches an available upgrade after reaching its army target", () => {
    const forgedWeapons = {
      kind: "forged-weapons" as const,
      displayName: "Forged Weapons",
      cost: { wood: 0, food: 75, gold: 75 },
      researchTimeSeconds: 0.1,
      buildingKind: "barracks" as const,
      attackDamageBonus: 1
    };

    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      buildingDefinitions: [TOWN_CENTER, BARRACKS],
      unitDefinitions: [VILLAGER, MILITIA],
      technologyDefinitions: [forgedWeapons],
      units: [
        militia("ai-militia-1", "player-2", { x: 8, y: 8 }),
        militia("ai-militia-2", "player-2", { x: 8.7, y: 8 })
      ],
      buildings: [
        {
          id: "ai-town-center",
          ownerId: "player-2",
          kind: "town-center",
          position: { x: 2, y: 2 },
          progress: 1,
          completed: true,
          hitPoints: 2400,
          trainingQueue: []
        },
        {
          id: "ai-barracks",
          ownerId: "player-2",
          kind: "barracks",
          position: { x: 10, y: 10 },
          progress: 1,
          completed: true,
          hitPoints: 1200,
          trainingQueue: []
        }
      ],
      stockpiles: {
        "player-2": { wood: 0, food: 100, gold: 100 }
      },
      aiPlayers: [
        {
          playerId: "player-2",
          enemyPlayerId: "player-1",
          thinkIntervalTicks: 1,
          targetVillagers: 0,
          targetMilitary: 2,
          attackThreshold: 99
        }
      ]
    });

    runSteps(simulation, 5);

    expect(
      simulation.getSnapshot().technologies.find(
        (entry) => entry.playerId === "player-2"
      )?.researched
    ).toContain("forged-weapons");
  });
});


describe("Phase 2 military counters", () => {
  const ARCHER = {
    kind: "archer" as const,
    displayName: "Archer",
    cost: { wood: 25, food: 0, gold: 45 },
    trainTimeSeconds: 14,
    maxHitPoints: 30,
    speed: 2.45,
    attackDamage: 4,
    attackRange: 4.5,
    attackCooldownSeconds: 1.7,
    populationCost: 1
  };

  const SPEARMAN = {
    kind: "spearman" as const,
    displayName: "Spearman",
    cost: { wood: 25, food: 45, gold: 0 },
    trainTimeSeconds: 13,
    maxHitPoints: 45,
    speed: 2.35,
    attackDamage: 3,
    attackRange: 0.8,
    attackCooldownSeconds: 1.3,
    populationCost: 1,
    bonuses: [
      {
        targetKind: "archer" as const,
        damage: 5
      }
    ]
  };

  it("applies Spearman bonus damage against Archers", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      unitDefinitions: [SPEARMAN, ARCHER],
      units: [
        {
          id: "spearman-1",
          ownerId: "player-1",
          kind: "spearman",
          position: { x: 2, y: 2 },
          destination: null,
          speed: 2.35,
          hitPoints: 45,
          activity: "idle",
          cargo: null
        },
        {
          id: "archer-1",
          ownerId: "player-2",
          kind: "archer",
          position: { x: 2.5, y: 2 },
          destination: null,
          speed: 2.45,
          hitPoints: 30,
          activity: "idle",
          cargo: null
        }
      ]
    });

    simulation.queueCommand({
      type: "attack",
      playerId: "player-1",
      unitIds: ["spearman-1"],
      targetUnitId: "archer-1"
    });
    simulation.step();

    expect(
      simulation.getSnapshot().units.find(
        (unit) => unit.id === "archer-1"
      )?.hitPoints
    ).toBe(22);
  });

  it("does not apply the Archer counter bonus against other unit kinds", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      unitDefinitions: [SPEARMAN, MILITIA],
      units: [
        {
          id: "spearman-1",
          ownerId: "player-1",
          kind: "spearman",
          position: { x: 2, y: 2 },
          destination: null,
          speed: 2.35,
          hitPoints: 45,
          activity: "idle",
          cargo: null
        },
        militia("militia-target", "player-2", { x: 2.5, y: 2 })
      ]
    });

    simulation.queueCommand({
      type: "attack",
      playerId: "player-1",
      unitIds: ["spearman-1"],
      targetUnitId: "militia-target"
    });
    simulation.step();

    expect(
      simulation.getSnapshot().units.find(
        (unit) => unit.id === "militia-target"
      )?.hitPoints
    ).toBe(37);
  });
});


describe("group movement determinism", () => {
  it("assigns the same formation regardless of command unit-id order", () => {
    const units = [
      villager("villager-b", "player-1", { x: 2, y: 2 }),
      villager("villager-a", "player-1", { x: 2.5, y: 2 }),
      villager("villager-c", "player-1", { x: 3, y: 2 })
    ];
    const first = new Simulation({
      tickRate: 20,
      map: { width: 12, height: 12 },
      units
    });
    const second = new Simulation({
      tickRate: 20,
      map: { width: 12, height: 12 },
      units
    });

    first.queueCommand({
      type: "move",
      playerId: "player-1",
      unitIds: ["villager-b", "villager-a", "villager-c"],
      target: { x: 8, y: 8 }
    });
    second.queueCommand({
      type: "move",
      playerId: "player-1",
      unitIds: ["villager-c", "villager-b", "villager-a"],
      target: { x: 8, y: 8 }
    });

    first.step();
    second.step();

    const positions = (simulation: Simulation) =>
      simulation
        .getSnapshot()
        .units.map((unit) => ({
          id: unit.id,
          position: unit.position,
          destination: unit.destination
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

    expect(positions(first)).toEqual(positions(second));
  });
});
