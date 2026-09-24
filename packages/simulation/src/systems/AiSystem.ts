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
import {
  AiKnowledgeSystem,
  type AiKnowledgeSnapshot
} from "./AiKnowledgeSystem";
import { MAX_TRAINING_QUEUE } from "./ProductionSystem";

const ARRIVAL_EPSILON = 0.000001;
const DEFENSE_BASE_RADIUS = 9;
const DEFENSE_WORKER_RADIUS = 4.5;
const DEFENSE_BUILDING_RADIUS = 6;
const DEFENSE_RETREAT_TRIGGER_RADIUS = 3.5;
const DEFENSE_HYSTERESIS_SECONDS = 3;
const ECONOMIC_EXPANSION_MIN_VILLAGERS = 4;
const ECONOMIC_DROP_OFF_TRIGGER_DISTANCE = 7;
const ECONOMIC_DROP_OFF_LOCAL_RADIUS = 7;
const ECONOMIC_RESOURCE_ORDER: readonly ResourceKind[] = [
  "wood",
  "food",
  "gold"
];
const ECONOMIC_BUILDING_BY_RESOURCE: Record<
  ResourceKind,
  BuildingState["kind"]
> = {
  wood: "wood-depot",
  food: "granary",
  gold: "ore-yard"
};

interface AiConstructionPlan {
  buildingKind: BuildingState["kind"];
  reservation: AiSpendingReservation;
  near?: Vector2;
}

export interface AiUnit extends UnitState {
  gatherTask?: unknown;
  buildTask?: unknown;
  attackTask?: unknown;
}

export interface AiSystemOptions<TUnit extends AiUnit> {
  tickRate: number;
  mapWidth: number;
  mapHeight: number;
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
  private readonly knowledgeSystem: AiKnowledgeSystem<TUnit>;
  private readonly lastThreatTick = new Map<string, number>();

  constructor(private readonly options: AiSystemOptions<TUnit>) {
    this.knowledgeSystem = new AiKnowledgeSystem({
      width: options.mapWidth,
      height: options.mapHeight,
      units: options.units,
      buildings: options.buildings,
      resources: options.resources,
      buildingDefinitions: options.buildingDefinitions
    });
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

  getKnowledgeStates(): readonly AiKnowledgeSnapshot[] {
    return this.definitions.map((definition) =>
      this.knowledgeSystem.getSnapshot(definition.playerId)
    );
  }

  process(tick: number): void {
    for (const ai of this.definitions) {
      this.knowledgeSystem.update(
        ai.playerId,
        ai.enemyPlayerId,
        tick
      );

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

      if (
        this.handleDefense(
          ai,
          tick,
          state,
          villagers,
          military,
          townCenter
        )
      ) {
        continue;
      }

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
        targetMilitary,
        villagers.length
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
            constructionPlan
          );
        }

        const activeConstructionPlan = this.planConstruction(
          ai.playerId,
          this.options.calculatePopulation(ai.playerId),
          targetMilitary,
          villagers.length
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
            ai.playerId,
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
        targetMilitary,
        villagers.length
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

      const visibleEnemyUnitIds =
        this.knowledgeSystem.getVisibleEnemyUnitIds(ai.playerId);
      const enemyUnits = [...this.options.units.values()]
        .filter(
          (unit) =>
            unit.ownerId === ai.enemyPlayerId &&
            visibleEnemyUnitIds.has(unit.id)
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      const enemyBuildings = [
        ...this.knowledgeSystem.getRememberedEnemyBuildings(ai.playerId)
      ].sort((a, b) => {
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

  private handleDefense(
    ai: AiPlayerDefinition,
    tick: number,
    state: AiPlayerState | undefined,
    villagers: readonly TUnit[],
    military: readonly TUnit[],
    townCenter: BuildingState | undefined
  ): boolean {
    const visibleEnemyUnitIds =
      this.knowledgeSystem.getVisibleEnemyUnitIds(ai.playerId);
    const visibleEnemies = [...this.options.units.values()]
      .filter(
        (unit) =>
          unit.ownerId === ai.enemyPlayerId &&
          visibleEnemyUnitIds.has(unit.id)
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const ownBuildings = [...this.options.buildings.values()]
      .filter(
        (building) =>
          building.ownerId === ai.playerId &&
          building.completed
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const basePosition = townCenter
      ? this.buildingCenter(townCenter)
      : undefined;
    const threats = visibleEnemies.filter((enemy) => {
      if (
        basePosition &&
        distance(enemy.position, basePosition) <= DEFENSE_BASE_RADIUS
      ) {
        return true;
      }

      if (
        villagers.some(
          (villager) =>
            distance(enemy.position, villager.position) <=
            DEFENSE_WORKER_RADIUS
        )
      ) {
        return true;
      }

      return ownBuildings.some(
        (building) =>
          distance(
            enemy.position,
            this.buildingCenter(building)
          ) <= DEFENSE_BUILDING_RADIUS
      );
    });

    if (threats.length > 0) {
      this.lastThreatTick.set(ai.playerId, tick);
    }

    const lastThreatTick = this.lastThreatTick.get(ai.playerId);
    const hysteresisTicks =
      DEFENSE_HYSTERESIS_SECONDS * this.options.tickRate;
    const defending =
      threats.length > 0 ||
      (lastThreatTick !== undefined &&
        tick - lastThreatTick <= hysteresisTicks);

    if (!defending) {
      if (lastThreatTick !== undefined) {
        this.lastThreatTick.delete(ai.playerId);
      }
      return false;
    }

    if (state) {
      state.mode = "defending";
    }

    if (threats.length === 0) {
      if (basePosition) {
        for (const defender of military) {
          if (
            !defender.attackTask &&
            defender.activity === "idle" &&
            this.options.canReach(defender, basePosition)
          ) {
            this.options.executeCommand({
              type: "move",
              playerId: ai.playerId,
              unitIds: [defender.id],
              target: basePosition
            });
          }
        }
      }

      return true;
    }

    for (const defender of military) {
      const target = [...threats].sort(
        (a, b) =>
          distance(defender.position, a.position) -
            distance(defender.position, b.position) ||
          a.id.localeCompare(b.id)
      )[0];

      if (!target) {
        continue;
      }

      this.options.executeCommand({
        type: "attack",
        playerId: ai.playerId,
        unitIds: [defender.id],
        targetUnitId: target.id
      });
    }

    for (const villager of villagers) {
      const nearestThreat = [...threats].sort(
        (a, b) =>
          distance(villager.position, a.position) -
            distance(villager.position, b.position) ||
          a.id.localeCompare(b.id)
      )[0];

      if (
        !nearestThreat ||
        distance(villager.position, nearestThreat.position) >
          DEFENSE_RETREAT_TRIGGER_RADIUS
      ) {
        continue;
      }

      const retreatTarget = this.findRetreatTarget(
        villager,
        nearestThreat,
        basePosition
      );

      if (!retreatTarget) {
        continue;
      }

      this.options.executeCommand({
        type: "move",
        playerId: ai.playerId,
        unitIds: [villager.id],
        target: retreatTarget
      });
    }

    return true;
  }

  private findRetreatTarget(
    villager: TUnit,
    threat: TUnit,
    basePosition: Vector2 | undefined
  ): Vector2 | undefined {
    const dx = villager.position.x - threat.position.x;
    const dy = villager.position.y - threat.position.y;
    const magnitude = Math.hypot(dx, dy);
    const awayTarget =
      magnitude > ARRIVAL_EPSILON
        ? {
            x: villager.position.x + (dx / magnitude) * 3,
            y: villager.position.y + (dy / magnitude) * 3
          }
        : undefined;

    if (
      awayTarget &&
      this.options.canReach(villager, awayTarget)
    ) {
      return awayTarget;
    }

    if (
      basePosition &&
      this.options.canReach(villager, basePosition)
    ) {
      return basePosition;
    }

    return undefined;
  }

  private buildingCenter(building: BuildingState): Vector2 {
    const definition = this.options.buildingDefinitions.get(building.kind);

    return {
      x:
        building.position.x +
        (definition?.footprint.width ?? 1) / 2,
      y:
        building.position.y +
        (definition?.footprint.height ?? 1) / 2
    };
  }

  private tryConstruct(
    playerId: string,
    builders: readonly TUnit[],
    plan: AiConstructionPlan
  ): boolean {
    const builder = plan.near
      ? [...builders].sort(
          (a, b) =>
            distance(a.position, plan.near as Vector2) -
              distance(b.position, plan.near as Vector2) ||
            a.id.localeCompare(b.id)
        )[0]
      : builders[0];

    if (!builder) {
      return false;
    }

    return this.tryBuild(
      playerId,
      builder,
      plan.buildingKind,
      plan.near
    );
  }

  private planConstruction(
    playerId: string,
    population: PlayerPopulationState,
    targetMilitary: number,
    villagerCount: number
  ): AiConstructionPlan | undefined {
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

    const hasEconomicDropOff = ownedBuildings.some((building) => {
      const definition = this.options.buildingDefinitions.get(
        building.kind
      );
      return Boolean(definition?.dropOffAccepts?.length);
    });
    const economicPlan = this.planEconomicExpansion(
      playerId,
      villagerCount,
      ownedBuildings
    );

    if (!hasEconomicDropOff && economicPlan) {
      return economicPlan;
    }

    const hasArcheryRange = ownedBuildings.some(
      (building) => building.kind === "archery-range"
    );

    if (targetMilitary >= 4 && !hasArcheryRange) {
      return this.buildingReservation("archery-range");
    }

    return economicPlan;
  }

  private planEconomicExpansion(
    playerId: string,
    villagerCount: number,
    ownedBuildings: readonly BuildingState[]
  ): AiConstructionPlan | undefined {
    if (villagerCount < ECONOMIC_EXPANSION_MIN_VILLAGERS) {
      return undefined;
    }

    const hasEconomicConstruction = ownedBuildings.some((building) => {
      if (building.completed) {
        return false;
      }

      const definition = this.options.buildingDefinitions.get(
        building.kind
      );
      return Boolean(definition?.dropOffAccepts?.length);
    });

    if (hasEconomicConstruction) {
      return undefined;
    }

    const knownResources = [
      ...this.knowledgeSystem.getKnownResources(playerId)
    ].filter((resource) => resource.amount > ARRIVAL_EPSILON);

    for (const kind of ECONOMIC_RESOURCE_ORDER) {
      const buildingKind = ECONOMIC_BUILDING_BY_RESOURCE[kind];

      if (!this.options.buildingDefinitions.has(buildingKind)) {
        continue;
      }

      const compatibleDropOffs = ownedBuildings.filter((building) => {
        if (!building.completed) {
          return false;
        }

        if (building.kind === "town-center") {
          return true;
        }

        return Boolean(
          this.options.buildingDefinitions
            .get(building.kind)
            ?.dropOffAccepts?.includes(kind)
        );
      });

      if (compatibleDropOffs.length === 0) {
        continue;
      }

      const sameKindBuildings = ownedBuildings.filter(
        (building) => building.kind === buildingKind
      );
      const candidate = knownResources
        .filter((resource) => resource.kind === kind)
        .map((resource) => ({
          resource,
          dropOffDistance: Math.min(
            ...compatibleDropOffs.map((building) =>
              distance(
                resource.position,
                this.buildingCenter(building)
              )
            )
          )
        }))
        .filter(
          ({ resource, dropOffDistance }) =>
            dropOffDistance >
              ECONOMIC_DROP_OFF_TRIGGER_DISTANCE &&
            !sameKindBuildings.some(
              (building) =>
                distance(
                  resource.position,
                  this.buildingCenter(building)
                ) <= ECONOMIC_DROP_OFF_LOCAL_RADIUS
            )
        )
        .sort(
          (a, b) =>
            a.dropOffDistance - b.dropOffDistance ||
            a.resource.id.localeCompare(b.resource.id)
        )[0];

      if (!candidate) {
        continue;
      }

      return this.buildingReservation(
        buildingKind,
        candidate.resource.position
      );
    }

    return undefined;
  }

  private buildingReservation(
    buildingKind: BuildingState["kind"],
    near?: Vector2
  ): AiConstructionPlan | undefined {
    const definition = this.options.buildingDefinitions.get(buildingKind);

    if (!definition) {
      return undefined;
    }

    return {
      buildingKind,
      reservation: {
        key: `build:${buildingKind}`,
        cost: { ...definition.cost }
      },
      near: near ? { ...near } : undefined
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
    buildingKind: BuildingState["kind"],
    near?: Vector2
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

    const baseOffsets = [
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
    const expansionOffsets = [
      { x: -3, y: -3 },
      { x: 1, y: -3 },
      { x: -3, y: 1 },
      { x: 2, y: 1 },
      { x: -4, y: 3 },
      { x: 1, y: 3 },
      { x: -5, y: -1 },
      { x: 3, y: -1 }
    ] as const;
    const anchor = near
      ? { x: Math.floor(near.x), y: Math.floor(near.y) }
      : townCenter.position;
    const offsets = near ? expansionOffsets : baseOffsets;

    for (const offset of offsets) {
      const position = {
        x: anchor.x + offset.x,
        y: anchor.y + offset.y
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
    playerId: string,
    unit: TUnit,
    kind: ResourceKind
  ): ResourceNodeState | undefined {
    const available = [
      ...this.knowledgeSystem.getKnownResources(playerId)
    ]
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
