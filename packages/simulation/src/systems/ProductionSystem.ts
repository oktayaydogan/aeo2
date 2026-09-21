import {
  canStartTraining,
  hasResources
} from "../commands/commandValidation";
import type {
  BuildingDefinition,
  BuildingKind,
  BuildingState,
  PlayerPopulationState,
  ResourceStockpile,
  UnitDefinition,
  UnitKind,
  UnitState,
  Vector2
} from "../types";

const ARRIVAL_EPSILON = 0.000001;
const MAX_TRAINING_QUEUE = 5;

export interface ProductionStepCallbacks {
  findSpawnPosition(building: BuildingState): Vector2 | null;
  spawnUnit(
    building: BuildingState,
    definition: UnitDefinition,
    position: Vector2
  ): string;
  routeToRallyPoint(unitId: string, target: Vector2): void;
}

export class ProductionSystem {
  constructor(
    private readonly tickRate: number,
    private readonly unitDefinitions: ReadonlyMap<string, UnitDefinition>,
    private readonly buildingDefinitions: ReadonlyMap<
      string,
      BuildingDefinition
    >
  ) {}

  calculatePopulation(
    playerId: string,
    units: Iterable<UnitState>,
    buildings: Iterable<BuildingState>
  ): PlayerPopulationState {
    let used = 0;
    let queued = 0;
    let cap = 0;

    for (const unit of units) {
      if (unit.ownerId !== playerId) {
        continue;
      }

      used += this.unitDefinitions.get(unit.kind)?.populationCost ?? 1;
    }

    for (const building of buildings) {
      if (building.ownerId !== playerId) {
        continue;
      }

      const buildingDefinition = this.buildingDefinitions.get(building.kind);

      if (building.completed && buildingDefinition) {
        cap += buildingDefinition.populationProvided;
      }

      for (const item of building.trainingQueue) {
        queued +=
          this.unitDefinitions.get(item.unitKind)?.populationCost ?? 1;
      }
    }

    return {
      playerId,
      used,
      queued,
      cap
    };
  }

  startTraining(
    playerId: string,
    building: BuildingState | undefined,
    definition: UnitDefinition | undefined,
    units: Iterable<UnitState>,
    buildings: Iterable<BuildingState>,
    ensureStockpile: () => ResourceStockpile
  ): boolean {
    const population = this.calculatePopulation(
      playerId,
      units,
      buildings
    );

    if (
      !canStartTraining({
        building,
        definition,
        playerId,
        canBuildingTrainUnit: Boolean(
          building &&
            definition &&
            this.canBuildingTrainUnit(building.kind, definition.kind)
        ),
        population,
        maxTrainingQueue: MAX_TRAINING_QUEUE
      }) ||
      !building ||
      !definition
    ) {
      return false;
    }

    const stockpile = ensureStockpile();

    if (!hasResources(stockpile, definition.cost)) {
      return false;
    }

    spendResources(stockpile, definition.cost);
    building.trainingQueue.push({
      unitKind: definition.kind,
      progress: 0
    });

    return true;
  }

  step(
    buildings: Iterable<BuildingState>,
    callbacks: ProductionStepCallbacks
  ): void {
    for (const building of buildings) {
      if (!building.completed || building.trainingQueue.length === 0) {
        continue;
      }

      const item = building.trainingQueue[0];

      if (!item) {
        continue;
      }

      const definition = this.unitDefinitions.get(item.unitKind);

      if (!definition) {
        building.trainingQueue.shift();
        continue;
      }

      item.progress = Math.min(
        item.progress +
          1 / (definition.trainTimeSeconds * this.tickRate),
        1
      );

      if (item.progress < 1 - ARRIVAL_EPSILON) {
        continue;
      }

      const spawnPosition = callbacks.findSpawnPosition(building);

      if (!spawnPosition) {
        item.progress = 1;
        continue;
      }

      const unitId = callbacks.spawnUnit(
        building,
        definition,
        spawnPosition
      );
      building.trainingQueue.shift();

      if (building.rallyPoint) {
        callbacks.routeToRallyPoint(unitId, building.rallyPoint);
      }
    }
  }

  private canBuildingTrainUnit(
    buildingKind: BuildingKind,
    unitKind: UnitKind
  ): boolean {
    return (
      (buildingKind === "town-center" && unitKind === "villager") ||
      (buildingKind === "barracks" &&
        (unitKind === "militia" || unitKind === "spearman")) ||
      (buildingKind === "archery-range" && unitKind === "archer")
    );
  }
}

function spendResources(
  stockpile: ResourceStockpile,
  cost: ResourceStockpile
): void {
  stockpile.wood -= cost.wood;
  stockpile.food -= cost.food;
  stockpile.gold -= cost.gold;
}
