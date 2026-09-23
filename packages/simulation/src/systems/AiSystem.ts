import type {
  AiPlayerDefinition,
  AiPlayerState,
  BuildingDefinition,
  BuildingState,
  GameCommand,
  PlayerPopulationState,
  ResourceKind,
  ResourceNodeState,
  ResourceStockpile,
  TechnologyDefinition,
  UnitDefinition,
  UnitState,
  Vector2
} from "../types";
import {
  canAffordWithReservation,
  createAiEconomyPlan,
  type AiSpendingReservation
} from "./AiEconomyPlanner";
import { MAX_TRAINING_QUEUE } from "./ProductionSystem";

const ARRIVAL_EPSILON = 0.000001;

export interface AiUnit extends UnitState {
  gatherTask?: unknown;
  buildTask?: unknown;
  attackTask?: unknown;
}

export interface AiSystemOptions<TUnit extends AiUnit> {
  tickRate: number;
  definitions: readonly AiPlayerDefinition[];
  units: Map<string, TUnit>;
  buildings: Map<string, BuildingState>;
  resources: Map<string, ResourceNodeState>;
  unitDefinitions: Map<string, UnitDefinition>;
  buildingDefinitions: Map<string, BuildingDefinition>;
  technologyDefinitions: Map<string, TechnologyDefinition>;
  calculatePopulation(playerId: string): PlayerPopulationState;
  getStockpile(playerId: string): ResourceStockpile;
  hasTechnology(playerId: string, technologyKind: TechnologyDefinition["kind"]): boolean;
  canPlaceBuilding(definition: BuildingDefinition, position: Vector2): boolean;
  findBuildApproach(
    unit: TUnit,
    definition: BuildingDefinition,
    position: Vector2
  ): Vector2 | null;
  canReach(unit: TUnit, position: Vector2): boolean;
  executeCommand(command: GameCommand): void;
}

export class AiSystem<TUnit extends AiUnit> {
  private readonly definitions: readonly AiPlayerDefinition[];
  private readonly states = new Map<string, AiPlayerState>();

  constructor(private readonly options: AiSystemOptions<TUnit>) {
    this.definitions = options.definitions.map((definition) => ({
      ...definition,
      thinkIntervalTicks:
        definition.thinkIntervalTicks ?? options.tickRate
    }));

    for (const ai of this.definitions) {
      this.states.set(ai.playerId, {
        playerId: ai.playerId,
        mode: "waiting"
      });
    }
  }

  getDefinitions(): readonly AiPlayerDefinition[] {
    return this.definitions;
  }

  getStates(): readonly AiPlayerState[] {
    return [...this.states.values()].map((state) => ({ ...state }));
  }

  process(tick: number): void {
    for (const ai of this.definitions) {
      const interval = Math.max(
        1,
        ai.thinkIntervalTicks ?? this.options.tickRate
      );
      const state = this.states.get(ai.playerId);

      if (tick === 0 || tick % interval !== 0) {
        continue;
      }

      const ownUnits = [...this.options.units.values()]
        .filter((unit) => unit.ownerId === ai.playerId)
        .sort((a, b) => a.id.localeCompare(b.id));
      const villagers = ownUnits.filter(
        (unit) => unit.kind === "villager"
      );
      const military = ownUnits.filter((unit) => {
        const definition = this.options.unitDefinitions.get(unit.kind);
        return Boolean(definition && definition.attackDamage > 0);
      });
      const population = this.options.calculatePopulation(ai.playerId);
      const stockpile = this.options.getStockpile(ai.playerId);

      const townCenter = [...this.options.buildings.values()]
        .filter(
          (building) =>
            building.ownerId === ai.playerId &&
            building.completed &&
            building.kind === "town-center"
        )
        .sort((a, b) => a.id.localeCompare(b.id))[0];

      const economyEnabled =
        ai.targetVillagers !== undefined ||
        ai.targetMilitary !== undefined ||
        ai.attackThreshold !== undefined;
      const targetVillagers = ai.targetVillagers ?? 0;
      const targetMilitary = ai.targetMilitary ?? military.length;
      const attackThreshold = ai.attackThreshold ?? 1;

      const queuedVillagers = this.countQueuedUnits(
        ai.playerId,
        "villager"
      );
      const constructionPlan = this.planConstruction(
        ai.playerId,
        population,
        targetMilitary
      );

      if (
        economyEnabled &&
        townCenter &&
        villagers.length + queuedVillagers < targetVillagers &&
        population.used + population.queued < population.cap
      ) {
        const villagerDefinition = this.options.unitDefinitions.get("villager");

        if (
          villagerDefinition &&
          canAffordWithReservation(
            stockpile,
            villagerDefinition.cost,
            constructionPlan?.reservation
          )
        ) {
          this.options.executeCommand({
            type: "train",
            playerId: ai.playerId,
            buildingId: townCenter.id,
            unitKind: "villager"
          });
        }
      }

      const availableBuilders = villagers.filter(
        (unit) => !unit.buildTask && !unit.attackTask
      );

      if (economyEnabled) {
        if (constructionPlan) {
          this.tryConstruct(
            ai.playerId,
            availableBuilders,
            constructionPlan.buildingKind
          );
        }

        const activeConstructionPlan = this.planConstruction(
          ai.playerId,
          this.options.calculatePopulation(ai.playerId),
          targetMilitary
        );
        const idleVillagers = villagers.filter(
          (unit) =>
            !unit.gatherTask &&
            !unit.buildTask &&
            !unit.attackTask &&
            unit.activity === "idle"
        );
        const economyPlan = createAiEconomyPlan({
          stockpile: this.options.getStockpile(ai.playerId),
          workerCount: idleVillagers.length,
          reservation: activeConstructionPlan?.reservation,
          recurringCosts: this.plannedRecurringCosts(
            ai.playerId,
            villagers.length,
            targetVillagers,
            military.length,
            targetMilitary
          )
        });
        const desiredKinds = this.expandWorkerTargets(
          economyPlan.workerTargets
        );

        idleVillagers.forEach((villager, index) => {
          const desiredKind = desiredKinds[index] ?? "food";
          const resource = this.findNearestResource(
            villager,
            desiredKind
          );

          if (!resource) {
            return;
          }

          this.options.executeCommand({
            type: "gather",
            playerId: ai.playerId,
            unitIds: [villager.id],
            resourceId: resource.id
          });
        });
      }

      const queuedMilitary = [...this.options.buildings.values()]
        .filter((building) => building.ownerId === ai.playerId)
        .flatMap((building) => building.trainingQueue)
        .filter((item) => item.unitKind !== "villager").length;

      const activeConstructionReservation = this.planConstruction(
        ai.playerId,
        this.options.calculatePopulation(ai.playerId),
        targetMilitary
      )?.reservation;

      if (
        economyEnabled &&
        military.length + queuedMilitary < targetMilitary
      ) {
        const productionBuildings = [...this.options.buildings.values()]
          .filter(
            (building) =>
              building.ownerId === ai.playerId &&
              building.completed &&
              building.trainingQueue.length < MAX_TRAINING_QUEUE
          )
          .sort((a, b) => a.id.localeCompare(b.id));

        const archeryRange = productionBuildings.find(
          (building) => building.kind === "archery-range"
        );
        const barracks = productionBuildings.find(
          (building) => building.kind === "barracks"
        );

        const trainingChoice =
          archeryRange && military.length % 2 === 1
            ? { building: archeryRange, unitKind: "archer" as const }
            : barracks
              ? { building: barracks, unitKind: "militia" as const }
              : archeryRange
                ? { building: archeryRange, unitKind: "archer" as const }
                : undefined;

        if (trainingChoice) {
          const definition = this.options.unitDefinitions.get(
            trainingChoice.unitKind
          );

          if (
            definition &&
            canAffordWithReservation(
              this.options.getStockpile(ai.playerId),
              definition.cost,
              activeConstructionReservation
            )
          ) {
            this.options.executeCommand({
              type: "train",
              playerId: ai.playerId,
              buildingId: trainingChoice.building.id,
              unitKind: trainingChoice.unitKind
            });
          }
        }
      }

      if (economyEnabled && military.length >= targetMilitary) {
        const researchBuilding = [...this.options.buildings.values()]
          .filter(
            (building) =>
              building.ownerId === ai.playerId &&
              building.completed &&
              building.trainingQueue.length === 0 &&
              (building.researchQueue?.length ?? 0) === 0
          )
          .sort((a, b) => a.id.localeCompare(b.id))
          .find((building) =>
            [...this.options.technologyDefinitions.values()].some(
              (technology) =>
                technology.buildingKind === building.kind &&
                !this.options.hasTechnology(ai.playerId, technology.kind)
            )
          );

        if (researchBuilding) {
          const technology = [
            ...this.options.technologyDefinitions.values()
          ]
            .filter(
              (entry) =>
                entry.buildingKind === researchBuilding.kind &&
                !this.options.hasTechnology(ai.playerId, entry.kind)
            )
            .sort((a, b) => a.kind.localeCompare(b.kind))[0];

          if (
            technology &&
            canAffordWithReservation(
              this.options.getStockpile(ai.playerId),
              technology.cost,
              activeConstructionReservation
            )
          ) {
            this.options.executeCommand({
              type: "research",
              playerId: ai.playerId,
              buildingId: researchBuilding.id,
              technologyKind: technology.kind
            });
          }
        }
      }

      if (military.length < attackThreshold) {
        if (state) {
          state.mode =
            economyEnabled && villagers.length < targetVillagers
              ? "economy"
              : "military";
        }
        continue;
      }

      const enemyUnits = [...this.options.units.values()]
        .filter((unit) => unit.ownerId === ai.enemyPlayerId)
        .sort((a, b) => a.id.localeCompare(b.id));
      const enemyBuildings = [...this.options.buildings.values()]
        .filter(
          (building) =>
            building.ownerId === ai.enemyPlayerId &&
            building.completed
        )
        .sort((a, b) => {
          if (a.kind === "town-center" && b.kind !== "town-center") {
            return -1;
          }
          if (b.kind === "town-center" && a.kind !== "town-center") {
            return 1;
          }
          return a.id.localeCompare(b.id);
        });

      if (enemyUnits.length === 0 && enemyBuildings.length === 0) {
        if (state) {
          state.mode = "idle";
        }
        continue;
      }

      if (state) {
        state.mode = "attacking";
      }

      for (const attacker of military) {
        if (attacker.attackTask) {
          continue;
        }

        const target = [...enemyUnits].sort(
          (a, b) =>
            distance(attacker.position, a.position) -
              distance(attacker.position, b.position) ||
            a.id.localeCompare(b.id)
        )[0];

        if (target) {
          this.options.executeCommand({
            type: "attack",
            playerId: ai.playerId,
            unitIds: [attacker.id],
            targetUnitId: target.id
          });
          continue;
        }

        const buildingTarget = enemyBuildings[0];

        if (buildingTarget) {
          this.options.executeCommand({
            type: "attack-building",
            playerId: ai.playerId,
            unitIds: [attacker.id],
            targetBuildingId: buildingTarget.id
          });
        }
      }
    }
  }

  private tryConstruct(
    playerId: string,
    builders: readonly TUnit[],
    buildingKind: BuildingState["kind"]
  ): boolean {
    const builder = builders[0];

    if (!builder) {
      return false;
    }

    return this.tryBuild(playerId, builder, buildingKind);
  }

  private planConstruction(
    playerId: string,
    population: PlayerPopulationState,
    targetMilitary: number
  ):
    | {
        buildingKind: BuildingState["kind"];
        reservation: AiSpendingReservation;
      }
    | undefined {
    const ownedBuildings = [...this.options.buildings.values()].filter(
      (building) => building.ownerId === playerId
    );
    const populationHeadroom =
      population.cap - population.used - population.queued;
    const houseUnderConstruction = ownedBuildings.some(
      (building) =>
        building.kind === "house" && !building.completed
    );

    if (populationHeadroom <= 2 && !houseUnderConstruction) {
      return this.buildingReservation("house");
    }

    const hasBarracks = ownedBuildings.some(
      (building) => building.kind === "barracks"
    );

    if (targetMilitary > 0 && !hasBarracks) {
      return this.buildingReservation("barracks");
    }

    const hasArcheryRange = ownedBuildings.some(
      (building) => building.kind === "archery-range"
    );

    if (targetMilitary >= 4 && !hasArcheryRange) {
      return this.buildingReservation("archery-range");
    }

    return undefined;
  }

  private buildingReservation(
    buildingKind: BuildingState["kind"]
  ):
    | {
        buildingKind: BuildingState["kind"];
        reservation: AiSpendingReservation;
      }
    | undefined {
    const definition = this.options.buildingDefinitions.get(buildingKind);

    if (!definition) {
      return undefined;
    }

    return {
      buildingKind,
      reservation: {
        key: `build:${buildingKind}`,
        cost: { ...definition.cost }
      }
    };
  }

  private countQueuedUnits(
    playerId: string,
    unitKind: UnitDefinition["kind"]
  ): number {
    return [...this.options.buildings.values()]
      .filter((building) => building.ownerId === playerId)
      .flatMap((building) => building.trainingQueue)
      .filter((item) => item.unitKind === unitKind).length;
  }

  private plannedRecurringCosts(
    playerId: string,
    villagerCount: number,
    targetVillagers: number,
    militaryCount: number,
    targetMilitary: number
  ): ResourceStockpile[] {
    const costs: ResourceStockpile[] = [];

    if (
      villagerCount + this.countQueuedUnits(playerId, "villager") <
      targetVillagers
    ) {
      const villagerDefinition = this.options.unitDefinitions.get("villager");

      if (villagerDefinition) {
        costs.push(villagerDefinition.cost);
      }
    }

    if (
      militaryCount +
        [...this.options.buildings.values()]
          .filter((building) => building.ownerId === playerId)
          .flatMap((building) => building.trainingQueue)
          .filter((item) => item.unitKind !== "villager").length <
      targetMilitary
    ) {
      const militiaDefinition = this.options.unitDefinitions.get("militia");

      if (militiaDefinition) {
        costs.push(militiaDefinition.cost);
      }
    }

    return costs;
  }

  private expandWorkerTargets(
    targets: Record<ResourceKind, number>
  ): ResourceKind[] {
    const result: ResourceKind[] = [];

    for (const kind of ["food", "wood", "gold"] as const) {
      for (let index = 0; index < targets[kind]; index += 1) {
        result.push(kind);
      }
    }

    return result;
  }

  private tryBuild(
    playerId: string,
    builder: TUnit,
    buildingKind: BuildingState["kind"]
  ): boolean {
    const definition = this.options.buildingDefinitions.get(buildingKind);

    if (!definition) {
      return false;
    }

    const stockpile = this.options.getStockpile(playerId);

    if (!hasResources(stockpile, definition.cost)) {
      return false;
    }

    const townCenter = [...this.options.buildings.values()]
      .filter(
        (building) =>
          building.ownerId === playerId &&
          building.kind === "town-center"
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0];

    if (!townCenter) {
      return false;
    }

    const offsets = [
      { x: -4, y: 0 },
      { x: -4, y: 4 },
      { x: -4, y: 8 },
      { x: 0, y: 5 },
      { x: 4, y: 0 },
      { x: 4, y: 5 },
      { x: -8, y: 0 },
      { x: -8, y: 5 },
      { x: 0, y: -5 }
    ] as const;

    for (const offset of offsets) {
      const position = {
        x: townCenter.position.x + offset.x,
        y: townCenter.position.y + offset.y
      };

      if (!this.options.canPlaceBuilding(definition, position)) {
        continue;
      }

      if (!this.options.findBuildApproach(builder, definition, position)) {
        continue;
      }

      const before = this.options.buildings.size;

      this.options.executeCommand({
        type: "build",
        playerId,
        unitIds: [builder.id],
        buildingKind,
        position
      });

      if (this.options.buildings.size > before) {
        return true;
      }
    }

    return false;
  }

  private findNearestResource(
    unit: TUnit,
    kind: ResourceKind
  ): ResourceNodeState | undefined {
    const available = [...this.options.resources.values()]
      .filter(
        (resource) =>
          resource.amount > ARRIVAL_EPSILON &&
          this.options.canReach(unit, resource.position)
      )
      .sort(
        (a, b) =>
          distance(unit.position, a.position) -
            distance(unit.position, b.position) ||
          a.id.localeCompare(b.id)
      );

    return (
      available.find((resource) => resource.kind === kind) ??
      available[0]
    );
  }
}

function hasResources(
  stockpile: ResourceStockpile,
  cost: ResourceStockpile
): boolean {
  return (
    stockpile.wood >= cost.wood &&
    stockpile.food >= cost.food &&
    stockpile.gold >= cost.gold
  );
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
