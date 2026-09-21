import { describe, expect, it } from "vitest";
import {
  canAttackBuildingTarget,
  canAttackUnitTarget,
  canSetRallyPoint,
  canStartResearch,
  canStartTraining,
  hasResources,
  selectCombatCapableUnits,
  selectOwnedUnits,
  selectOwnedVillagers
} from "./commandValidation";
import type {
  BuildingState,
  TechnologyDefinition,
  UnitDefinition,
  UnitState
} from "../types";

const VILLAGER: UnitState = {
  id: "villager-1",
  ownerId: "player-1",
  kind: "villager",
  position: { x: 1, y: 1 },
  destination: null,
  speed: 2,
  hitPoints: 25,
  activity: "idle",
  cargo: null
};

const MILITIA: UnitState = {
  ...VILLAGER,
  id: "militia-1",
  kind: "militia",
  hitPoints: 40
};

const ENEMY: UnitState = {
  ...MILITIA,
  id: "enemy-1",
  ownerId: "player-2"
};

const MILITIA_DEFINITION: UnitDefinition = {
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

const VILLAGER_DEFINITION: UnitDefinition = {
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

const BARRACKS: BuildingState = {
  id: "barracks-1",
  ownerId: "player-1",
  kind: "barracks",
  position: { x: 4, y: 4 },
  progress: 1,
  completed: true,
  hitPoints: 1200,
  trainingQueue: [],
  researchQueue: [],
  rallyPoint: null
};

const FORGED_WEAPONS: TechnologyDefinition = {
  kind: "forged-weapons",
  displayName: "Forged Weapons",
  cost: { wood: 0, food: 75, gold: 75 },
  researchTimeSeconds: 10,
  buildingKind: "barracks",
  attackDamageBonus: 1
};

describe("command validation", () => {
  it("selects only units owned by the command player in command order", () => {
    const units = new Map([
      [VILLAGER.id, VILLAGER],
      [MILITIA.id, MILITIA],
      [ENEMY.id, ENEMY]
    ]);

    expect(
      selectOwnedUnits(
        [ENEMY.id, MILITIA.id, "missing", VILLAGER.id],
        "player-1",
        units
      ).map((unit) => unit.id)
    ).toEqual([MILITIA.id, VILLAGER.id]);

    expect(
      selectOwnedVillagers(
        [MILITIA.id, ENEMY.id, VILLAGER.id],
        "player-1",
        units
      ).map((unit) => unit.id)
    ).toEqual([VILLAGER.id]);
  });

  it("requires enough resources in every resource channel", () => {
    expect(
      hasResources(
        { wood: 100, food: 60, gold: 20 },
        MILITIA_DEFINITION.cost
      )
    ).toBe(true);

    expect(
      hasResources(
        { wood: 100, food: 59, gold: 20 },
        MILITIA_DEFINITION.cost
      )
    ).toBe(false);
  });

  it("validates training ownership, queue state, population and producer capability", () => {
    const base = {
      building: BARRACKS,
      definition: MILITIA_DEFINITION,
      playerId: "player-1",
      canBuildingTrainUnit: true,
      population: { playerId: "player-1", used: 1, queued: 0, cap: 5 },
      maxTrainingQueue: 5
    };

    expect(canStartTraining(base)).toBe(true);
    expect(
      canStartTraining({
        ...base,
        playerId: "player-2"
      })
    ).toBe(false);
    expect(
      canStartTraining({
        ...base,
        population: { playerId: "player-1", used: 5, queued: 0, cap: 5 }
      })
    ).toBe(false);
    expect(
      canStartTraining({
        ...base,
        canBuildingTrainUnit: false
      })
    ).toBe(false);
  });

  it("validates research ownership, producer kind and duplicate state", () => {
    const base = {
      building: BARRACKS,
      definition: FORGED_WEAPONS,
      playerId: "player-1",
      alreadyResearched: false
    };

    expect(canStartResearch(base)).toBe(true);
    expect(canStartResearch({ ...base, playerId: "player-2" })).toBe(false);
    expect(canStartResearch({ ...base, alreadyResearched: true })).toBe(false);
    expect(
      canStartResearch({
        ...base,
        building: { ...BARRACKS, kind: "archery-range" }
      })
    ).toBe(false);
  });

  it("validates rally and attack targets without permitting friendly targets", () => {
    expect(canSetRallyPoint(BARRACKS, "player-1")).toBe(true);
    expect(canSetRallyPoint(BARRACKS, "player-2")).toBe(false);

    expect(canAttackUnitTarget(ENEMY, "player-1")).toBe(true);
    expect(canAttackUnitTarget(MILITIA, "player-1")).toBe(false);

    const enemyBuilding = {
      ...BARRACKS,
      id: "enemy-barracks",
      ownerId: "player-2"
    };
    expect(canAttackBuildingTarget(enemyBuilding, "player-1")).toBe(true);
    expect(canAttackBuildingTarget(BARRACKS, "player-1")).toBe(false);
    expect(
      canAttackBuildingTarget(
        { ...enemyBuilding, completed: false },
        "player-1"
      )
    ).toBe(false);
  });

  it("selects only owned units with positive attack capability", () => {
    const units = new Map([
      [VILLAGER.id, VILLAGER],
      [MILITIA.id, MILITIA],
      [ENEMY.id, ENEMY]
    ]);
    const definitions = new Map([
      [VILLAGER_DEFINITION.kind, VILLAGER_DEFINITION],
      [MILITIA_DEFINITION.kind, MILITIA_DEFINITION]
    ]);

    expect(
      selectCombatCapableUnits(
        [VILLAGER.id, ENEMY.id, MILITIA.id],
        "player-1",
        units,
        definitions
      ).map((unit) => unit.id)
    ).toEqual([MILITIA.id]);
  });
});
