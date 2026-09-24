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
const AUTO_RETARGET_RANGE = 3.5;

export type GatherPhase = "to-resource" | "gathering" | "to-dropoff";

export interface GatherTask {
  resourceId: string;
  phase: GatherPhase;
  gatherTarget?: Vector2;
  dropOffPointId?: string;
  dropOffTarget?: Vector2;
}

export interface EconomyUnit extends UnitState {
  waypoints: Vector2[];
  gatherTask?: GatherTask;
}

export class EconomySystem<TUnit extends EconomyUnit> {
  private readonly depletedResourceIds = new Set<string>();

  constructor(
    private readonly tickRate: number,
    private readonly resources: Map<string, ResourceNodeState>,
    private readonly dropOffPoints: Map<string, DropOffPointState>,
    private readonly ensureStockpile: (playerId: string) => ResourceStockpile,
    private readonly assignPath: (unit: TUnit, target: Vector2) => boolean,
    private readonly resolveDropOffTarget: (
      unit: TUnit,
      point: DropOffPointState
    ) => Vector2 | null = (_unit, point) => ({ ...point.position }),
    private readonly resolveResourceTarget: (
      unit: TUnit,
      resource: ResourceNodeState
    ) => Vector2 | null = (_unit, resource) => ({ ...resource.position }),
    private readonly onResourceDepleted: (
      resource: ResourceNodeState
    ) => void = () => {}
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

    const gatherTarget = this.resolveResourceTarget(unit, resource);

    if (!gatherTarget) {
      this.stopGatherTask(unit);
      return;
    }

    task.resourceId = resource.id;
    task.phase = "to-resource";
    task.gatherTarget = { ...gatherTarget };
    task.dropOffPointId = undefined;
    task.dropOffTarget = undefined;
    unit.activity = "moving";

    if (distance(unit.position, gatherTarget) <= GATHER_RANGE) {
      unit.waypoints = [];
      unit.destination = null;
      task.phase = "gathering";
      unit.activity = "gathering";
      return;
    }

    if (!this.assignPath(unit, gatherTarget)) {
      this.stopGatherTask(unit);
    }
  }

  beginReturnToDropOff(unit: TUnit, resourceKind: ResourceKind): void {
    const task = unit.gatherTask;

    if (!task || !unit.cargo || unit.cargo.amount <= ARRIVAL_EPSILON) {
      this.stopGatherTask(unit);
      return;
    }

    const dropOff = this.findNearestDropOffTarget(unit, resourceKind);

    if (!dropOff) {
      this.stopGatherTask(unit);
      return;
    }

    task.phase = "to-dropoff";
    task.dropOffPointId = dropOff.point.id;
    task.dropOffTarget = { ...dropOff.target };
    unit.activity = "returning";

    if (distance(unit.position, dropOff.target) <= DROP_OFF_RANGE) {
      unit.waypoints = [];
      unit.destination = null;
      return;
    }

    if (!this.assignPath(unit, dropOff.target)) {
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
      this.notifyResourceDepleted(resource);

      if (unit.cargo && unit.cargo.amount > ARRIVAL_EPSILON) {
        this.beginReturnToDropOff(unit, resource.kind);
      } else if (!this.retargetNearbyResource(unit, resource)) {
        this.stopGatherTask(unit);
      }
      return;
    }

    const gatherTarget =
      unit.gatherTask?.gatherTarget ??
      this.resolveResourceTarget(unit, resource);

    if (!gatherTarget) {
      this.stopGatherTask(unit);
      return;
    }

    if (unit.gatherTask) {
      unit.gatherTask.gatherTarget = { ...gatherTarget };
    }

    if (distance(unit.position, gatherTarget) <= GATHER_RANGE) {
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
    const gatherTarget =
      unit.gatherTask?.gatherTarget ??
      this.resolveResourceTarget(unit, resource);

    if (
      !gatherTarget ||
      distance(unit.position, gatherTarget) > GATHER_RETENTION_RANGE
    ) {
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

    if (resource.amount <= ARRIVAL_EPSILON) {
      this.notifyResourceDepleted(resource);
    }

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

    const dropOffTarget =
      task.dropOffTarget ?? this.resolveDropOffTarget(unit, dropOffPoint);

    if (!dropOffTarget) {
      this.beginReturnToDropOff(unit, resource.kind);
      return;
    }

    task.dropOffTarget = { ...dropOffTarget };

    if (distance(unit.position, dropOffTarget) > DROP_OFF_RANGE) {
      if (
        unit.waypoints.length === 0 &&
        !this.assignPath(unit, dropOffTarget)
      ) {
        this.beginReturnToDropOff(unit, resource.kind);
      }
      return;
    }

    if (unit.cargo && unit.cargo.amount > ARRIVAL_EPSILON) {
      const stockpile = this.ensureStockpile(unit.ownerId);
      stockpile[unit.cargo.kind] += unit.cargo.amount;
      unit.cargo = null;
    }

    task.dropOffPointId = undefined;
    task.dropOffTarget = undefined;

    if (resource.amount > ARRIVAL_EPSILON) {
      task.phase = "to-resource";
      this.routeVillagerToResource(unit, resource);
    } else if (!this.retargetNearbyResource(unit, resource)) {
      this.stopGatherTask(unit);
    }
  }

  private retargetNearbyResource(
    unit: TUnit,
    depletedResource: ResourceNodeState
  ): boolean {
    const next = [...this.resources.values()]
      .filter(
        (resource) =>
          resource.id !== depletedResource.id &&
          resource.kind === depletedResource.kind &&
          resource.amount > ARRIVAL_EPSILON &&
          distance(resource.position, depletedResource.position) <=
            AUTO_RETARGET_RANGE
      )
      .map((resource) => ({
        resource,
        target: this.resolveResourceTarget(unit, resource)
      }))
      .filter(
        (
          entry
        ): entry is { resource: ResourceNodeState; target: Vector2 } =>
          entry.target !== null
      )
      .sort(
        (a, b) =>
          distance(depletedResource.position, a.resource.position) -
            distance(depletedResource.position, b.resource.position) ||
          a.resource.id.localeCompare(b.resource.id)
      )[0];

    if (!next || !unit.gatherTask) {
      return false;
    }

    unit.gatherTask.resourceId = next.resource.id;
    unit.gatherTask.gatherTarget = { ...next.target };
    this.routeVillagerToResource(unit, next.resource);
    return Boolean(unit.gatherTask);
  }

  private notifyResourceDepleted(resource: ResourceNodeState): void {
    if (this.depletedResourceIds.has(resource.id)) {
      return;
    }

    this.depletedResourceIds.add(resource.id);
    this.onResourceDepleted(resource);
  }

  private findNearestDropOffTarget(
    unit: TUnit,
    resourceKind: ResourceKind
  ): { point: DropOffPointState; target: Vector2 } | undefined {
    return [...this.dropOffPoints.values()]
      .filter(
        (point) =>
          point.ownerId === unit.ownerId &&
          (!point.accepts || point.accepts.includes(resourceKind))
      )
      .map((point) => ({
        point,
        target: this.resolveDropOffTarget(unit, point)
      }))
      .filter(
        (
          entry
        ): entry is { point: DropOffPointState; target: Vector2 } =>
          entry.target !== null
      )
      .sort(
        (a, b) =>
          distance(unit.position, a.target) -
            distance(unit.position, b.target) ||
          a.point.id.localeCompare(b.point.id)
      )[0];
  }
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
