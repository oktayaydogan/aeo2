import { selectOwnedVillagers } from "../commands/commandValidation";
import type {
  DropOffPointState,
  ResourceKind,
  ResourceNodeState,
  ResourceStockpile,
  UnitState,
  Vector2
} from "../types";

const ARRIVAL_EPSILON = 0.000001;
const GATHER_RANGE = 0.48;
const DROP_OFF_RANGE = 0.7;
const VILLAGER_CARRY_CAPACITY = 10;
const VILLAGER_GATHER_RATE = 4;

type GatherPhase = "to-resource" | "gathering" | "to-dropoff";

export interface GatherTask {
  resourceId: string;
  phase: GatherPhase;
  dropOffPointId?: string;
}

export interface EconomyUnit extends UnitState {
  waypoints: Vector2[];
  gatherTask?: GatherTask;
  buildTask?: unknown;
  attackTask?: unknown;
}

export interface EconomyPathing {
  assignPath(unit: EconomyUnit, target: Vector2): boolean;
}

export class EconomySystem {
  constructor(
    private readonly tickRate: number,
    private readonly resources: ReadonlyMap<string, ResourceNodeState>,
    private readonly dropOffPoints: ReadonlyMap<string, DropOffPointState>,
    private readonly stockpiles: Map<string, ResourceStockpile>
  ) {}

  startGather(
    playerId: string,
    unitIds: readonly string[],
    resourceId: string,
    units: ReadonlyMap<string, EconomyUnit>,
    pathing: EconomyPathing
  ): void {
    const resource = this.resources.get(resourceId);

    if (!resource || resource.amount <= ARRIVAL_EPSILON) {
      return;
    }

    for (const unit of selectOwnedVillagers(unitIds, playerId, units)) {
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
        this.beginReturnToDropOff(unit, unit.cargo.kind, pathing);
        continue;
      }

      this.routeVillagerToResource(unit, resource, pathing);
    }
  }

  step(units: Iterable<EconomyUnit>, pathing: EconomyPathing): void {
    for (const unit of units) {
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
        this.processTravelToResource(unit, resource, pathing);
      } else if (task.phase === "gathering") {
        this.processGathering(unit, resource, pathing);
      } else {
        this.processReturnToDropOff(unit, resource, pathing);
      }
    }
  }

  stopGatherTask(unit: EconomyUnit): void {
    unit.gatherTask = undefined;
    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "idle";
  }

  private processTravelToResource(
    unit: EconomyUnit,
    resource: ResourceNodeState,
    pathing: EconomyPathing
  ): void {
    if (resource.amount <= ARRIVAL_EPSILON) {
      if (unit.cargo && unit.cargo.amount > ARRIVAL_EPSILON) {
        this.beginReturnToDropOff(unit, resource.kind, pathing);
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
      this.routeVillagerToResource(unit, resource, pathing);
    }
  }

  private processGathering(
    unit: EconomyUnit,
    resource: ResourceNodeState,
    pathing: EconomyPathing
  ): void {
    if (distance(unit.position, resource.position) > GATHER_RANGE * 1.5) {
      this.routeVillagerToResource(unit, resource, pathing);
      return;
    }

    const existingCargoAmount =
      unit.cargo?.kind === resource.kind ? unit.cargo.amount : 0;
    const remainingCapacity = Math.max(
      VILLAGER_CARRY_CAPACITY - existingCargoAmount,
      0
    );

    if (remainingCapacity <= ARRIVAL_EPSILON) {
      this.beginReturnToDropOff(unit, resource.kind, pathing);
      return;
    }

    if (resource.amount <= ARRIVAL_EPSILON) {
      if (existingCargoAmount > ARRIVAL_EPSILON) {
        this.beginReturnToDropOff(unit, resource.kind, pathing);
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
      this.beginReturnToDropOff(unit, resource.kind, pathing);
    }
  }

  private processReturnToDropOff(
    unit: EconomyUnit,
    resource: ResourceNodeState,
    pathing: EconomyPathing
  ): void {
    const task = unit.gatherTask;

    if (!task) {
      return;
    }

    const dropOffPoint = task.dropOffPointId
      ? this.dropOffPoints.get(task.dropOffPointId)
      : undefined;

    if (!dropOffPoint) {
      this.beginReturnToDropOff(unit, resource.kind, pathing);
      return;
    }

    if (distance(unit.position, dropOffPoint.position) > DROP_OFF_RANGE) {
      if (unit.waypoints.length === 0) {
        pathing.assignPath(unit, dropOffPoint.position);
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
      this.routeVillagerToResource(unit, resource, pathing);
    } else {
      this.stopGatherTask(unit);
    }
  }

  private routeVillagerToResource(
    unit: EconomyUnit,
    resource: ResourceNodeState,
    pathing: EconomyPathing
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

    if (!pathing.assignPath(unit, resource.position)) {
      this.stopGatherTask(unit);
    }
  }

  private beginReturnToDropOff(
    unit: EconomyUnit,
    resourceKind: ResourceKind,
    pathing: EconomyPathing
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

    if (!pathing.assignPath(unit, dropOffPoint.position)) {
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

  private ensureStockpile(playerId: string): ResourceStockpile {
    let stockpile = this.stockpiles.get(playerId);

    if (!stockpile) {
      stockpile = { wood: 0, food: 0, gold: 0 };
      this.stockpiles.set(playerId, stockpile);
    }

    return stockpile;
  }
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
