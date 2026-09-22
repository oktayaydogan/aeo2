import { MIN_UNIT_DISTANCE } from "./MovementSystem";
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
const GATHER_RETENTION_RANGE = GATHER_RANGE + MIN_UNIT_DISTANCE;
const DROP_OFF_RANGE = 0.7;
const VILLAGER_CARRY_CAPACITY = 10;
const VILLAGER_GATHER_RATE = 4;

export type GatherPhase = "to-resource" | "gathering" | "to-dropoff";

export interface GatherTask {
  resourceId: string;
  phase: GatherPhase;
  dropOffPointId?: string;
}

export interface EconomyUnit extends UnitState {
  waypoints: Vector2[];
  gatherTask?: GatherTask;
}

export class EconomySystem<TUnit extends EconomyUnit> {
  constructor(
    private readonly tickRate: number,
    private readonly resources: Map<string, ResourceNodeState>,
    private readonly dropOffPoints: Map<string, DropOffPointState>,
    private readonly ensureStockpile: (playerId: string) => ResourceStockpile,
    private readonly assignPath: (unit: TUnit, target: Vector2) => boolean
  ) {}

  step(units: Iterable<TUnit>): void {
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
        this.processTravelToResource(unit, resource);
      } else if (task.phase === "gathering") {
        this.processGathering(unit, resource);
      } else {
        this.processReturnToDropOff(unit, resource);
      }
    }
  }

  routeVillagerToResource(unit: TUnit, resource: ResourceNodeState): void {
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

  beginReturnToDropOff(unit: TUnit, resourceKind: ResourceKind): void {
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

  stopGatherTask(unit: TUnit): void {
    unit.gatherTask = undefined;
    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "idle";
  }

  private processTravelToResource(
    unit: TUnit,
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
    unit: TUnit,
    resource: ResourceNodeState
  ): void {
    if (distance(unit.position, resource.position) > GATHER_RETENTION_RANGE) {
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
    unit: TUnit,
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
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
