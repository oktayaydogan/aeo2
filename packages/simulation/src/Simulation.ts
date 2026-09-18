import { GridNavigation } from "./GridNavigation";
import type {
  GameCommand,
  SimulationOptions,
  SimulationSnapshot,
  UnitState,
  Vector2
} from "./types";

export const DEFAULT_TICK_RATE = 20;
const DEFAULT_MAP_SIZE = 64;
const FORMATION_SPACING = 0.9;
const ARRIVAL_EPSILON = 0.000001;

interface RuntimeUnit extends UnitState {
  waypoints: Vector2[];
}

export class Simulation {
  readonly tickRate: number;
  readonly tickDurationMs: number;

  private tick = 0;
  private readonly navigation: GridNavigation;
  private readonly units = new Map<string, RuntimeUnit>();
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
    }
  }

  queueCommand(command: GameCommand): void {
    this.commandQueue.push(cloneCommand(command));
  }

  step(): void {
    this.applyQueuedCommands();
    this.moveUnits();
    this.tick += 1;
  }

  getSnapshot(): SimulationSnapshot {
    return {
      tick: this.tick,
      units: [...this.units.values()].map(cloneUnit)
    };
  }

  private applyQueuedCommands(): void {
    const commands = this.commandQueue.splice(0);

    for (const command of commands) {
      if (command.type === "move") {
        this.applyMoveCommand(command);
      }
    }
  }

  private applyMoveCommand(
    command: Extract<GameCommand, { type: "move" }>
  ): void {
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
      const requestedTarget = formationTargets[index] ?? command.target;
      const resolvedTarget = this.navigation.resolveTarget(requestedTarget);

      if (!resolvedTarget) {
        unit.destination = null;
        unit.waypoints = [];
        return;
      }

      const path = this.navigation.findPath(unit.position, resolvedTarget);

      if (path.length === 0) {
        unit.destination = null;
        unit.waypoints = [];
        return;
      }

      unit.destination = { ...resolvedTarget };
      unit.waypoints = path.map((waypoint) => ({ ...waypoint }));
    });
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
      }
    }
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
    position: { ...unit.position },
    destination: unit.destination ? { ...unit.destination } : null,
    speed: unit.speed
  };
}

function cloneCommand(command: GameCommand): GameCommand {
  return {
    ...command,
    unitIds: [...command.unitIds],
    target: { ...command.target }
  };
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
