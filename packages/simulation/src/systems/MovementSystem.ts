import { GridNavigation } from "../GridNavigation";
import type { UnitState, Vector2 } from "../types";

const ARRIVAL_EPSILON = 0.000001;
const FORMATION_SPACING = 0.72;
const UNIT_RADIUS = 0.26;
export const MIN_UNIT_DISTANCE = UNIT_RADIUS * 2;
const SEPARATION_ITERATIONS = 2;
const RECOVERY_RETRY_INTERVAL_TICKS = 8;
const RECOVERY_RETRY_ATTEMPTS = 3;
const RECOVERY_STAGGER_BUCKETS = 4;

export interface MovementUnit extends UnitState {
  waypoints: Vector2[];
  gatherTask?: unknown;
  buildTask?: unknown;
  attackTask?: unknown;
}

interface MovementRecoveryState {
  destination: Vector2;
  attempts: number;
  nextRetryTick: number;
}

export interface MovementRecoveryDiagnostics {
  recoveryRepathAttempts: number;
  recoveredOrders: number;
  abandonedOrders: number;
  activeRecoveries: number;
}

export class MovementSystem<TUnit extends MovementUnit> {
  private movementTick = 0;
  private readonly recoveries = new Map<string, MovementRecoveryState>();
  private recoveryRepathAttempts = 0;
  private recoveredOrders = 0;
  private abandonedOrders = 0;
  constructor(
    private readonly tickRate: number,
    private readonly navigation: GridNavigation
  ) {}

  getRecoveryDiagnostics(): MovementRecoveryDiagnostics {
    return {
      recoveryRepathAttempts: this.recoveryRepathAttempts,
      recoveredOrders: this.recoveredOrders,
      abandonedOrders: this.abandonedOrders,
      activeRecoveries: this.recoveries.size
    };
  }

  cancelMovement(unitId: string): void {
    this.recoveries.delete(unitId);
  }

  resolveFormationTargets(target: Vector2, count: number): Vector2[] {
    return createReachableFormationTargets(target, count, this.navigation);
  }

  assignFormationPath(
    unit: TUnit,
    targets: readonly Vector2[],
    preferredIndex: number,
    reservedTargetIndices: ReadonlySet<number>,
    maxPathAttempts = 4
  ): number | null {
    if (targets.length === 0) {
      return null;
    }

    let pathAttempts = 0;

    for (let offset = 0; offset < targets.length; offset += 1) {
      const targetIndex = (preferredIndex + offset) % targets.length;

      if (reservedTargetIndices.has(targetIndex)) {
        continue;
      }

      const target = targets[targetIndex];

      if (!target) {
        continue;
      }

      pathAttempts += 1;

      if (this.assignPath(unit, target)) {
        return targetIndex;
      }

      if (pathAttempts >= maxPathAttempts) {
        break;
      }
    }

    return null;
  }

  moveUnits(units: Iterable<TUnit>): void {
    this.movementTick += 1;
    const maxDistancePerTick = 1 / this.tickRate;

    for (const unit of units) {
      this.processRecovery(unit);

      if (
        this.recoveries.has(unit.id) &&
        unit.waypoints.length === 0
      ) {
        continue;
      }

      let remainingDistance = unit.speed * maxDistancePerTick;

      while (remainingDistance > ARRIVAL_EPSILON && unit.waypoints.length > 0) {
        const waypoint = unit.waypoints[0];

        if (!waypoint) {
          break;
        }

        if (!this.navigation.isWalkablePoint(waypoint)) {
          const destination = unit.destination
            ? { ...unit.destination }
            : null;

          unit.waypoints = [];

          if (!destination) {
            unit.destination = null;
            break;
          }

          if (this.assignPath(unit, destination)) {
            continue;
          }

          if (this.canRecoverMovement(unit)) {
            this.scheduleRecovery(unit, destination);
          } else {
            unit.destination = null;
          }

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
        if (this.recoveries.has(unit.id)) {
          continue;
        }

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

  assignPath(unit: TUnit, target: Vector2): boolean {
    this.recoveries.delete(unit.id);
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

  private processRecovery(unit: TUnit): void {
    const recovery = this.recoveries.get(unit.id);

    if (!recovery || this.movementTick < recovery.nextRetryTick) {
      return;
    }

    this.recoveryRepathAttempts += 1;
    const destination = { ...recovery.destination };

    if (this.assignPath(unit, destination)) {
      this.recoveredOrders += 1;
      return;
    }

    const attempts = recovery.attempts + 1;

    if (attempts >= RECOVERY_RETRY_ATTEMPTS) {
      this.recoveries.delete(unit.id);
      this.abandonedOrders += 1;
      unit.destination = null;
      unit.waypoints = [];

      if (this.canRecoverMovement(unit)) {
        unit.activity = "idle";
      }
      return;
    }

    this.recoveries.set(unit.id, {
      destination,
      attempts,
      nextRetryTick:
        this.movementTick +
        RECOVERY_RETRY_INTERVAL_TICKS +
        deterministicRecoveryStagger(unit.id)
    });
    unit.destination = destination;
    unit.waypoints = [];
  }

  private scheduleRecovery(unit: TUnit, destination: Vector2): void {
    if (this.recoveries.has(unit.id)) {
      return;
    }

    this.recoveries.set(unit.id, {
      destination: { ...destination },
      attempts: 0,
      nextRetryTick:
        this.movementTick +
        RECOVERY_RETRY_INTERVAL_TICKS +
        deterministicRecoveryStagger(unit.id)
    });
    unit.destination = { ...destination };
    unit.waypoints = [];
    unit.activity = "moving";
  }

  private canRecoverMovement(unit: TUnit): boolean {
    return (
      unit.activity === "moving" &&
      !unit.gatherTask &&
      !unit.buildTask &&
      !unit.attackTask
    );
  }

  resolveUnitSeparation(units: Iterable<TUnit>): void {
    const unitList = [...units];

    for (let iteration = 0; iteration < SEPARATION_ITERATIONS; iteration += 1) {
      const buckets = buildSpatialBuckets(unitList);

      for (let index = 0; index < unitList.length; index += 1) {
        const unit = unitList[index];

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

              const other = unitList[otherIndex];

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

export function createReachableFormationTargets(
  target: Vector2,
  count: number,
  navigation: GridNavigation
): Vector2[] {
  if (count <= 0) {
    return [];
  }

  const targets: Vector2[] = [];
  const buckets = new Map<string, Vector2[]>();
  const maxRing = Math.max(
    4,
    Math.ceil(Math.sqrt(count)) * 4,
    navigation.width,
    navigation.height
  );

  for (let ring = 0; ring <= maxRing && targets.length < count; ring += 1) {
    for (const candidate of formationRingCandidates(target, ring)) {
      const resolved = navigation.resolveTarget(candidate);

      if (
        !resolved ||
        hasNearbyFormationTarget(resolved, buckets)
      ) {
        continue;
      }

      targets.push(resolved);
      addFormationTargetToBuckets(resolved, buckets);

      if (targets.length >= count) {
        break;
      }
    }
  }

  if (targets.length === 0) {
    const fallback = navigation.resolveTarget(target);
    return fallback ? [{ ...fallback }] : [];
  }

  // Extremely small/fragmented maps may not have enough physically distinct
  // walkable slots. Reuse valid slots deterministically rather than failing
  // the remaining units' move command.
  for (let index = targets.length; index < count; index += 1) {
    const fallback = targets[index % targets.length];

    if (fallback) {
      targets.push({ ...fallback });
    }
  }

  return targets;
}

export function createFormationTargets(
  target: Vector2,
  count: number
): Vector2[] {
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

function buildSpatialBuckets<TUnit extends MovementUnit>(
  units: readonly TUnit[]
): Map<string, number[]> {
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

function separatePair<TUnit extends MovementUnit>(
  a: TUnit,
  b: TUnit,
  navigation: GridNavigation
): void {
  // Units are not navigation obstacles. Applying hard separation while either
  // unit is following a path can cancel forward progress every tick when units
  // meet head-on or squeeze through the same narrow route. Let moving units
  // pass through each other and resolve any remaining overlap once both have
  // finished their current path.
  if (
    a.waypoints.length > 0 ||
    b.waypoints.length > 0 ||
    a.attackTask ||
    b.attackTask
  ) {
    return;
  }

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

function formationRingCandidates(
  target: Vector2,
  ring: number
): Vector2[] {
  if (ring === 0) {
    return [{ ...target }];
  }

  const candidates: Vector2[] = [];

  for (let y = -ring; y <= ring; y += 1) {
    for (let x = -ring; x <= ring; x += 1) {
      if (Math.max(Math.abs(x), Math.abs(y)) !== ring) {
        continue;
      }

      candidates.push({
        x: target.x + x * FORMATION_SPACING,
        y: target.y + y * FORMATION_SPACING
      });
    }
  }

  return candidates;
}

function hasNearbyFormationTarget(
  target: Vector2,
  buckets: Map<string, Vector2[]>
): boolean {
  const bucketX = Math.floor(target.x / MIN_UNIT_DISTANCE);
  const bucketY = Math.floor(target.y / MIN_UNIT_DISTANCE);

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const bucket = buckets.get(
        `${bucketX + offsetX},${bucketY + offsetY}`
      );

      if (!bucket) {
        continue;
      }

      if (
        bucket.some(
          (existing) =>
            distance(existing, target) < MIN_UNIT_DISTANCE - ARRIVAL_EPSILON
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function addFormationTargetToBuckets(
  target: Vector2,
  buckets: Map<string, Vector2[]>
): void {
  const key = `${Math.floor(target.x / MIN_UNIT_DISTANCE)},${Math.floor(
    target.y / MIN_UNIT_DISTANCE
  )}`;
  const bucket = buckets.get(key);

  if (bucket) {
    bucket.push(target);
  } else {
    buckets.set(key, [target]);
  }
}

function deterministicRecoveryStagger(unitId: string): number {
  let hash = 0;

  for (let index = 0; index < unitId.length; index += 1) {
    hash = (hash * 31 + unitId.charCodeAt(index)) >>> 0;
  }

  return hash % RECOVERY_STAGGER_BUCKETS;
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
