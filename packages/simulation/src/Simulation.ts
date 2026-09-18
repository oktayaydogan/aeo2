import { GridNavigation } from "./GridNavigation";
import type {
  DropOffPointState,
  GameCommand,
  GatherCommand,
  MoveCommand,
  PlayerStockpileState,
  ResourceKind,
  ResourceNodeState,
  ResourceStockpile,
  SimulationOptions,
  SimulationSnapshot,
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

type GatherPhase = "to-resource" | "gathering" | "to-dropoff";

interface GatherTask {
  resourceId: string;
  phase: GatherPhase;
  dropOffPointId?: string;
}

interface RuntimeUnit extends UnitState {
  waypoints: Vector2[];
  gatherTask?: GatherTask;
}

export class Simulation {
  readonly tickRate: number;
  readonly tickDurationMs: number;

  private tick = 0;
  private readonly navigation: GridNavigation;
  private readonly units = new Map<string, RuntimeUnit>();
  private readonly resources = new Map<string, ResourceNodeState>();
  private readonly dropOffPoints = new Map<string, DropOffPointState>();
  private readonly stockpiles = new Map<string, ResourceStockpile>();
  private readonly commandQueue: GameCommand[] = [];

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

    for (const unit of options.units ?? []) {
      if (this.units.has(unit.id)) {
        throw new Error(`Duplicate unit id: ${unit.id}`);
      }

      this.units.set(unit.id, {
        ...cloneUnit(unit),
        waypoints: []
      });
      this.ensureStockpile(unit.ownerId);
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
    this.moveUnits();
    this.processEconomy();
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
      )
    };
  }

  private applyQueuedCommands(): void {
    const commands = this.commandQueue.splice(0);

    for (const command of commands) {
      if (command.type === "move") {
        this.applyMoveCommand(command);
      } else if (command.type === "gather") {
        this.applyGatherCommand(command);
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
      unit.gatherTask = undefined;
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

        if (!unit.gatherTask && unit.activity === "moving") {
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

  private stopGatherTask(unit: RuntimeUnit): void {
    unit.gatherTask = undefined;
    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "idle";
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
            const bucket = buckets.get(`${cellX + offsetX},${cellY + offsetY}`);

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

function cloneCommand(command: GameCommand): GameCommand {
  if (command.type === "move") {
    return {
      ...command,
      unitIds: [...command.unitIds],
      target: { ...command.target }
    };
  }

  return {
    ...command,
    unitIds: [...command.unitIds]
  };
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
