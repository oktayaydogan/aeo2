import { describe, expect, it } from "vitest";
import { GridNavigation } from "../GridNavigation";
import type {
  MatchState,
  UnitDefinition,
  Vector2
} from "../types";
import {
  CombatSystem,
  type CombatUnit
} from "./CombatSystem";

function unit(
  id: string,
  ownerId: string,
  kind: CombatUnit["kind"],
  position: Vector2,
  hitPoints = 40
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

function matchState(): MatchState {
  return {
    status: "playing",
    winnerPlayerId: null,
    loserPlayerId: null,
    reason: null
  };
}

describe("Combat vocabulary integration", () => {
  it("resolves tag bonuses and target armor through the canonical formula", () => {
    const attacker = unit("attacker", "p1", "spearman", { x: 1, y: 1 });
    const target = unit("target", "p2", "archer", { x: 1.5, y: 1 }, 20);
    attacker.attackTask = {
      targetType: "unit",
      targetId: target.id,
      origin: { ...attacker.position }
    };

    const attackerDefinition: UnitDefinition = {
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
      combatTags: ["infantry"],
      bonuses: [{ targetTag: "ranged", damage: 5 }]
    };
    const targetDefinition: UnitDefinition = {
      kind: "archer",
      displayName: "Archer",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 20,
      speed: 2,
      attackDamage: 2,
      attackRange: 4,
      attackCooldownSeconds: 1,
      populationCost: 1,
      armor: 2,
      combatTags: ["ranged"]
    };
    const units = new Map([
      [attacker.id, attacker],
      [target.id, target]
    ]);
    const system = new CombatSystem(
      20,
      units,
      new Map(),
      new Map([
        [attackerDefinition.kind, attackerDefinition],
        [targetDefinition.kind, targetDefinition]
      ]),
      new Map(),
      matchState(),
      new GridNavigation({ width: 12, height: 12 }),
      () => 1,
      () => true,
      () => null,
      () => undefined
    );

    system.step();

    expect(target.hitPoints).toBe(13);
  });

  it("acquires the nearest deterministic target when acquisition is enabled", () => {
    const attacker = unit("attacker", "p1", "militia", { x: 1, y: 1 });
    const first = unit("enemy-b", "p2", "archer", { x: 3, y: 1 });
    const second = unit("enemy-a", "p2", "archer", { x: 3, y: 1 });
    const definition: UnitDefinition = {
      kind: "militia",
      displayName: "Militia",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 40,
      speed: 2,
      attackDamage: 4,
      attackRange: 0.75,
      attackCooldownSeconds: 1,
      populationCost: 1,
      acquisitionRange: 3,
      maxChaseDistance: 4
    };
    const archer: UnitDefinition = {
      kind: "archer",
      displayName: "Archer",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 40,
      speed: 2,
      attackDamage: 2,
      attackRange: 4,
      attackCooldownSeconds: 1,
      populationCost: 1
    };
    const units = new Map([
      [attacker.id, attacker],
      [first.id, first],
      [second.id, second]
    ]);
    const system = new CombatSystem(
      20,
      units,
      new Map(),
      new Map([
        [definition.kind, definition],
        [archer.kind, archer]
      ]),
      new Map(),
      matchState(),
      new GridNavigation({ width: 12, height: 12 }),
      () => 0,
      (movingUnit, destination) => {
        movingUnit.destination = { ...destination };
        movingUnit.waypoints = [{ ...destination }];
        return true;
      },
      () => null,
      () => undefined
    );

    system.step();

    expect(attacker.attackTask).toMatchObject({
      targetType: "unit",
      targetId: "enemy-a",
      origin: { x: 1, y: 1 }
    });
  });

  it("abandons a target that leaves the configured chase radius", () => {
    const attacker = unit("attacker", "p1", "militia", { x: 1, y: 1 });
    const target = unit("target", "p2", "archer", { x: 3, y: 1 });
    attacker.attackTask = {
      targetType: "unit",
      targetId: target.id,
      origin: { x: 1, y: 1 }
    };
    const definition: UnitDefinition = {
      kind: "militia",
      displayName: "Militia",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 40,
      speed: 2,
      attackDamage: 4,
      attackRange: 0.75,
      attackCooldownSeconds: 1,
      populationCost: 1,
      maxChaseDistance: 4
    };
    const archer: UnitDefinition = {
      kind: "archer",
      displayName: "Archer",
      cost: { wood: 0, food: 0, gold: 0 },
      trainTimeSeconds: 1,
      maxHitPoints: 40,
      speed: 2,
      attackDamage: 2,
      attackRange: 4,
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
      new Map([
        [definition.kind, definition],
        [archer.kind, archer]
      ]),
      new Map(),
      matchState(),
      new GridNavigation({ width: 12, height: 12 }),
      () => 0,
      () => true,
      () => null,
      () => undefined
    );

    target.position = { x: 8, y: 1 };
    system.step();

    expect(attacker.attackTask).toBeUndefined();
    expect(attacker.activity).toBe("idle");
  });
});
