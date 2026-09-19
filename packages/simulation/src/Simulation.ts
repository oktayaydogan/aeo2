import { GridNavigation } from "./GridNavigation";
import type {
  AiPlayerDefinition,
  AiPlayerState,
  AttackCommand,
  BuildCommand,
  BuildingDefinition,
  BuildingState,
  DropOffPointState,
  GameCommand,
  GatherCommand,
  MoveCommand,
  PlayerPopulationState,
  PlayerStockpileState,
  ResourceKind,
  ResourceNodeState,
  ResourceStockpile,
  SimulationOptions,
  SetRallyPointCommand,
  SimulationSnapshot,
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

const GATHER_RANGE = 0.48;
const DROP_OFF_RANGE = 0.7;
const VILLAGER_CARRY_CAPACITY = 10;
const VILLAGER_GATHER_RATE = 4;
const MAX_TRAINING_QUEUE = 5;

type GatherPhase = "to-resource" | "gathering" | "to-dropoff";

interface GatherTask {
  resourceId: string;
  phase: GatherPhase;
  dropOffPointId?: string;
}

interface BuildTask {
  buildingId: string;
  target: Vector2;
}

interface AttackTask {
  targetUnitId: string;
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
  private readonly buildings = new Map<string, BuildingState>();
  private readonly aiPlayers: readonly AiPlayerDefinition[];
  private readonly aiStates = new Map<string, AiPlayerState>();
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
    this.applyQueuedCommands();
    this.processAi();
    this.moveUnits();
    this.processEconomy();
    this.processConstruction();
    this.processTraining();
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
        this.calculatePopulation(playerId)
      ),
      aiPlayers: [...this.aiStates.values()].map((state) => ({ ...state })),
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
        case "set-rally-point":
          this.applySetRallyPointCommand(command);
          break;
        case "attack":
          this.applyAttackCommand(command);
          break;
      }
    }
  }

  private applyMoveCommand(command: MoveCommand): void {
    const controllableUnits = command.unitIds
      .map((unitId) => this.units.get(unitId))
      .filter(
        (unit): unit is RuntimeUnit =>
          unit !== undefined && unit.ownerId === command.playerId
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

    for (const unitId of command.unitIds) {
      const unit = this.units.get(unitId);

      if (
        !unit ||
        unit.ownerId !== command.playerId ||
        unit.kind !== "villager"
      ) {
        continue;
      }

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
        this.beginReturnToDropOff(unit, unit.cargo.kind);
        continue;
      }

      this.routeVillagerToResource(unit, resource);
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

    if (!this.canPlaceBuilding(definition, position)) {
      return;
    }

    const buildersWithTargets = command.unitIds
      .map((unitId) => this.units.get(unitId))
      .filter(
        (unit): unit is RuntimeUnit =>
          unit !== undefined &&
          unit.ownerId === command.playerId &&
          unit.kind === "villager"
      )
      .map((unit) => ({
        unit,
        target: this.findBuildApproachPosition(unit, definition, position)
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
    const building = this.buildings.get(command.buildingId);
    const definition = this.unitDefinitions.get(command.unitKind);

    if (
      !building ||
      building.ownerId !== command.playerId ||
      !building.completed ||
      !definition ||
      !this.canBuildingTrainUnit(building.kind, definition.kind) ||
      building.trainingQueue.length >= MAX_TRAINING_QUEUE
    ) {
      return;
    }

    const population = this.calculatePopulation(command.playerId);

    if (
      population.used +
        population.queued +
        definition.populationCost >
      population.cap
    ) {
      return;
    }

    const stockpile = this.ensureStockpile(command.playerId);

    if (!hasResources(stockpile, definition.cost)) {
      return;
    }

    spendResources(stockpile, definition.cost);
    building.trainingQueue.push({
      unitKind: definition.kind,
      progress: 0
    });
  }

  private applySetRallyPointCommand(command: SetRallyPointCommand): void {
    const building = this.buildings.get(command.buildingId);

    if (
      !building ||
      building.ownerId !== command.playerId ||
      !building.completed
    ) {
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

    if (!target || target.ownerId === command.playerId) {
      return;
    }

    for (const unitId of command.unitIds) {
      const unit = this.units.get(unitId);
      const definition = unit
        ? this.unitDefinitions.get(unit.kind)
        : undefined;

      if (
        !unit ||
        unit.ownerId !== command.playerId ||
        !definition ||
        definition.attackDamage <= 0
      ) {
        continue;
      }

      unit.gatherTask = undefined;
      unit.buildTask = undefined;
      unit.attackTask = {
        targetUnitId: target.id
      };
      unit.activity = "attacking";
      this.routeAttackerToTarget(unit, target, definition);
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

  private processEconomy(): void {
    for (const unit of this.units.values()) {
      const task = unit.gatherTask;

      if (!task || unit.kind !== "villager") {
        continue;
      }

      const resource = this.resources.get(task.resourceId);

      if (!resource) {
        this.stopGatherTask(unit);
        continue;
      }

      if (task.phase === "to-resource") {
        this.processTravelToResource(unit, resource);
      } else if (task.phase === "gathering") {
        this.processGathering(unit, resource);
      } else {
        this.processReturnToDropOff(unit, resource);
      }
    }
  }

  private processConstruction(): void {
    for (const unit of this.units.values()) {
      const task = unit.buildTask;

      if (!task || unit.kind !== "villager") {
        continue;
      }

      const building = this.buildings.get(task.buildingId);

      if (!building) {
        this.stopBuildTask(unit);
        continue;
      }

      if (building.completed) {
        this.stopBuildTask(unit);
        continue;
      }

      const definition = this.buildingDefinitions.get(building.kind);

      if (!definition) {
        this.stopBuildTask(unit);
        continue;
      }

      const target = task.target;

      if (distance(unit.position, target) > 0.35) {
        unit.activity = "moving";

        if (unit.waypoints.length === 0 && !this.assignPath(unit, target)) {
          this.stopBuildTask(unit);
        }

        continue;
      }

      unit.waypoints = [];
      unit.destination = null;
      unit.activity = "building";

      building.progress = Math.min(
        building.progress + 1 / (definition.buildTimeSeconds * this.tickRate),
        1
      );
      building.hitPoints = Math.max(
        1,
        Math.round(definition.maxHitPoints * building.progress)
      );

      if (building.progress >= 1 - ARRIVAL_EPSILON) {
        building.progress = 1;
        building.completed = true;
        building.hitPoints = definition.maxHitPoints;
      }
    }
  }

  private processTraining(): void {
    for (const building of this.buildings.values()) {
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
        item.progress + 1 / (definition.trainTimeSeconds * this.tickRate),
        1
      );

      if (item.progress < 1 - ARRIVAL_EPSILON) {
        continue;
      }

      const spawnPosition = this.findSpawnPosition(building);

      if (!spawnPosition) {
        item.progress = 1;
        continue;
      }

      const unitId = this.createUnitId(definition.kind);
      const spawnedUnit: RuntimeUnit = {
        id: unitId,
        ownerId: building.ownerId,
        kind: definition.kind,
        position: spawnPosition,
        destination: null,
        speed: definition.speed,
        hitPoints: definition.maxHitPoints,
        activity: "idle",
        cargo: null,
        waypoints: [],
        attackCooldownTicks: 0
      };

      this.units.set(unitId, spawnedUnit);
      building.trainingQueue.shift();

      if (building.rallyPoint) {
        spawnedUnit.activity = "moving";
        if (!this.assignPath(spawnedUnit, building.rallyPoint)) {
          spawnedUnit.activity = "idle";
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

      const enemyUnits = [...this.units.values()]
        .filter((unit) => unit.ownerId === ai.enemyPlayerId)
        .sort((a, b) => a.id.localeCompare(b.id));

      if (enemyUnits.length === 0) {
        if (state) {
          state.mode = "idle";
        }
        continue;
      }

      const attackers = [...this.units.values()]
        .filter((unit) => {
          if (unit.ownerId !== ai.playerId || unit.attackTask) {
            return false;
          }

          const definition = this.unitDefinitions.get(unit.kind);
          return Boolean(definition && definition.attackDamage > 0);
        })
        .sort((a, b) => a.id.localeCompare(b.id));

      if (attackers.length === 0) {
        if (state) {
          state.mode = "idle";
        }
        continue;
      }

      if (state) {
        state.mode = "attacking";
      }

      for (const attacker of attackers) {
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

        if (!target) {
          continue;
        }

        this.clearWorkTasks(attacker);
        attacker.attackTask = {
          targetUnitId: target.id
        };
        attacker.activity = "attacking";
        this.routeAttackerToTarget(attacker, target, definition);
      }
    }
  }

  private processCombat(): void {
    const deadUnitIds = new Set<string>();

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

      const target = this.units.get(task.targetUnitId);
      const definition = this.unitDefinitions.get(unit.kind);

      if (
        !target ||
        target.ownerId === unit.ownerId ||
        target.hitPoints <= 0 ||
        !definition ||
        definition.attackDamage <= 0
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

      target.hitPoints -= definition.attackDamage;
      unit.attackCooldownTicks = Math.max(
        1,
        Math.round(definition.attackCooldownSeconds * this.tickRate)
      );

      if (target.hitPoints <= 0) {
        deadUnitIds.add(target.id);
      }
    }

    if (deadUnitIds.size === 0) {
      return;
    }

    for (const unitId of deadUnitIds) {
      this.units.delete(unitId);
    }

    for (const unit of this.units.values()) {
      if (
        unit.attackTask &&
        deadUnitIds.has(unit.attackTask.targetUnitId)
      ) {
        this.stopAttackTask(unit);
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

  private processTravelToResource(
    unit: RuntimeUnit,
    resource: ResourceNodeState
  ): void {
    if (resource.amount <= ARRIVAL_EPSILON) {
      if (unit.cargo && unit.cargo.amount > ARRIVAL_EPSILON) {
        this.beginReturnToDropOff(unit, resource.kind);
      } else {
        this.stopGatherTask(unit);
      }
      return;
    }

    if (distance(unit.position, resource.position) <= GATHER_RANGE) {
      unit.waypoints = [];
      unit.destination = null;
      unit.activity = "gathering";

      if (unit.gatherTask) {
        unit.gatherTask.phase = "gathering";
      }
      return;
    }

    if (unit.waypoints.length === 0) {
      this.routeVillagerToResource(unit, resource);
    }
  }

  private processGathering(
    unit: RuntimeUnit,
    resource: ResourceNodeState
  ): void {
    if (distance(unit.position, resource.position) > GATHER_RANGE * 1.5) {
      this.routeVillagerToResource(unit, resource);
      return;
    }

    const existingCargoAmount =
      unit.cargo?.kind === resource.kind ? unit.cargo.amount : 0;

    const remainingCapacity = Math.max(
      VILLAGER_CARRY_CAPACITY - existingCargoAmount,
      0
    );

    if (remainingCapacity <= ARRIVAL_EPSILON) {
      this.beginReturnToDropOff(unit, resource.kind);
      return;
    }

    if (resource.amount <= ARRIVAL_EPSILON) {
      if (existingCargoAmount > ARRIVAL_EPSILON) {
        this.beginReturnToDropOff(unit, resource.kind);
      } else {
        this.stopGatherTask(unit);
      }
      return;
    }

    const gatheredAmount = Math.min(
      VILLAGER_GATHER_RATE / this.tickRate,
      resource.amount,
      remainingCapacity
    );

    if (gatheredAmount <= ARRIVAL_EPSILON) {
      return;
    }

    resource.amount = Math.max(resource.amount - gatheredAmount, 0);
    unit.cargo = {
      kind: resource.kind,
      amount: existingCargoAmount + gatheredAmount
    };

    if (
      unit.cargo.amount >= VILLAGER_CARRY_CAPACITY - ARRIVAL_EPSILON ||
      resource.amount <= ARRIVAL_EPSILON
    ) {
      this.beginReturnToDropOff(unit, resource.kind);
    }
  }

  private processReturnToDropOff(
    unit: RuntimeUnit,
    resource: ResourceNodeState
  ): void {
    const task = unit.gatherTask;

    if (!task) {
      return;
    }

    const dropOffPoint = task.dropOffPointId
      ? this.dropOffPoints.get(task.dropOffPointId)
      : undefined;

    if (!dropOffPoint) {
      this.beginReturnToDropOff(unit, resource.kind);
      return;
    }

    if (distance(unit.position, dropOffPoint.position) > DROP_OFF_RANGE) {
      if (unit.waypoints.length === 0) {
        this.assignPath(unit, dropOffPoint.position);
      }
      return;
    }

    if (unit.cargo && unit.cargo.amount > ARRIVAL_EPSILON) {
      const stockpile = this.ensureStockpile(unit.ownerId);
      stockpile[unit.cargo.kind] += unit.cargo.amount;
      unit.cargo = null;
    }

    task.dropOffPointId = undefined;

    if (resource.amount > ARRIVAL_EPSILON) {
      task.phase = "to-resource";
      this.routeVillagerToResource(unit, resource);
    } else {
      this.stopGatherTask(unit);
    }
  }

  private routeVillagerToResource(
    unit: RuntimeUnit,
    resource: ResourceNodeState
  ): void {
    const task = unit.gatherTask;

    if (!task) {
      return;
    }

    task.phase = "to-resource";
    task.dropOffPointId = undefined;
    unit.activity = "moving";

    if (distance(unit.position, resource.position) <= GATHER_RANGE) {
      unit.waypoints = [];
      unit.destination = null;
      task.phase = "gathering";
      unit.activity = "gathering";
      return;
    }

    if (!this.assignPath(unit, resource.position)) {
      this.stopGatherTask(unit);
    }
  }

  private beginReturnToDropOff(
    unit: RuntimeUnit,
    resourceKind: ResourceKind
  ): void {
    const task = unit.gatherTask;

    if (!task || !unit.cargo || unit.cargo.amount <= ARRIVAL_EPSILON) {
      this.stopGatherTask(unit);
      return;
    }

    const dropOffPoint = this.findNearestDropOffPoint(
      unit.ownerId,
      unit.position,
      resourceKind
    );

    if (!dropOffPoint) {
      this.stopGatherTask(unit);
      return;
    }

    task.phase = "to-dropoff";
    task.dropOffPointId = dropOffPoint.id;
    unit.activity = "returning";

    if (distance(unit.position, dropOffPoint.position) <= DROP_OFF_RANGE) {
      unit.waypoints = [];
      unit.destination = null;
      return;
    }

    if (!this.assignPath(unit, dropOffPoint.position)) {
      this.stopGatherTask(unit);
    }
  }

  private findNearestDropOffPoint(
    ownerId: string,
    position: Vector2,
    resourceKind: ResourceKind
  ): DropOffPointState | undefined {
    return [...this.dropOffPoints.values()]
      .filter(
        (point) =>
          point.ownerId === ownerId &&
          (!point.accepts || point.accepts.includes(resourceKind))
      )
      .sort(
        (a, b) =>
          distance(position, a.position) - distance(position, b.position) ||
          a.id.localeCompare(b.id)
      )[0];
  }

  private canPlaceBuilding(
    definition: BuildingDefinition,
    position: Vector2
  ): boolean {
    for (let y = 0; y < definition.footprint.height; y += 1) {
      for (let x = 0; x < definition.footprint.width; x += 1) {
        const cellX = position.x + x;
        const cellY = position.y + y;

        if (!this.navigation.isWalkableCell(cellX, cellY)) {
          return false;
        }

        if (
          [...this.buildings.values()].some((building) =>
            this.buildingContainsCell(building, cellX, cellY)
          )
        ) {
          return false;
        }

        if (
          [...this.resources.values()].some(
            (resource) =>
              Math.floor(resource.position.x) === cellX &&
              Math.floor(resource.position.y) === cellY &&
              resource.amount > ARRIVAL_EPSILON
          )
        ) {
          return false;
        }

        if (
          [...this.units.values()].some(
            (unit) =>
              Math.floor(unit.position.x) === cellX &&
              Math.floor(unit.position.y) === cellY
          )
        ) {
          return false;
        }
      }
    }

    return true;
  }

  private buildingContainsCell(
    building: BuildingState,
    cellX: number,
    cellY: number
  ): boolean {
    const definition = this.buildingDefinitions.get(building.kind);

    if (!definition) {
      return false;
    }

    return (
      cellX >= building.position.x &&
      cellY >= building.position.y &&
      cellX < building.position.x + definition.footprint.width &&
      cellY < building.position.y + definition.footprint.height
    );
  }

  private findBuildApproachPosition(
    unit: RuntimeUnit,
    definition: BuildingDefinition,
    position: Vector2
  ): Vector2 | null {
    const candidates: Vector2[] = [];

    for (let x = 0; x < definition.footprint.width; x += 1) {
      candidates.push(
        { x: position.x + x + 0.5, y: position.y - 0.5 },
        {
          x: position.x + x + 0.5,
          y: position.y + definition.footprint.height + 0.5
        }
      );
    }

    for (let y = 0; y < definition.footprint.height; y += 1) {
      candidates.push(
        { x: position.x - 0.5, y: position.y + y + 0.5 },
        {
          x: position.x + definition.footprint.width + 0.5,
          y: position.y + y + 0.5
        }
      );
    }

    const ordered = candidates
      .filter((candidate) => this.navigation.isWalkablePoint(candidate))
      .sort(
        (a, b) =>
          distance(unit.position, a) - distance(unit.position, b) ||
          a.y - b.y ||
          a.x - b.x
      );

    for (const candidate of ordered) {
      if (
        distance(unit.position, candidate) <= ARRIVAL_EPSILON ||
        this.navigation.findPath(unit.position, candidate).length > 0
      ) {
        return candidate;
      }
    }

    return null;
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

  private stopGatherTask(unit: RuntimeUnit): void {
    unit.gatherTask = undefined;
    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "idle";
  }

  private stopBuildTask(unit: RuntimeUnit): void {
    unit.buildTask = undefined;
    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "idle";
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

  private calculatePopulation(playerId: string): PlayerPopulationState {
    let used = 0;
    let queued = 0;
    let cap = 0;

    for (const unit of this.units.values()) {
      if (unit.ownerId !== playerId) {
        continue;
      }

      used += this.unitDefinitions.get(unit.kind)?.populationCost ?? 1;
    }

    for (const building of this.buildings.values()) {
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

  private canBuildingTrainUnit(
    buildingKind: BuildingState["kind"],
    unitKind: UnitKind
  ): boolean {
    return (
      (buildingKind === "town-center" && unitKind === "villager") ||
      (buildingKind === "barracks" && unitKind === "militia")
    );
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
  }
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
