import { describe, expect, it } from "vitest";
import { GridNavigation } from "../GridNavigation";
import type {
  BuildingDefinition,
  BuildingState,
  MatchState,
  UnitDefinition,
  Vector2
} from "../types";
import {
  CombatSystem,
  type CombatUnit
} from "./CombatSystem";

function createUnit(
  id: string,
  ownerId: string,
  kind: CombatUnit["kind"],
  hitPoints: number,
  position: Vector2
): CombatUnit {
  return {
    id,
    ownerId,
    kind,
    position: { ...position },
    destination: null,
    speed: 2,
    hitPoints,
    activity: "idle",
    cargo: null,
    waypoints: [],
    attackCooldownTicks: 0
  };
}

describe("CombatSystem", () => {
  it("applies data-driven counter damage and removes a killed unit", () => {
    const attacker = createUnit("spear-1", "p1", "spearman", 40, { x: 1, y: 1 });
    const target = createUnit("archer-1", "p2", "archer", 8, { x: 1.5, y: 1 });
    attacker.attackTask = { targetType: "unit", targetId: target.id };

    const spearman: UnitDefinition = {
      kind: "spearman",
      displayName: "Spearman",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 40,
      speed: 2,
      attackDamage: 3,
      attackRange: 1,
      attackCooldownSeconds: 1,
      populationCost: 1,
      bonuses: [{ targetKind: "archer", damage: 5 }]
    };
    const archer: UnitDefinition = {
      kind: "archer",
      displayName: "Archer",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 8,
      speed: 2,
      attackDamage: 1,
      attackRange: 4,
      attackCooldownSeconds: 1,
      populationCost: 1
    };
    const units = new Map([
      [attacker.id, attacker],
      [target.id, target]
    ]);
    const matchState: MatchState = {
      status: "playing",
      winnerPlayerId: null,
      loserPlayerId: null,
      reason: null
    };
    const navigation = new GridNavigation({ width: 10, height: 10 });

    const system = new CombatSystem(
      20,
      units,
      new Map(),
      new Map([
        [spearman.kind, spearman],
        [archer.kind, archer]
      ]),
      new Map(),
      matchState,
      navigation,
      () => 0,
      () => true,
      () => null,
      () => undefined
    );

    system.step();

    expect(units.has(target.id)).toBe(false);
    expect(attacker.attackTask).toBeUndefined();
    expect(attacker.attackCooldownTicks).toBe(20);
    expect(matchState.status).toBe("playing");
  });

  it("routes melee attackers to distinct approach slots around a unit target", () => {
    const first = createUnit("militia-a", "p1", "militia", 40, {
      x: 1,
      y: 2
    });
    const second = createUnit("militia-b", "p1", "militia", 40, {
      x: 1,
      y: 3
    });
    const target = createUnit("archer-target", "p2", "archer", 30, {
      x: 5,
      y: 2.5
    });
    first.attackTask = { targetType: "unit", targetId: target.id };
    second.attackTask = { targetType: "unit", targetId: target.id };

    const militia: UnitDefinition = {
      kind: "militia",
      displayName: "Militia",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 40,
      speed: 2,
      attackDamage: 4,
      attackRange: 0.75,
      attackCooldownSeconds: 1,
      populationCost: 1
    };
    const archer: UnitDefinition = {
      kind: "archer",
      displayName: "Archer",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 30,
      speed: 2,
      attackDamage: 3,
      attackRange: 4,
      attackCooldownSeconds: 1,
      populationCost: 1
    };
    const units = new Map([
      [first.id, first],
      [second.id, second],
      [target.id, target]
    ]);
    const matchState: MatchState = {
      status: "playing",
      winnerPlayerId: null,
      loserPlayerId: null,
      reason: null
    };
    const system = new CombatSystem(
      20,
      units,
      new Map(),
      new Map([
        [militia.kind, militia],
        [archer.kind, archer]
      ]),
      new Map(),
      matchState,
      new GridNavigation({ width: 10, height: 10 }),
      () => 0,
      (unit, destination) => {
        unit.destination = { ...destination };
        unit.waypoints = [{ ...destination }];
        return true;
      },
      () => null,
      () => undefined
    );

    system.step();

    expect(first.destination).not.toBeNull();
    expect(second.destination).not.toBeNull();
    expect(first.destination).not.toEqual(second.destination);
    expect(first.destination).not.toEqual(target.position);
    expect(second.destination).not.toEqual(target.position);

    for (const destination of [first.destination, second.destination]) {
      expect(destination).not.toBeNull();

      if (!destination) {
        continue;
      }

      expect(
        Math.hypot(
          destination.x - target.position.x,
          destination.y - target.position.y
        )
      ).toBeLessThanOrEqual(militia.attackRange);
    }
  });

  it("routes melee attackers to distinct building perimeter approaches", () => {
    const first = createUnit("militia-a", "p1", "militia", 40, {
      x: 1,
      y: 5
    });
    const second = createUnit("militia-b", "p1", "militia", 40, {
      x: 1,
      y: 5.2
    });
    const building: BuildingState = {
      id: "house-1",
      ownerId: "p2",
      kind: "house",
      position: { x: 5, y: 5 },
      progress: 1,
      completed: true,
      hitPoints: 100,
      trainingQueue: [],
      rallyPoint: null
    };
    first.attackTask = { targetType: "building", targetId: building.id };
    second.attackTask = { targetType: "building", targetId: building.id };

    const militia: UnitDefinition = {
      kind: "militia",
      displayName: "Militia",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 40,
      speed: 2,
      attackDamage: 4,
      attackRange: 0.75,
      attackCooldownSeconds: 1,
      populationCost: 1
    };
    const house: BuildingDefinition = {
      kind: "house",
      displayName: "House",
      footprint: { width: 2, height: 2 },
      cost: { wood: 25, food: 0, gold: 0 },
      buildTimeSeconds: 1,
      maxHitPoints: 100,
      populationProvided: 5
    };
    const units = new Map([
      [first.id, first],
      [second.id, second]
    ]);
    const buildings = new Map([[building.id, building]]);
    const navigation = new GridNavigation({ width: 12, height: 12 });
    navigation.blockCells([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 }
    ]);
    const system = new CombatSystem(
      20,
      units,
      buildings,
      new Map([[militia.kind, militia]]),
      new Map([[house.kind, house]]),
      {
        status: "playing",
        winnerPlayerId: null,
        loserPlayerId: null,
        reason: null
      },
      navigation,
      () => 0,
      (unit, destination) => {
        unit.destination = { ...destination };
        unit.waypoints = [{ ...destination }];
        return true;
      },
      () => null,
      () => undefined
    );

    system.step();

    expect(first.destination).not.toBeNull();
    expect(second.destination).not.toBeNull();
    expect(first.destination).not.toEqual(second.destination);
  });

  it("destroys a town center, releases its footprint, and resolves the match once", () => {
    const attacker = createUnit("militia-1", "p1", "militia", 40, { x: 3.5, y: 4 });
    attacker.attackTask = { targetType: "building", targetId: "tc-1" };

    const militia: UnitDefinition = {
      kind: "militia",
      displayName: "Militia",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 40,
      speed: 2,
      attackDamage: 10,
      attackRange: 1,
      attackCooldownSeconds: 1,
      populationCost: 1
    };
    const townCenterDefinition: BuildingDefinition = {
      kind: "town-center",
      displayName: "Town Center",
      footprint: { width: 2, height: 2 },
      cost: { wood: 0, food: 0, gold: 0 },
      buildTimeSeconds: 1,
      maxHitPoints: 100,
      populationProvided: 0
    };
    const townCenter: BuildingState = {
      id: "tc-1",
      ownerId: "p2",
      kind: "town-center",
      position: { x: 4, y: 4 },
      progress: 1,
      completed: true,
      hitPoints: 5,
      trainingQueue: [],
      rallyPoint: null
    };
    const units = new Map([[attacker.id, attacker]]);
    const buildings = new Map([[townCenter.id, townCenter]]);
    const matchState: MatchState = {
      status: "playing",
      winnerPlayerId: null,
      loserPlayerId: null,
      reason: null
    };
    const navigation = new GridNavigation({ width: 10, height: 10 });
    navigation.blockCells([
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 4, y: 5 },
      { x: 5, y: 5 }
    ]);

    const system = new CombatSystem(
      20,
      units,
      buildings,
      new Map([[militia.kind, militia]]),
      new Map([[townCenterDefinition.kind, townCenterDefinition]]),
      matchState,
      navigation,
      () => 0,
      () => true,
      () => null,
      () => undefined
    );

    system.step();

    expect(buildings.has(townCenter.id)).toBe(false);
    expect(navigation.isWalkableCell(4, 4)).toBe(true);
    expect(matchState).toEqual({
      status: "ended",
      winnerPlayerId: "p1",
      loserPlayerId: "p2",
      reason: "town-center-destroyed"
    });

    system.step();

    expect(matchState.winnerPlayerId).toBe("p1");
    expect(matchState.loserPlayerId).toBe("p2");
  });

  it("applies a tactical damage advantage from higher ground", () => {
    const attacker = createUnit("high-ground", "p1", "militia", 40, {
      x: 1.5,
      y: 1.5
    });
    const target = createUnit("low-ground", "p2", "militia", 20, {
      x: 2.5,
      y: 1.5
    });
    attacker.attackTask = { targetType: "unit", targetId: target.id };

    const militia: UnitDefinition = {
      kind: "militia",
      displayName: "Militia",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 40,
      speed: 2,
      attackDamage: 10,
      attackRange: 1.1,
      attackCooldownSeconds: 1,
      populationCost: 1
    };
    const units = new Map([
      [attacker.id, attacker],
      [target.id, target]
    ]);
    const system = new CombatSystem(
      20,
      units,
      new Map(),
      new Map([[militia.kind, militia]]),
      new Map(),
      {
        status: "playing",
        winnerPlayerId: null,
        loserPlayerId: null,
        reason: null
      },
      new GridNavigation({
        width: 10,
        height: 10,
        elevation: [{ x: 1, y: 1, level: 1 }]
      }),
      () => 0,
      () => true,
      () => null,
      () => undefined
    );

    system.step();

    expect(target.hitPoints).toBe(9);
  });
});
