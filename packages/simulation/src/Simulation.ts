import { GridNavigation } from "./GridNavigation";
import { MAX_TRAINING_QUEUE, ProductionSystem } from "./systems/ProductionSystem";
import { ResearchSystem } from "./systems/ResearchSystem";
import {
  ConstructionSystem,
  type BuildTask
} from "./systems/ConstructionSystem";
import {
  EconomySystem,
  type GatherTask
} from "./systems/EconomySystem";
import {
  canAttackBuildingTarget,
  canAttackUnitTarget,
  canSetRallyPoint,
  hasResources,
  selectCombatCapableUnits,
  selectOwnedUnits,
  selectOwnedVillagers
} from "./commands/commandValidation";
import type {
  AiPlayerDefinition,
  AiPlayerState,
  AttackBuildingCommand,
  AttackCommand,
  BuildCommand,
  BuildingDefinition,
  BuildingState,
  DropOffPointState,
  GameCommand,
  GatherCommand,
  MatchState,
  MoveCommand,
  PlayerPopulationState,
  PlayerStockpileState,
  ResearchCommand,
  ResourceKind,
  ResourceNodeState,
  ResourceStockpile,
  SimulationOptions,
  SetRallyPointCommand,
  SimulationSnapshot,
  TechnologyDefinition,
  TrainCommand,
  UnitDefinition,
  UnitKind,
  UnitState,
  Vector2
} from "./types";

export const DEFAULT_TICK_RATE = 20;

const DEFAULT_MAP_SIZE = 64;
const FORMATION_SPACING = 0.72;
const ARRIVAL_EPSILON = 0.000001;
const UNIT_RADIUS = 0.26;
const MIN_UNIT_DISTANCE = UNIT_RADIUS * 2;
const SEPARATION_ITERATIONS = 2;

interface AttackTask {
  targetType: "unit" | "building";
  targetId: string;
}

interface RuntimeUnit extends UnitState {
  waypoints: Vector2[];
  gatherTask?: GatherTask;
  buildTask?: BuildTask;
  attackTask?: AttackTask;
  attackCooldownTicks: number;
}

export class Simulation {
  readonly tickRate: number;
  readonly tickDurationMs: number;

  private tick = 0;
  private nextBuildingSequence = 1;
  private nextUnitSequence = 1;
  private readonly navigation: GridNavigation;
  private readonly units = new Map<string, RuntimeUnit>();
  private readonly resources = new Map<string, ResourceNodeState>();
  private readonly dropOffPoints = new Map<string, DropOffPointState>();
  private readonly stockpiles = new Map<string, ResourceStockpile>();
  private readonly buildingDefinitions = new Map<string, BuildingDefinition>();
  private readonly unitDefinitions = new Map<string, UnitDefinition>();
  private readonly technologyDefinitions = new Map<string, TechnologyDefinition>();
  private readonly productionSystem: ProductionSystem;
  private readonly researchSystem: ResearchSystem;
  private readonly economySystem: EconomySystem<RuntimeUnit>;
  private readonly constructionSystem: ConstructionSystem<RuntimeUnit>;
  private readonly buildings = new Map<string, BuildingState>();
  private readonly aiPlayers: readonly AiPlayerDefinition[];
  private readonly aiStates = new Map<string, AiPlayerState>();
  private readonly matchState: MatchState = {
    status: "playing",
    winnerPlayerId: null,
    loserPlayerId: null,
    reason: null
  };
  private readonly commandQueue: GameCommand[] = [];

  constructor(options: SimulationOptions = {}) {
    this.tickRate = options.tickRate ?? DEFAULT_TICK_RATE;

    if (!Number.isFinite(this.tickRate) || this.tickRate <= 0) {
      throw new Error("tickRate must be a positive finite number.");
    }

    this.tickDurationMs = 1000 / this.tickRate;
    this.aiPlayers = (options.aiPlayers ?? []).map((definition) => ({
      ...definition,
      thinkIntervalTicks: definition.thinkIntervalTicks ?? this.tickRate
    }));
    for (const ai of this.aiPlayers) {
      this.aiStates.set(ai.playerId, {
        playerId: ai.playerId,
        mode: "waiting"
      });
    }
    this.navigation = new GridNavigation(
      options.map ?? {
        width: DEFAULT_MAP_SIZE,
        height: DEFAULT_MAP_SIZE
      }
    );
    this.economySystem = new EconomySystem(
      this.tickRate,
      this.resources,
      this.dropOffPoints,
      (playerId) => this.ensureStockpile(playerId),
      (unit, target) => this.assignPath(unit, target)
    );
    this.constructionSystem = new ConstructionSystem(
      this.tickRate,
      this.navigation,
      this.buildings,
      this.buildingDefinitions,
      this.resources,
      this.units,
      (unit, target) => this.assignPath(unit, target)
    );

    for (const definition of options.buildingDefinitions ?? []) {
      if (this.buildingDefinitions.has(definition.kind)) {
        throw new Error(`Duplicate building definition: ${definition.kind}`);
      }

      this.validateBuildingDefinition(definition);
      this.buildingDefinitions.set(
        definition.kind,
        cloneBuildingDefinition(definition)
      );
    }

    for (const definition of options.unitDefinitions ?? []) {
      if (this.unitDefinitions.has(definition.kind)) {
        throw new Error(`Duplicate unit definition: ${definition.kind}`);
      }

      this.validateUnitDefinition(definition);
      this.unitDefinitions.set(definition.kind, cloneUnitDefinition(definition));
    }

    for (const definition of options.technologyDefinitions ?? []) {
      if (this.technologyDefinitions.has(definition.kind)) {
        throw new Error(`Duplicate technology definition: ${definition.kind}`);
      }

      this.validateTechnologyDefinition(definition);
      this.technologyDefinitions.set(
        definition.kind,
        cloneTechnologyDefinition(definition)
      );
    }

    this.productionSystem = new ProductionSystem(
      this.tickRate,
      this.unitDefinitions,
      this.buildingDefinitions
    );
    this.researchSystem = new ResearchSystem(
      this.tickRate,
      this.technologyDefinitions
    );

    for (const building of options.buildings ?? []) {
      if (this.buildings.has(building.id)) {
        throw new Error(`Duplicate building id: ${building.id}`);
      }

      const clonedBuilding = cloneBuilding(building);
      this.buildings.set(building.id, clonedBuilding);
      this.ensureStockpile(building.ownerId);

      const definition = this.buildingDefinitions.get(building.kind);
      if (definition) {
        this.navigation.blockCells(
          buildingFootprintCells(clonedBuilding, definition)
        );
      }

      this.nextBuildingSequence += 1;
    }

    for (const unit of options.units ?? []) {
      if (this.units.has(unit.id)) {
        throw new Error(`Duplicate unit id: ${unit.id}`);
      }

      this.units.set(unit.id, {
        ...cloneUnit(unit),
        waypoints: [],
        attackCooldownTicks: 0
      });
      this.ensureStockpile(unit.ownerId);
      this.nextUnitSequence += 1;
    }

    for (const resource of options.resources ?? []) {
      if (this.resources.has(resource.id)) {
        throw new Error(`Duplicate resource id: ${resource.id}`);
      }

      if (!Number.isFinite(resource.amount) || resource.amount < 0) {
        throw new Error(`Resource amount must be non-negative: ${resource.id}`);
      }

      this.resources.set(resource.id, cloneResource(resource));
    }

    for (const dropOffPoint of options.dropOffPoints ?? []) {
      if (this.dropOffPoints.has(dropOffPoint.id)) {
        throw new Error(`Duplicate drop-off point id: ${dropOffPoint.id}`);
      }

      this.dropOffPoints.set(dropOffPoint.id, cloneDropOffPoint(dropOffPoint));
      this.ensureStockpile(dropOffPoint.ownerId);
    }

    for (const [playerId, initialStockpile] of Object.entries(
      options.stockpiles ?? {}
    )) {
      this.stockpiles.set(playerId, {
        wood: initialStockpile.wood ?? 0,
        food: initialStockpile.food ?? 0,
        gold: initialStockpile.gold ?? 0
      });
    }
  }

  queueCommand(command: GameCommand): void {
    this.commandQueue.push(cloneCommand(command));
  }

  step(): void {
    if (this.matchState.status === "ended") {
      this.commandQueue.splice(0);
      return;
    }

    this.applyQueuedCommands();
    this.processAi();
    this.moveUnits();
    this.economySystem.step(this.units.values());
    this.constructionSystem.step(this.units.values());
    this.productionSystem.step(this.buildings.values(), {
      findSpawnPosition: (building) => this.findSpawnPosition(building),
      spawnUnit: (building, definition, position) =>
        this.spawnProducedUnit(building, definition, position),
      routeToRallyPoint: (unitId, target) =>
        this.routeProducedUnitToRallyPoint(unitId, target)
    });
    this.researchSystem.step(this.buildings.values());
    this.processCombat();
    this.resolveUnitSeparation();
    this.tick += 1;
  }

  getSnapshot(): SimulationSnapshot {
    return {
      tick: this.tick,
      units: [...this.units.values()].map(cloneUnit),
      resources: [...this.resources.values()].map(cloneResource),
      stockpiles: [...this.stockpiles.entries()].map(
        ([playerId, resources]): PlayerStockpileState => ({
          playerId,
          resources: { ...resources }
        })
      ),
      population: this.playerIds().map((playerId) =>
        this.productionSystem.calculatePopulation(
          playerId,
          this.units.values(),
          this.buildings.values()
        )
      ),
      aiPlayers: [...this.aiStates.values()].map((state) => ({ ...state })),
      technologies: this.playerIds().map((playerId) => ({
        playerId,
        researched: this.researchSystem.getResearched(playerId)
      })),
      match: { ...this.matchState },
      buildings: [...this.buildings.values()].map(cloneBuilding)
    };
  }

  private applyQueuedCommands(): void {
    const commands = this.commandQueue.splice(0);

    for (const command of commands) {
      switch (command.type) {
        case "move":
          this.applyMoveCommand(command);
          break;
        case "gather":
          this.applyGatherCommand(command);
          break;
        case "build":
          this.applyBuildCommand(command);
          break;
        case "train":
          this.applyTrainCommand(command);
          break;
        case "research":
          this.applyResearchCommand(command);
          break;
        case "set-rally-point":
          this.applySetRallyPointCommand(command);
          break;
        case "attack":
          this.applyAttackCommand(command);
          break;
        case "attack-building":
          this.applyAttackBuildingCommand(command);
          break;
      }
    }
  }

  private applyMoveCommand(command: MoveCommand): void {
    const controllableUnits = selectOwnedUnits(
      command.unitIds,
      command.playerId,
      this.units
    );

    const formationTargets = createFormationTargets(
      command.target,
      controllableUnits.length
    );

    controllableUnits.forEach((unit, index) => {
      this.clearWorkTasks(unit);
      unit.activity = "moving";

      const requestedTarget = formationTargets[index] ?? command.target;

      if (!this.assignPath(unit, requestedTarget)) {
        unit.activity = "idle";
      }
    });
  }

  private applyGatherCommand(command: GatherCommand): void {
    const resource = this.resources.get(command.resourceId);

    if (!resource || resource.amount <= ARRIVAL_EPSILON) {
      return;
    }

    for (const unit of selectOwnedVillagers(
      command.unitIds,
      command.playerId,
      this.units
    )) {

      unit.buildTask = undefined;
      unit.attackTask = undefined;
      unit.gatherTask = {
        resourceId: resource.id,
        phase: "to-resource"
      };

      if (
        unit.cargo &&
        unit.cargo.amount > ARRIVAL_EPSILON &&
        unit.cargo.kind !== resource.kind
      ) {
        this.economySystem.beginReturnToDropOff(unit, unit.cargo.kind);
        continue;
      }

      this.economySystem.routeVillagerToResource(unit, resource);
    }
  }

  private applyBuildCommand(command: BuildCommand): void {
    const definition = this.buildingDefinitions.get(command.buildingKind);

    if (!definition) {
      return;
    }

    const position = {
      x: Math.floor(command.position.x),
      y: Math.floor(command.position.y)
    };

    if (!this.constructionSystem.canPlaceBuilding(definition, position)) {
      return;
    }

    const buildersWithTargets = selectOwnedVillagers(
      command.unitIds,
      command.playerId,
      this.units
    ).map((unit) => ({
        unit,
        target: this.constructionSystem.findBuildApproachPosition(unit, definition, position)
      }))
      .filter(
        (
          entry
        ): entry is {
          unit: RuntimeUnit;
          target: Vector2;
        } => entry.target !== null
      );

    if (buildersWithTargets.length === 0) {
      return;
    }

    const stockpile = this.ensureStockpile(command.playerId);

    if (!hasResources(stockpile, definition.cost)) {
      return;
    }

    spendResources(stockpile, definition.cost);

    const buildingId = this.createBuildingId(definition.kind);
    const building: BuildingState = {
      id: buildingId,
      ownerId: command.playerId,
      kind: definition.kind,
      position,
      progress: 0,
      completed: false,
      hitPoints: 1,
      trainingQueue: [],
      rallyPoint: null
    };

    this.buildings.set(building.id, building);
    this.navigation.blockCells(buildingFootprintCells(building, definition));

    for (const { unit, target } of buildersWithTargets) {
      unit.gatherTask = undefined;
      unit.attackTask = undefined;
      unit.buildTask = {
        buildingId: building.id,
        target: { ...target }
      };
      unit.activity = "moving";

      if (!this.assignPath(unit, target)) {
        unit.buildTask = undefined;
        unit.activity = "idle";
      }
    }
  }

  private applyTrainCommand(command: TrainCommand): void {
    this.productionSystem.startTraining(
      command.playerId,
      this.buildings.get(command.buildingId),
      this.unitDefinitions.get(command.unitKind),
      this.units.values(),
      this.buildings.values(),
      () => this.ensureStockpile(command.playerId)
    );
  }

  private applyResearchCommand(command: ResearchCommand): void {
    this.researchSystem.startResearch(
      command.playerId,
      this.buildings.get(command.buildingId),
      this.technologyDefinitions.get(command.technologyKind),
      () => this.ensureStockpile(command.playerId)
    );
  }

  private applySetRallyPointCommand(command: SetRallyPointCommand): void {
    const building = this.buildings.get(command.buildingId);

    if (!canSetRallyPoint(building, command.playerId)) {
      return;
    }

    const resolved = this.navigation.resolveTarget(command.target);

    if (!resolved) {
      return;
    }

    building.rallyPoint = { ...resolved };
  }

  private applyAttackCommand(command: AttackCommand): void {
    const target = this.units.get(command.targetUnitId);

    if (!canAttackUnitTarget(target, command.playerId)) {
      return;
    }

    for (const unit of selectCombatCapableUnits(
      command.unitIds,
      command.playerId,
      this.units,
      this.unitDefinitions
    )) {
      const definition = this.unitDefinitions.get(unit.kind);

      if (!definition) {
        continue;
      }

      unit.gatherTask = undefined;
      unit.buildTask = undefined;
      unit.attackTask = {
        targetType: "unit",
        targetId: target.id
      };
      unit.activity = "attacking";
      this.routeAttackerToTarget(unit, target, definition);
    }
  }

  private applyAttackBuildingCommand(
    command: AttackBuildingCommand
  ): void {
    const target = this.buildings.get(command.targetBuildingId);

    if (!canAttackBuildingTarget(target, command.playerId)) {
      return;
    }

    const targetDefinition = this.buildingDefinitions.get(target.kind);

    if (!targetDefinition) {
      return;
    }

    for (const unit of selectCombatCapableUnits(
      command.unitIds,
      command.playerId,
      this.units,
      this.unitDefinitions
    )) {
      const definition = this.unitDefinitions.get(unit.kind);

      if (!definition) {
        continue;
      }

      unit.gatherTask = undefined;
      unit.buildTask = undefined;
      unit.attackTask = {
        targetType: "building",
        targetId: target.id
      };
      unit.activity = "attacking";
      this.routeAttackerToBuilding(
        unit,
        target,
        targetDefinition,
        definition
      );
    }
  }

  private moveUnits(): void {
    const maxDistancePerTick = 1 / this.tickRate;

    for (const unit of this.units.values()) {
      let remainingDistance = unit.speed * maxDistancePerTick;

      while (remainingDistance > ARRIVAL_EPSILON && unit.waypoints.length > 0) {
        const waypoint = unit.waypoints[0];

        if (!waypoint) {
          break;
        }

        const distanceToWaypoint = distance(unit.position, waypoint);

        if (distanceToWaypoint <= ARRIVAL_EPSILON) {
          unit.position = { ...waypoint };
          unit.waypoints.shift();
          continue;
        }

        if (distanceToWaypoint <= remainingDistance) {
          unit.position = { ...waypoint };
          unit.waypoints.shift();
          remainingDistance -= distanceToWaypoint;
          continue;
        }

        const scale = remainingDistance / distanceToWaypoint;
        unit.position.x += (waypoint.x - unit.position.x) * scale;
        unit.position.y += (waypoint.y - unit.position.y) * scale;
        remainingDistance = 0;
      }

      if (unit.waypoints.length === 0) {
        unit.destination = null;

        if (
          !unit.gatherTask &&
          !unit.buildTask &&
          !unit.attackTask &&
          unit.activity === "moving"
        ) {
          unit.activity = "idle";
        }
      }
    }
  }

  private processAi(): void {
    for (const ai of this.aiPlayers) {
      const interval = Math.max(1, ai.thinkIntervalTicks ?? this.tickRate);
      const state = this.aiStates.get(ai.playerId);

      if (this.tick === 0 || this.tick % interval !== 0) {
        continue;
      }

      const ownUnits = [...this.units.values()]
        .filter((unit) => unit.ownerId === ai.playerId)
        .sort((a, b) => a.id.localeCompare(b.id));
      const villagers = ownUnits.filter(
        (unit) => unit.kind === "villager"
      );
      const military = ownUnits.filter((unit) => {
        const definition = this.unitDefinitions.get(unit.kind);
        return Boolean(definition && definition.attackDamage > 0);
      });
      const population = this.productionSystem.calculatePopulation(
        ai.playerId,
        this.units.values(),
        this.buildings.values()
      );
      const stockpile = this.ensureStockpile(ai.playerId);

      const townCenter = [...this.buildings.values()]
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

      const queuedVillagers = [...this.buildings.values()]
        .filter((building) => building.ownerId === ai.playerId)
        .flatMap((building) => building.trainingQueue)
        .filter((item) => item.unitKind === "villager").length;

      if (
        economyEnabled &&
        townCenter &&
        villagers.length + queuedVillagers < targetVillagers &&
        population.used + population.queued < population.cap
      ) {
        this.applyTrainCommand({
          type: "train",
          playerId: ai.playerId,
          buildingId: townCenter.id,
          unitKind: "villager"
        });
      }

      const availableBuilders = villagers.filter(
        (unit) =>
          !unit.buildTask &&
          !unit.attackTask
      );
      const idleVillagers = villagers.filter(
        (unit) =>
          !unit.gatherTask &&
          !unit.buildTask &&
          !unit.attackTask &&
          unit.activity === "idle"
      );

      if (economyEnabled) {
        this.aiTryConstruct(
          ai.playerId,
          availableBuilders,
          population,
          targetMilitary
        );

        const gatherers = idleVillagers.filter(
          (unit) => !unit.buildTask && unit.activity === "idle"
        );

        gatherers.forEach((villager, index) => {
          const desiredKind = this.aiDesiredResourceKind(
            stockpile,
            index
          );
        const resource = this.findNearestResourceForAi(
          villager.position,
          desiredKind
        );

        if (!resource) {
          return;
        }

          this.applyGatherCommand({
            type: "gather",
            playerId: ai.playerId,
            unitIds: [villager.id],
            resourceId: resource.id
          });
        });
      }

      const queuedMilitary = [...this.buildings.values()]
        .filter((building) => building.ownerId === ai.playerId)
        .flatMap((building) => building.trainingQueue)
        .filter((item) => item.unitKind !== "villager").length;

      if (
        economyEnabled &&
        military.length + queuedMilitary < targetMilitary
      ) {
        const productionBuildings = [...this.buildings.values()]
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

        if (archeryRange && military.length % 2 === 1) {
          this.applyTrainCommand({
            type: "train",
            playerId: ai.playerId,
            buildingId: archeryRange.id,
            unitKind: "archer"
          });
        } else if (barracks) {
          this.applyTrainCommand({
            type: "train",
            playerId: ai.playerId,
            buildingId: barracks.id,
            unitKind: "militia"
          });
        } else if (archeryRange) {
          this.applyTrainCommand({
            type: "train",
            playerId: ai.playerId,
            buildingId: archeryRange.id,
            unitKind: "archer"
          });
        }
      }

      if (
        economyEnabled &&
        military.length >= targetMilitary
      ) {
        const researchBuilding = [...this.buildings.values()]
          .filter(
            (building) =>
              building.ownerId === ai.playerId &&
              building.completed &&
              building.trainingQueue.length === 0 &&
              (building.researchQueue?.length ?? 0) === 0
          )
          .sort((a, b) => a.id.localeCompare(b.id))
          .find((building) =>
            [...this.technologyDefinitions.values()].some(
              (technology) =>
                technology.buildingKind === building.kind &&
                !this.researchSystem.hasTechnology(ai.playerId, technology.kind)
            )
          );

        if (researchBuilding) {
          const technology = [...this.technologyDefinitions.values()]
            .filter(
              (entry) =>
                entry.buildingKind === researchBuilding.kind &&
                !this.researchSystem.hasTechnology(ai.playerId, entry.kind)
            )
            .sort((a, b) => a.kind.localeCompare(b.kind))[0];

          if (technology) {
            this.applyResearchCommand({
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

      const enemyUnits = [...this.units.values()]
        .filter((unit) => unit.ownerId === ai.enemyPlayerId)
        .sort((a, b) => a.id.localeCompare(b.id));
      const enemyBuildings = [...this.buildings.values()]
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

        const definition = this.unitDefinitions.get(attacker.kind);

        if (!definition) {
          continue;
        }

        const target = [...enemyUnits].sort(
          (a, b) =>
            distance(attacker.position, a.position) -
              distance(attacker.position, b.position) ||
            a.id.localeCompare(b.id)
        )[0];

        this.clearWorkTasks(attacker);
        attacker.activity = "attacking";

        if (target) {
          attacker.attackTask = {
            targetType: "unit",
            targetId: target.id
          };
          this.routeAttackerToTarget(attacker, target, definition);
          continue;
        }

        const buildingTarget = enemyBuildings[0];
        const buildingDefinition = buildingTarget
          ? this.buildingDefinitions.get(buildingTarget.kind)
          : undefined;

        if (!buildingTarget || !buildingDefinition) {
          attacker.activity = "idle";
          continue;
        }

        attacker.attackTask = {
          targetType: "building",
          targetId: buildingTarget.id
        };
        this.routeAttackerToBuilding(
          attacker,
          buildingTarget,
          buildingDefinition,
          definition
        );
      }
    }
  }

  private aiTryConstruct(
    playerId: string,
    idleVillagers: readonly RuntimeUnit[],
    population: PlayerPopulationState,
    targetMilitary: number
  ): boolean {
    const builder = idleVillagers[0];

    if (!builder) {
      return false;
    }

    const ownedBuildings = [...this.buildings.values()].filter(
      (building) => building.ownerId === playerId
    );
    const populationHeadroom =
      population.cap - population.used - population.queued;
    const houseUnderConstruction = ownedBuildings.some(
      (building) =>
        building.kind === "house" && !building.completed
    );

    if (
      populationHeadroom <= 2 &&
      !houseUnderConstruction &&
      this.aiTryBuild(playerId, builder, "house")
    ) {
      return true;
    }

    const hasBarracks = ownedBuildings.some(
      (building) => building.kind === "barracks"
    );

    if (
      targetMilitary > 0 &&
      !hasBarracks &&
      this.aiTryBuild(playerId, builder, "barracks")
    ) {
      return true;
    }

    const hasArcheryRange = ownedBuildings.some(
      (building) => building.kind === "archery-range"
    );

    if (
      targetMilitary >= 4 &&
      !hasArcheryRange &&
      this.aiTryBuild(playerId, builder, "archery-range")
    ) {
      return true;
    }

    return false;
  }

  private aiTryBuild(
    playerId: string,
    builder: RuntimeUnit,
    buildingKind: BuildingState["kind"]
  ): boolean {
    const definition = this.buildingDefinitions.get(buildingKind);

    if (!definition) {
      return false;
    }

    const stockpile = this.ensureStockpile(playerId);

    if (!hasResources(stockpile, definition.cost)) {
      return false;
    }

    const townCenter = [...this.buildings.values()]
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

      if (!this.constructionSystem.canPlaceBuilding(definition, position)) {
        continue;
      }

      if (
        !this.constructionSystem.findBuildApproachPosition(
          builder,
          definition,
          position
        )
      ) {
        continue;
      }

      const before = this.buildings.size;

      this.applyBuildCommand({
        type: "build",
        playerId,
        unitIds: [builder.id],
        buildingKind,
        position
      });

      if (this.buildings.size > before) {
        return true;
      }
    }

    return false;
  }

  private aiDesiredResourceKind(
    stockpile: ResourceStockpile,
    villagerIndex: number
  ): ResourceKind {
    if (stockpile.food < 120) {
      return villagerIndex % 3 === 0 ? "wood" : "food";
    }

    if (stockpile.wood < 120) {
      return villagerIndex % 3 === 0 ? "food" : "wood";
    }

    if (stockpile.gold < 90) {
      return villagerIndex % 2 === 0 ? "gold" : "food";
    }

    return (["food", "wood", "gold"] as const)[villagerIndex % 3] ?? "food";
  }

  private findNearestResourceForAi(
    position: Vector2,
    kind: ResourceKind
  ): ResourceNodeState | undefined {
    const available = [...this.resources.values()]
      .filter((resource) => resource.amount > ARRIVAL_EPSILON)
      .sort(
        (a, b) =>
          distance(position, a.position) -
            distance(position, b.position) ||
          a.id.localeCompare(b.id)
      );

    return (
      available.find((resource) => resource.kind === kind) ??
      available[0]
    );
  }

  private processCombat(): void {
    const deadUnitIds = new Set<string>();
    const destroyedBuildings = new Map<string, string>();

    for (const unit of this.units.values()) {
      if (unit.attackCooldownTicks > 0) {
        unit.attackCooldownTicks -= 1;
      }
    }

    for (const unit of this.units.values()) {
      const task = unit.attackTask;

      if (!task || deadUnitIds.has(unit.id)) {
        continue;
      }

      const definition = this.unitDefinitions.get(unit.kind);

      if (!definition || definition.attackDamage <= 0) {
        this.stopAttackTask(unit);
        continue;
      }

      if (task.targetType === "unit") {
        const target = this.units.get(task.targetId);

        if (
          !target ||
          target.ownerId === unit.ownerId ||
          target.hitPoints <= 0
        ) {
          this.stopAttackTask(unit);
          continue;
        }

        const targetDistance = distance(unit.position, target.position);

        if (targetDistance > definition.attackRange) {
          unit.activity = "attacking";

          const needsRepath =
            unit.waypoints.length === 0 ||
            !unit.destination ||
            distance(unit.destination, target.position) > 0.6;

          if (needsRepath) {
            this.routeAttackerToTarget(unit, target, definition);
          }

          continue;
        }

        unit.waypoints = [];
        unit.destination = null;
        unit.activity = "attacking";

        if (unit.attackCooldownTicks > 0) {
          continue;
        }

        target.hitPoints -= this.attackDamageFor(
          unit,
          definition,
          target.kind
        );
        unit.attackCooldownTicks = Math.max(
          1,
          Math.round(definition.attackCooldownSeconds * this.tickRate)
        );

        if (target.hitPoints <= 0) {
          deadUnitIds.add(target.id);
        }

        continue;
      }

      const building = this.buildings.get(task.targetId);
      const buildingDefinition = building
        ? this.buildingDefinitions.get(building.kind)
        : undefined;

      if (
        !building ||
        building.ownerId === unit.ownerId ||
        building.hitPoints <= 0 ||
        !buildingDefinition
      ) {
        this.stopAttackTask(unit);
        continue;
      }

      const targetDistance = distanceToBuilding(
        unit.position,
        building,
        buildingDefinition
      );

      if (targetDistance > definition.attackRange) {
        unit.activity = "attacking";

        if (
          unit.waypoints.length === 0 &&
          !this.routeAttackerToBuilding(
            unit,
            building,
            buildingDefinition,
            definition
          )
        ) {
          this.stopAttackTask(unit);
        }

        continue;
      }

      unit.waypoints = [];
      unit.destination = null;
      unit.activity = "attacking";

      if (unit.attackCooldownTicks > 0) {
        continue;
      }

      building.hitPoints -= this.attackDamageFor(unit, definition);
      unit.attackCooldownTicks = Math.max(
        1,
        Math.round(definition.attackCooldownSeconds * this.tickRate)
      );

      if (building.hitPoints <= 0) {
        destroyedBuildings.set(building.id, unit.ownerId);
      }
    }

    for (const unitId of deadUnitIds) {
      this.units.delete(unitId);
    }

    for (const [buildingId, attackerOwnerId] of destroyedBuildings) {
      const building = this.buildings.get(buildingId);

      if (!building) {
        continue;
      }

      const definition = this.buildingDefinitions.get(building.kind);

      if (definition) {
        this.navigation.unblockCells(
          buildingFootprintCells(building, definition)
        );
      }

      this.buildings.delete(buildingId);

      if (building.kind === "town-center") {
        this.matchState.status = "ended";
        this.matchState.winnerPlayerId = attackerOwnerId;
        this.matchState.loserPlayerId = building.ownerId;
        this.matchState.reason = "town-center-destroyed";
      }
    }

    if (deadUnitIds.size > 0 || destroyedBuildings.size > 0) {
      for (const unit of this.units.values()) {
        if (
          unit.attackTask?.targetType === "unit" &&
          deadUnitIds.has(unit.attackTask.targetId)
        ) {
          this.stopAttackTask(unit);
        }

        if (
          unit.attackTask?.targetType === "building" &&
          destroyedBuildings.has(unit.attackTask.targetId)
        ) {
          this.stopAttackTask(unit);
        }

        if (
          unit.buildTask &&
          destroyedBuildings.has(unit.buildTask.buildingId)
        ) {
          this.constructionSystem.stopBuildTask(unit);
        }
      }
    }
  }

  private routeAttackerToTarget(
    unit: RuntimeUnit,
    target: RuntimeUnit,
    definition: UnitDefinition
  ): void {
    if (distance(unit.position, target.position) <= definition.attackRange) {
      unit.waypoints = [];
      unit.destination = null;
      unit.activity = "attacking";
      return;
    }

    unit.activity = "attacking";

    if (!this.assignPath(unit, target.position)) {
      this.stopAttackTask(unit);
    }
  }

  private routeAttackerToBuilding(
    unit: RuntimeUnit,
    target: BuildingState,
    targetDefinition: BuildingDefinition,
    unitDefinition: UnitDefinition
  ): boolean {
    if (
      distanceToBuilding(
        unit.position,
        target,
        targetDefinition
      ) <= unitDefinition.attackRange
    ) {
      unit.waypoints = [];
      unit.destination = null;
      unit.activity = "attacking";
      return true;
    }

    const approach = this.constructionSystem.findBuildApproachPosition(
      unit,
      targetDefinition,
      target.position
    );

    if (!approach) {
      return false;
    }

    unit.activity = "attacking";
    return this.assignPath(unit, approach);
  }

  private spawnProducedUnit(
    building: BuildingState,
    definition: UnitDefinition,
    position: Vector2
  ): string {
    const unitId = this.createUnitId(definition.kind);
    const spawnedUnit: RuntimeUnit = {
      id: unitId,
      ownerId: building.ownerId,
      kind: definition.kind,
      position: { ...position },
      destination: null,
      speed: definition.speed,
      hitPoints: definition.maxHitPoints,
      activity: "idle",
      cargo: null,
      waypoints: [],
      attackCooldownTicks: 0
    };

    this.units.set(unitId, spawnedUnit);
    return unitId;
  }

  private routeProducedUnitToRallyPoint(
    unitId: string,
    target: Vector2
  ): void {
    const unit = this.units.get(unitId);

    if (!unit) {
      return;
    }

    unit.activity = "moving";

    if (!this.assignPath(unit, target)) {
      unit.activity = "idle";
    }
  }

  private findSpawnPosition(building: BuildingState): Vector2 | null {
    const definition = this.buildingDefinitions.get(building.kind);

    if (!definition) {
      return null;
    }

    const center = buildingCenter(building, definition);
    const candidates: Vector2[] = [
      {
        x: building.position.x + definition.footprint.width + 0.5,
        y: center.y
      },
      {
        x: center.x,
        y: building.position.y + definition.footprint.height + 0.5
      },
      {
        x: building.position.x - 0.5,
        y: center.y
      },
      {
        x: center.x,
        y: building.position.y - 0.5
      }
    ];

    for (const candidate of candidates) {
      const resolved = this.navigation.resolveTarget(candidate);

      if (
        resolved &&
        [...this.units.values()].every(
          (unit) => distance(unit.position, resolved) >= MIN_UNIT_DISTANCE
        )
      ) {
        return resolved;
      }
    }

    return null;
  }

  private assignPath(unit: RuntimeUnit, target: Vector2): boolean {
    const resolvedTarget = this.navigation.resolveTarget(target);

    if (!resolvedTarget) {
      unit.destination = null;
      unit.waypoints = [];
      return false;
    }

    const path = this.navigation.findPath(unit.position, resolvedTarget);

    if (path.length === 0) {
      if (distance(unit.position, resolvedTarget) <= ARRIVAL_EPSILON) {
        unit.position = { ...resolvedTarget };
        unit.destination = null;
        unit.waypoints = [];
        return true;
      }

      unit.destination = null;
      unit.waypoints = [];
      return false;
    }

    unit.destination = { ...resolvedTarget };
    unit.waypoints = path.map((waypoint) => ({ ...waypoint }));
    return true;
  }

  private clearWorkTasks(unit: RuntimeUnit): void {
    unit.gatherTask = undefined;
    unit.buildTask = undefined;
    unit.attackTask = undefined;
  }

  private stopAttackTask(unit: RuntimeUnit): void {
    unit.attackTask = undefined;
    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "idle";
  }

  private createBuildingId(kind: string): string {
    let candidate = `${kind}-${this.nextBuildingSequence}`;

    while (this.buildings.has(candidate)) {
      this.nextBuildingSequence += 1;
      candidate = `${kind}-${this.nextBuildingSequence}`;
    }

    this.nextBuildingSequence += 1;
    return candidate;
  }

  private createUnitId(kind: UnitKind): string {
    let candidate = `${kind}-${this.nextUnitSequence}`;

    while (this.units.has(candidate)) {
      this.nextUnitSequence += 1;
      candidate = `${kind}-${this.nextUnitSequence}`;
    }

    this.nextUnitSequence += 1;
    return candidate;
  }

  private playerIds(): string[] {
    const ids = new Set<string>();

    for (const playerId of this.stockpiles.keys()) {
      ids.add(playerId);
    }

    for (const unit of this.units.values()) {
      ids.add(unit.ownerId);
    }

    for (const building of this.buildings.values()) {
      ids.add(building.ownerId);
    }

    for (const ai of this.aiPlayers) {
      ids.add(ai.playerId);
      ids.add(ai.enemyPlayerId);
    }

    return [...ids].sort();
  }

  private attackDamageFor(
    unit: RuntimeUnit,
    definition: UnitDefinition,
    targetKind?: UnitKind
  ): number {
    let damage = definition.attackDamage;

    if (targetKind) {
      damage +=
        definition.bonuses?.find(
          (bonus) => bonus.targetKind === targetKind
        )?.damage ?? 0;
    }

    damage += this.researchSystem.getAttackDamageBonus(unit.ownerId);

    return damage;
  }

  private ensureStockpile(playerId: string): ResourceStockpile {
    let stockpile = this.stockpiles.get(playerId);

    if (!stockpile) {
      stockpile = {
        wood: 0,
        food: 0,
        gold: 0
      };
      this.stockpiles.set(playerId, stockpile);
    }

    return stockpile;
  }

  private validateBuildingDefinition(definition: BuildingDefinition): void {
    if (
      !Number.isInteger(definition.footprint.width) ||
      definition.footprint.width <= 0 ||
      !Number.isInteger(definition.footprint.height) ||
      definition.footprint.height <= 0
    ) {
      throw new Error(`Invalid footprint for building: ${definition.kind}`);
    }

    if (
      !Number.isFinite(definition.buildTimeSeconds) ||
      definition.buildTimeSeconds <= 0
    ) {
      throw new Error(`Invalid build time for building: ${definition.kind}`);
    }
  }

  private validateUnitDefinition(definition: UnitDefinition): void {
    if (
      !Number.isFinite(definition.trainTimeSeconds) ||
      definition.trainTimeSeconds <= 0 ||
      !Number.isFinite(definition.maxHitPoints) ||
      definition.maxHitPoints <= 0 ||
      !Number.isFinite(definition.speed) ||
      definition.speed <= 0 ||
      !Number.isFinite(definition.attackCooldownSeconds) ||
      definition.attackCooldownSeconds <= 0 ||
      !Number.isFinite(definition.attackRange) ||
      definition.attackRange < 0 ||
      !Number.isFinite(definition.attackDamage) ||
      definition.attackDamage < 0 ||
      !Number.isFinite(definition.populationCost) ||
      definition.populationCost <= 0
    ) {
      throw new Error(`Invalid unit definition: ${definition.kind}`);
    }
  }

  private validateTechnologyDefinition(
    definition: TechnologyDefinition
  ): void {
    if (
      !Number.isFinite(definition.researchTimeSeconds) ||
      definition.researchTimeSeconds <= 0 ||
      !Number.isFinite(definition.attackDamageBonus)
    ) {
      throw new Error(
        `Invalid technology definition: ${definition.kind}`
      );
    }
  }

  private resolveUnitSeparation(): void {
    const units = [...this.units.values()];

    for (let iteration = 0; iteration < SEPARATION_ITERATIONS; iteration += 1) {
      const buckets = buildSpatialBuckets(units);

      for (let index = 0; index < units.length; index += 1) {
        const unit = units[index];

        if (!unit) {
          continue;
        }

        const cellX = Math.floor(unit.position.x);
        const cellY = Math.floor(unit.position.y);

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const bucket = buckets.get(
              `${cellX + offsetX},${cellY + offsetY}`
            );

            if (!bucket) {
              continue;
            }

            for (const otherIndex of bucket) {
              if (otherIndex <= index) {
                continue;
              }

              const other = units[otherIndex];

              if (!other) {
                continue;
              }

              separatePair(unit, other, this.navigation);
            }
          }
        }
      }
    }
  }
}

function buildSpatialBuckets(units: readonly RuntimeUnit[]): Map<string, number[]> {
  const buckets = new Map<string, number[]>();

  units.forEach((unit, index) => {
    const key = `${Math.floor(unit.position.x)},${Math.floor(unit.position.y)}`;
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.push(index);
    } else {
      buckets.set(key, [index]);
    }
  });

  return buckets;
}

function separatePair(
  a: RuntimeUnit,
  b: RuntimeUnit,
  navigation: GridNavigation
): void {
  let dx = b.position.x - a.position.x;
  let dy = b.position.y - a.position.y;
  let pairDistance = Math.hypot(dx, dy);

  if (pairDistance >= MIN_UNIT_DISTANCE) {
    return;
  }

  if (pairDistance <= ARRIVAL_EPSILON) {
    const direction = a.id < b.id ? -1 : 1;
    dx = direction;
    dy = 0;
    pairDistance = 1;
  }

  const overlap = MIN_UNIT_DISTANCE - pairDistance;
  const push = overlap * 0.5;
  const normalX = dx / pairDistance;
  const normalY = dy / pairDistance;

  const nextA = {
    x: a.position.x - normalX * push,
    y: a.position.y - normalY * push
  };
  const nextB = {
    x: b.position.x + normalX * push,
    y: b.position.y + normalY * push
  };

  if (navigation.isWalkablePoint(nextA)) {
    a.position = nextA;
  }

  if (navigation.isWalkablePoint(nextB)) {
    b.position = nextB;
  }
}

function buildingFootprintCells(
  building: Pick<BuildingState, "position">,
  definition: BuildingDefinition
): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];

  for (let y = 0; y < definition.footprint.height; y += 1) {
    for (let x = 0; x < definition.footprint.width; x += 1) {
      cells.push({
        x: building.position.x + x,
        y: building.position.y + y
      });
    }
  }

  return cells;
}

function buildingCenter(
  building: Pick<BuildingState, "position">,
  definition: BuildingDefinition
): Vector2 {
  return {
    x: building.position.x + definition.footprint.width / 2,
    y: building.position.y + definition.footprint.height / 2
  };
}

function distanceToBuilding(
  point: Vector2,
  building: BuildingState,
  definition: BuildingDefinition
): number {
  const minX = building.position.x;
  const minY = building.position.y;
  const maxX = minX + definition.footprint.width;
  const maxY = minY + definition.footprint.height;
  const nearestX = Math.min(Math.max(point.x, minX), maxX);
  const nearestY = Math.min(Math.max(point.y, minY), maxY);

  return distance(point, {
    x: nearestX,
    y: nearestY
  });
}

function spendResources(
  stockpile: ResourceStockpile,
  cost: ResourceStockpile
): void {
  stockpile.wood -= cost.wood;
  stockpile.food -= cost.food;
  stockpile.gold -= cost.gold;
}

function createFormationTargets(target: Vector2, count: number): Vector2[] {
  if (count <= 1) {
    return [{ ...target }];
  }

  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const width = (columns - 1) * FORMATION_SPACING;
  const height = (rows - 1) * FORMATION_SPACING;
  const targets: Vector2[] = [];

  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);

    targets.push({
      x: target.x + column * FORMATION_SPACING - width / 2,
      y: target.y + row * FORMATION_SPACING - height / 2
    });
  }

  return targets;
}

function cloneUnit(unit: UnitState): UnitState {
  return {
    id: unit.id,
    ownerId: unit.ownerId,
    kind: unit.kind,
    position: { ...unit.position },
    destination: unit.destination ? { ...unit.destination } : null,
    speed: unit.speed,
    hitPoints: unit.hitPoints,
    activity: unit.activity,
    cargo: unit.cargo ? { ...unit.cargo } : null
  };
}

function cloneResource(resource: ResourceNodeState): ResourceNodeState {
  return {
    id: resource.id,
    kind: resource.kind,
    position: { ...resource.position },
    amount: resource.amount
  };
}

function cloneDropOffPoint(
  dropOffPoint: DropOffPointState
): DropOffPointState {
  return {
    id: dropOffPoint.id,
    ownerId: dropOffPoint.ownerId,
    position: { ...dropOffPoint.position },
    accepts: dropOffPoint.accepts ? [...dropOffPoint.accepts] : undefined
  };
}

function cloneBuilding(building: BuildingState): BuildingState {
  return {
    ...building,
    position: { ...building.position },
    trainingQueue: building.trainingQueue.map((item) => ({ ...item })),
    researchQueue: building.researchQueue?.map((item) => ({ ...item })) ?? [],
    rallyPoint: building.rallyPoint ? { ...building.rallyPoint } : null
  };
}

function cloneBuildingDefinition(
  definition: BuildingDefinition
): BuildingDefinition {
  return {
    ...definition,
    footprint: { ...definition.footprint },
    cost: { ...definition.cost }
  };
}

function cloneUnitDefinition(definition: UnitDefinition): UnitDefinition {
  return {
    ...definition,
    cost: { ...definition.cost },
    bonuses: definition.bonuses?.map((bonus) => ({ ...bonus }))
  };
}

function cloneTechnologyDefinition(
  definition: TechnologyDefinition
): TechnologyDefinition {
  return {
    ...definition,
    cost: { ...definition.cost }
  };
}

function cloneCommand(command: GameCommand): GameCommand {
  switch (command.type) {
    case "move":
      return {
        ...command,
        unitIds: [...command.unitIds],
        target: { ...command.target }
      };
    case "gather":
      return {
        ...command,
        unitIds: [...command.unitIds]
      };
    case "build":
      return {
        ...command,
        unitIds: [...command.unitIds],
        position: { ...command.position }
      };
    case "train":
      return { ...command };
    case "research":
      return { ...command };
    case "set-rally-point":
      return {
        ...command,
        target: { ...command.target }
      };
    case "attack":
      return {
        ...command,
        unitIds: [...command.unitIds]
      };
    case "attack-building":
      return {
        ...command,
        unitIds: [...command.unitIds]
      };
  }
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
