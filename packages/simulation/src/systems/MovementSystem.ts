import { GridNavigation } from "../GridNavigation";
import type { UnitState, Vector2 } from "../types";

const ARRIVAL_EPSILON = 0.000001;
const FORMATION_SPACING = 0.72;
const UNIT_RADIUS = 0.26;
export const MIN_UNIT_DISTANCE = UNIT_RADIUS * 2;
const SEPARATION_ITERATIONS = 2;

export interface MovementUnit extends UnitState {
  waypoints: Vector2[];
  gatherTask?: unknown;
  buildTask?: unknown;
  attackTask?: unknown;
}

export class MovementSystem<TUnit extends MovementUnit> {
  constructor(
    private readonly tickRate: number,
    private readonly navigation: GridNavigation
  ) {}

  moveUnits(units: Iterable<TUnit>): void {
    const maxDistancePerTick = 1 / this.tickRate;

    for (const unit of units) {
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

  assignPath(unit: TUnit, target: Vector2): boolean {
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

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
