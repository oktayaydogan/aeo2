import { GridNavigation } from "./GridNavigation";
import { ProductionSystem } from "./systems/ProductionSystem";
import { AiSystem } from "./systems/AiSystem";
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
  CombatSystem,
  type AttackTask
} from "./systems/CombatSystem";
import {
  MIN_UNIT_DISTANCE,
  MovementSystem
} from "./systems/MovementSystem";
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
const ARRIVAL_EPSILON = 0.000001;

type UnitActionCommand =
  | MoveCommand
  | GatherCommand
  | BuildCommand
  | AttackCommand
  | AttackBuildingCommand;

interface QueuedUnitOrder {
  groupId: number;
  command: UnitActionCommand;
}

interface RuntimeUnit extends UnitState {
  waypoints: Vector2[];
  gatherTask?: GatherTask;
  buildTask?: BuildTask;
  attackTask?: AttackTask;
  attackCooldownTicks: number;
  queuedOrders: QueuedUnitOrder[];
}

export class Simulation {
  readonly tickRate: number;
  readonly tickDurationMs: number;

  private tick = 0;
  private nextBuildingSequence = 1;
  private nextUnitSequence = 1;
  private nextOrderGroupSequence = 1;
  private readonly navigation: GridNavigation;
  private readonly movementSystem: MovementSystem<RuntimeUnit>;
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
  private readonly combatSystem: CombatSystem<RuntimeUnit>;
  private readonly buildings = new Map<string, BuildingState>();
  private readonly aiSystem: AiSystem<RuntimeUnit>;
  private readonly matchState: MatchState = {
    status: "playing",
    winnerPlayerId: null,
    loserPlayerId: null,
    reason: null
  };
  private readonly commandQueue: GameCommand[] = [];
  private readonly queuedOrderGroups = new Map<number, Set<string>>();

  constructor(options: SimulationOptions = {}) {
    this.tickRate = options.tickRate ?? DEFAULT_TICK_RATE;

    if (!Number.isFinite(this.tickRate) || this.tickRate <= 0) {
      throw new Error("tickRate must be a positive finite number.");
    }

    this.tickDurationMs = 1000 / this.tickRate;
    this.navigation = new GridNavigation(
      options.map ?? {
        width: DEFAULT_MAP_SIZE,
        height: DEFAULT_MAP_SIZE
      }
    );
    this.movementSystem = new MovementSystem(this.tickRate, this.navigation);
    this.economySystem = new EconomySystem(
      this.tickRate,
      this.resources,
      this.dropOffPoints,
      (playerId) => this.ensureStockpile(playerId),
      (unit, target) => this.movementSystem.assignPath(unit, target)
    );
    this.constructionSystem = new ConstructionSystem(
      this.tickRate,
      this.navigation,
      this.buildings,
      this.buildingDefinitions,
      this.resources,
      this.units,
      (unit, target) => this.movementSystem.assignPath(unit, target)
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
    this.combatSystem = new CombatSystem(
      this.tickRate,
      this.units,
      this.buildings,
      this.unitDefinitions,
      this.buildingDefinitions,
      this.matchState,
      this.navigation,
      (playerId) => this.researchSystem.getAttackDamageBonus(playerId),
      (unit, target) => this.movementSystem.assignPath(unit, target),
      (unit, definition, position) =>
        this.constructionSystem.findBuildApproachPosition(
          unit,
          definition,
          position
        ),
      (unit) => this.constructionSystem.stopBuildTask(unit)
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
        attackCooldownTicks: 0,
        queuedOrders: []
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

    this.aiSystem = new AiSystem({
      tickRate: this.tickRate,
      definitions: options.aiPlayers ?? [],
      units: this.units,
      buildings: this.buildings,
      resources: this.resources,
      unitDefinitions: this.unitDefinitions,
      buildingDefinitions: this.buildingDefinitions,
      technologyDefinitions: this.technologyDefinitions,
      calculatePopulation: (playerId) =>
        this.productionSystem.calculatePopulation(
          playerId,
          this.units.values(),
          this.buildings.values()
        ),
      getStockpile: (playerId) => this.ensureStockpile(playerId),
      hasTechnology: (playerId, technologyKind) =>
        this.researchSystem.hasTechnology(playerId, technologyKind),
      canPlaceBuilding: (definition, position) =>
        this.constructionSystem.canPlaceBuilding(definition, position),
      findBuildApproach: (unit, definition, position) =>
        this.constructionSystem.findBuildApproachPosition(
          unit,
          definition,
          position
        ),
      executeCommand: (command) => this.applyCommand(command)
    });
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
    this.advanceUnitOrderQueues();
    this.aiSystem.process(this.tick);
    this.movementSystem.moveUnits(this.units.values());
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
    this.combatSystem.step();
    this.movementSystem.resolveUnitSeparation(this.units.values());
    this.advanceUnitOrderQueues();
    this.tick += 1;
  }

  getSnapshot(): SimulationSnapshot {
    return {
      tick: this.tick,
      units: [...this.units.values()].map(cloneRuntimeUnit),
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
      aiPlayers: this.aiSystem.getStates(),
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
      this.applyCommand(command);
    }
  }

  private applyCommand(command: GameCommand): void {
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

  private applyMoveCommand(
    command: MoveCommand,
    fromQueue = false
  ): void {
    const controllableUnits = selectOwnedUnits(
      command.unitIds,
      command.playerId,
      this.units
    ).sort((a, b) => a.id.localeCompare(b.id));

    if (!fromQueue && command.queueMode === "append") {
      this.enqueueUnitOrderGroup(command, controllableUnits);
      return;
    }

    if (!fromQueue) {
      controllableUnits.forEach((unit) => this.clearQueuedOrders(unit));
    }

    const formationTargets = this.movementSystem.resolveFormationTargets(
      command.target,
      controllableUnits.length
    );

    const reservedTargetIndices = new Set<number>();

    controllableUnits.forEach((unit, index) => {
      this.clearWorkTasks(unit);
      unit.activity = "moving";

      const assignedTargetIndex = this.movementSystem.assignFormationPath(
        unit,
        formationTargets,
        index,
        reservedTargetIndices
      );

      if (assignedTargetIndex === null) {
        unit.activity = "idle";
        return;
      }

      reservedTargetIndices.add(assignedTargetIndex);
    });
  }

  private applyGatherCommand(
    command: GatherCommand,
    fromQueue = false
  ): void {
    const villagers = selectOwnedVillagers(
      command.unitIds,
      command.playerId,
      this.units
    );

    if (!fromQueue && command.queueMode === "append") {
      this.enqueueUnitOrderGroup(command, villagers);
      return;
    }

    const resource = this.resources.get(command.resourceId);

    if (!resource || resource.amount <= ARRIVAL_EPSILON) {
      return;
    }

    if (!fromQueue) {
      villagers.forEach((unit) => this.clearQueuedOrders(unit));
    }

    for (const unit of villagers) {
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

  private applyBuildCommand(
    command: BuildCommand,
    fromQueue = false
  ): void {
    const builders = selectOwnedVillagers(
      command.unitIds,
      command.playerId,
      this.units
    );

    if (!fromQueue && command.queueMode === "append") {
      this.enqueueUnitOrderGroup(command, builders);
      return;
    }

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

    const buildersWithTargets = builders.map((unit) => ({
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

    if (!fromQueue) {
      buildersWithTargets.forEach(({ unit }) =>
        this.clearQueuedOrders(unit)
      );
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

      if (!this.movementSystem.assignPath(unit, target)) {
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

  private applyAttackCommand(
    command: AttackCommand,
    fromQueue = false
  ): void {
    const attackers = selectCombatCapableUnits(
      command.unitIds,
      command.playerId,
      this.units,
      this.unitDefinitions
    );

    if (!fromQueue && command.queueMode === "append") {
      this.enqueueUnitOrderGroup(command, attackers);
      return;
    }

    const target = this.units.get(command.targetUnitId);

    if (!canAttackUnitTarget(target, command.playerId)) {
      return;
    }

    if (!fromQueue) {
      attackers.forEach((unit) => this.clearQueuedOrders(unit));
    }

    for (const unit of attackers) {
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
      this.combatSystem.routeAttackerToTarget(unit, target, definition);
    }
  }

  private applyAttackBuildingCommand(
    command: AttackBuildingCommand,
    fromQueue = false
  ): void {
    const attackers = selectCombatCapableUnits(
      command.unitIds,
      command.playerId,
      this.units,
      this.unitDefinitions
    );

    if (!fromQueue && command.queueMode === "append") {
      this.enqueueUnitOrderGroup(command, attackers);
      return;
    }

    const target = this.buildings.get(command.targetBuildingId);

    if (!canAttackBuildingTarget(target, command.playerId)) {
      return;
    }

    const targetDefinition = this.buildingDefinitions.get(target.kind);

    if (!targetDefinition) {
      return;
    }

    if (!fromQueue) {
      attackers.forEach((unit) => this.clearQueuedOrders(unit));
    }

    for (const unit of attackers) {
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
      this.combatSystem.routeAttackerToBuilding(
        unit,
        target,
        targetDefinition,
        definition
      );
    }
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
      attackCooldownTicks: 0,
      queuedOrders: []
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

    if (!this.movementSystem.assignPath(unit, target)) {
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

  private enqueueUnitOrderGroup(
    command: UnitActionCommand,
    units: readonly RuntimeUnit[]
  ): void {
    if (units.length === 0) {
      return;
    }

    const groupId = this.nextOrderGroupSequence;
    this.nextOrderGroupSequence += 1;
    const participants = new Set<string>();

    for (const unit of [...units].sort((a, b) => a.id.localeCompare(b.id))) {
      participants.add(unit.id);
      unit.queuedOrders.push({
        groupId,
        command: cloneUnitActionCommandForUnits(command, [unit.id])
      });
    }

    this.queuedOrderGroups.set(groupId, participants);
  }

  private clearQueuedOrders(unit: RuntimeUnit): void {
    for (const order of unit.queuedOrders) {
      const participants = this.queuedOrderGroups.get(order.groupId);

      if (!participants) {
        continue;
      }

      participants.delete(unit.id);

      if (participants.size === 0) {
        this.queuedOrderGroups.delete(order.groupId);
      }
    }

    unit.queuedOrders.splice(0);
  }

  private advanceUnitOrderQueues(): void {
    const groupIds = [...this.queuedOrderGroups.keys()].sort(
      (a, b) => a - b
    );

    for (const groupId of groupIds) {
      const participants = this.queuedOrderGroups.get(groupId);

      if (!participants) {
        continue;
      }

      for (const unitId of [...participants]) {
        if (!this.units.has(unitId)) {
          participants.delete(unitId);
        }
      }

      if (participants.size === 0) {
        this.queuedOrderGroups.delete(groupId);
        continue;
      }

      const units = [...participants]
        .map((unitId) => this.units.get(unitId))
        .filter((unit): unit is RuntimeUnit => unit !== undefined)
        .sort((a, b) => a.id.localeCompare(b.id));

      if (
        units.some(
          (unit) =>
            this.hasActiveUnitOrder(unit) ||
            unit.queuedOrders[0]?.groupId !== groupId
        )
      ) {
        continue;
      }

      const firstOrder = units[0]?.queuedOrders[0];

      if (!firstOrder) {
        this.queuedOrderGroups.delete(groupId);
        continue;
      }

      for (const unit of units) {
        unit.queuedOrders.shift();
      }

      this.queuedOrderGroups.delete(groupId);
      this.executeQueuedUnitActionCommand(
        cloneUnitActionCommandForUnits(
          firstOrder.command,
          units.map((unit) => unit.id)
        )
      );
    }
  }

  private executeQueuedUnitActionCommand(
    command: UnitActionCommand
  ): void {
    switch (command.type) {
      case "move":
        this.applyMoveCommand(command, true);
        break;
      case "gather":
        this.applyGatherCommand(command, true);
        break;
      case "build":
        this.applyBuildCommand(command, true);
        break;
      case "attack":
        this.applyAttackCommand(command, true);
        break;
      case "attack-building":
        this.applyAttackBuildingCommand(command, true);
        break;
    }
  }

  private hasActiveUnitOrder(unit: RuntimeUnit): boolean {
    return Boolean(
      unit.gatherTask ||
      unit.buildTask ||
      unit.attackTask ||
      unit.waypoints.length > 0 ||
      unit.destination ||
      unit.activity !== "idle"
    );
  }

  private clearWorkTasks(unit: RuntimeUnit): void {
    unit.gatherTask = undefined;
    unit.buildTask = undefined;
    unit.attackTask = undefined;
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

    for (const ai of this.aiSystem.getDefinitions()) {
      ids.add(ai.playerId);
      ids.add(ai.enemyPlayerId);
    }

    return [...ids].sort();
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

function spendResources(
  stockpile: ResourceStockpile,
  cost: ResourceStockpile
): void {
  stockpile.wood -= cost.wood;
  stockpile.food -= cost.food;
  stockpile.gold -= cost.gold;
}

function cloneRuntimeUnit(unit: RuntimeUnit): UnitState {
  return {
    ...cloneUnit(unit),
    orderQueue: unit.queuedOrders.map((order) => ({
      type: order.command.type
    }))
  };
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

function cloneUnitActionCommandForUnits(
  command: UnitActionCommand,
  unitIds: readonly string[]
): UnitActionCommand {
  switch (command.type) {
    case "move":
      return {
        ...command,
        unitIds: [...unitIds],
        target: { ...command.target },
        queueMode: "replace"
      };
    case "gather":
      return {
        ...command,
        unitIds: [...unitIds],
        queueMode: "replace"
      };
    case "build":
      return {
        ...command,
        unitIds: [...unitIds],
        position: { ...command.position },
        queueMode: "replace"
      };
    case "attack":
      return {
        ...command,
        unitIds: [...unitIds],
        queueMode: "replace"
      };
    case "attack-building":
      return {
        ...command,
        unitIds: [...unitIds],
        queueMode: "replace"
      };
  }
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
