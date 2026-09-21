import type {
  BuildingState,
  PlayerPopulationState,
  ResourceStockpile,
  TechnologyDefinition,
  UnitDefinition,
  UnitState
} from "./types";

export function selectOwnedUnits<T extends UnitState>(
  unitIds: readonly string[],
  playerId: string,
  units: ReadonlyMap<string, T>
): T[] {
  return unitIds
    .map((unitId) => units.get(unitId))
    .filter(
      (unit): unit is T =>
        unit !== undefined && unit.ownerId === playerId
    );
}

export function selectOwnedVillagers<T extends UnitState>(
  unitIds: readonly string[],
  playerId: string,
  units: ReadonlyMap<string, T>
): T[] {
  return selectOwnedUnits(unitIds, playerId, units).filter(
    (unit) => unit.kind === "villager"
  );
}

export function hasResources(
  stockpile: ResourceStockpile,
  cost: ResourceStockpile
): boolean {
  return (
    stockpile.wood >= cost.wood &&
    stockpile.food >= cost.food &&
    stockpile.gold >= cost.gold
  );
}

export interface TrainingValidationInput {
  building: BuildingState | undefined;
  definition: UnitDefinition | undefined;
  playerId: string;
  canBuildingTrainUnit: boolean;
  population: PlayerPopulationState;
  stockpile: ResourceStockpile;
  maxTrainingQueue: number;
}

export function canStartTraining({
  building,
  definition,
  playerId,
  canBuildingTrainUnit,
  population,
  stockpile,
  maxTrainingQueue
}: TrainingValidationInput): boolean {
  if (
    !building ||
    building.ownerId !== playerId ||
    !building.completed ||
    !definition ||
    !canBuildingTrainUnit ||
    (building.researchQueue?.length ?? 0) > 0 ||
    building.trainingQueue.length >= maxTrainingQueue
  ) {
    return false;
  }

  if (
    population.used +
      population.queued +
      definition.populationCost >
    population.cap
  ) {
    return false;
  }

  return hasResources(stockpile, definition.cost);
}

export interface ResearchValidationInput {
  building: BuildingState | undefined;
  definition: TechnologyDefinition | undefined;
  playerId: string;
  alreadyResearched: boolean;
  stockpile: ResourceStockpile;
}

export function canStartResearch({
  building,
  definition,
  playerId,
  alreadyResearched,
  stockpile
}: ResearchValidationInput): boolean {
  if (
    !building ||
    building.ownerId !== playerId ||
    !building.completed ||
    !definition ||
    building.kind !== definition.buildingKind ||
    building.trainingQueue.length > 0 ||
    (building.researchQueue?.length ?? 0) > 0 ||
    alreadyResearched
  ) {
    return false;
  }

  return hasResources(stockpile, definition.cost);
}

export function canSetRallyPoint(
  building: BuildingState | undefined,
  playerId: string
): building is BuildingState {
  return Boolean(
    building &&
      building.ownerId === playerId &&
      building.completed
  );
}

export function canAttackUnitTarget(
  target: UnitState | undefined,
  playerId: string
): target is UnitState {
  return Boolean(target && target.ownerId !== playerId);
}

export function canAttackBuildingTarget(
  target: BuildingState | undefined,
  playerId: string
): target is BuildingState {
  return Boolean(
    target &&
      target.ownerId !== playerId &&
      target.completed
  );
}

export function selectCombatCapableUnits<T extends UnitState>(
  unitIds: readonly string[],
  playerId: string,
  units: ReadonlyMap<string, T>,
  definitions: ReadonlyMap<string, UnitDefinition>
): T[] {
  return selectOwnedUnits(unitIds, playerId, units).filter((unit) => {
    const definition = definitions.get(unit.kind);
    return Boolean(definition && definition.attackDamage > 0);
  });
}
