import type {
  BuildingState,
  CommandRejectionReason,
  PlayerPopulationState,
  ResourceStockpile,
  TechnologyDefinition,
  UnitDefinition,
  UnitState
} from "../types";

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
  maxTrainingQueue: number;
}

export function canStartTraining(
  input: TrainingValidationInput
): boolean {
  return trainingStructuralRejectionReason(input) === null;
}

export function trainingRejectionReason(
  input: TrainingValidationInput & {
    stockpile: ResourceStockpile;
  }
): CommandRejectionReason | null {
  const structural = trainingStructuralRejectionReason(input);

  if (structural) {
    return structural;
  }

  if (!input.definition) {
    return "invalid-target";
  }

  return hasResources(input.stockpile, input.definition.cost)
    ? null
    : "insufficient-resources";
}

function trainingStructuralRejectionReason({
  building,
  definition,
  playerId,
  canBuildingTrainUnit,
  population,
  maxTrainingQueue
}: TrainingValidationInput): CommandRejectionReason | null {
  if (!building || building.ownerId !== playerId) {
    return "invalid-building";
  }

  if (!building.completed) {
    return "building-incomplete";
  }

  if (!definition) {
    return "invalid-target";
  }

  if (!canBuildingTrainUnit) {
    return "wrong-building";
  }

  if ((building.researchQueue?.length ?? 0) > 0) {
    return "building-busy";
  }

  if (building.trainingQueue.length >= maxTrainingQueue) {
    return "queue-full";
  }

  if (
    population.used +
      population.queued +
      definition.populationCost >
    population.cap
  ) {
    return "population-cap";
  }

  return null;
}

export interface ResearchValidationInput {
  building: BuildingState | undefined;
  definition: TechnologyDefinition | undefined;
  playerId: string;
  alreadyResearched: boolean;
}

export function canStartResearch(
  input: ResearchValidationInput
): boolean {
  return researchStructuralRejectionReason(input) === null;
}

export function researchRejectionReason(
  input: ResearchValidationInput & {
    stockpile: ResourceStockpile;
  }
): CommandRejectionReason | null {
  const structural = researchStructuralRejectionReason(input);

  if (structural) {
    return structural;
  }

  if (!input.definition) {
    return "invalid-technology";
  }

  return hasResources(input.stockpile, input.definition.cost)
    ? null
    : "insufficient-resources";
}

function researchStructuralRejectionReason({
  building,
  definition,
  playerId,
  alreadyResearched
}: ResearchValidationInput): CommandRejectionReason | null {
  if (!building || building.ownerId !== playerId) {
    return "invalid-building";
  }

  if (!building.completed) {
    return "building-incomplete";
  }

  if (!definition) {
    return "invalid-technology";
  }

  if (building.kind !== definition.buildingKind) {
    return "wrong-building";
  }

  if (
    building.trainingQueue.length > 0 ||
    (building.researchQueue?.length ?? 0) > 0
  ) {
    return "building-busy";
  }

  if (alreadyResearched) {
    return "already-researched";
  }

  return null;
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
