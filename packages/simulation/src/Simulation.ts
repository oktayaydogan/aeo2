import type {
  GameCommand,
  SimulationOptions,
  SimulationSnapshot,
  UnitState
} from "./types";

export const DEFAULT_TICK_RATE = 20;

export class Simulation {
  readonly tickRate: number;
  readonly tickDurationMs: number;

  private tick = 0;
  private readonly units = new Map<string, UnitState>();
  private readonly commandQueue: GameCommand[] = [];

  constructor(options: SimulationOptions = {}) {
    this.tickRate = options.tickRate ?? DEFAULT_TICK_RATE;

    if (!Number.isFinite(this.tickRate) || this.tickRate <= 0) {
      throw new Error("tickRate must be a positive finite number.");
    }

    this.tickDurationMs = 1000 / this.tickRate;

    for (const unit of options.units ?? []) {
      if (this.units.has(unit.id)) {
        throw new Error(`Duplicate unit id: ${unit.id}`);
      }

      this.units.set(unit.id, cloneUnit(unit));
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
        for (const unitId of command.unitIds) {
          const unit = this.units.get(unitId);
          if (!unit || unit.ownerId !== command.playerId) continue;
          unit.destination = { ...command.target };
        }
      }
    }
  }

  private moveUnits(): void {
    const secondsPerTick = 1 / this.tickRate;

    for (const unit of this.units.values()) {
      if (!unit.destination) continue;

      const dx = unit.destination.x - unit.position.x;
      const dy = unit.destination.y - unit.position.y;
      const distance = Math.hypot(dx, dy);

      if (distance <= Number.EPSILON) {
        unit.position = { ...unit.destination };
        unit.destination = null;
        continue;
      }

      const maxDistance = unit.speed * secondsPerTick;

      if (distance <= maxDistance) {
        unit.position = { ...unit.destination };
        unit.destination = null;
        continue;
      }

      const scale = maxDistance / distance;
      unit.position.x += dx * scale;
      unit.position.y += dy * scale;
    }
  }
}

function cloneUnit(unit: UnitState): UnitState {
  return {
    ...unit,
    position: { ...unit.position },
    destination: unit.destination ? { ...unit.destination } : null
  };
}

function cloneCommand(command: GameCommand): GameCommand {
  return {
    ...command,
    unitIds: [...command.unitIds],
    target: { ...command.target }
  };
}
