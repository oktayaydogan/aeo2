import type { GridCell, GridMapDefinition, Vector2 } from "./types";

const SQRT_2 = Math.SQRT2;
const EPSILON = 0.000001;

const NEIGHBORS = [
  { x: 0, y: -1, cost: 1 },
  { x: 1, y: 0, cost: 1 },
  { x: 0, y: 1, cost: 1 },
  { x: -1, y: 0, cost: 1 },
  { x: 1, y: -1, cost: SQRT_2 },
  { x: 1, y: 1, cost: SQRT_2 },
  { x: -1, y: 1, cost: SQRT_2 },
  { x: -1, y: -1, cost: SQRT_2 }
] as const;

interface OpenNode extends GridCell {
  g: number;
  f: number;
}

export class GridNavigation {
  readonly width: number;
  readonly height: number;

  private readonly blocked = new Set<string>();
  private readonly dynamicBlocked = new Set<string>();
  private readonly elevation = new Map<string, number>();

  constructor(definition: GridMapDefinition) {
    if (!Number.isInteger(definition.width) || definition.width <= 0) {
      throw new Error("Grid map width must be a positive integer.");
    }

    if (!Number.isInteger(definition.height) || definition.height <= 0) {
      throw new Error("Grid map height must be a positive integer.");
    }

    this.width = definition.width;
    this.height = definition.height;

    for (const cell of definition.blocked ?? []) {
      if (!this.isInside(cell.x, cell.y)) {
        throw new Error(`Blocked cell is outside the map: ${cell.x},${cell.y}`);
      }

      this.blocked.add(cellKey(cell.x, cell.y));
    }

    for (const cell of definition.elevation ?? []) {
      if (
        !this.isInside(cell.x, cell.y) ||
        !Number.isInteger(cell.level) ||
        cell.level < 0
      ) {
        throw new Error(
          `Invalid elevation cell: ${cell.x},${cell.y},${cell.level}`
        );
      }

      if (cell.level > 0) {
        this.elevation.set(cellKey(cell.x, cell.y), cell.level);
      }
    }
  }

  elevationAt(point: Vector2): number {
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x >= this.width ||
      point.y >= this.height
    ) {
      return 0;
    }

    const cell = worldToCell(point);
    return this.elevation.get(cellKey(cell.x, cell.y)) ?? 0;
  }

  isWalkableCell(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      this.isInside(x, y) &&
      !this.blocked.has(cellKey(x, y)) &&
      !this.dynamicBlocked.has(cellKey(x, y))
    );
  }

  isWalkablePoint(point: Vector2): boolean {
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x >= this.width ||
      point.y >= this.height
    ) {
      return false;
    }

    const cell = worldToCell(point);
    return this.isWalkableCell(cell.x, cell.y);
  }

  blockCells(cells: readonly GridCell[]): void {
    for (const cell of cells) {
      if (!this.isInside(cell.x, cell.y)) {
        throw new Error(`Dynamic blocked cell is outside the map: ${cell.x},${cell.y}`);
      }

      this.dynamicBlocked.add(cellKey(cell.x, cell.y));
    }
  }

  unblockCells(cells: readonly GridCell[]): void {
    for (const cell of cells) {
      this.dynamicBlocked.delete(cellKey(cell.x, cell.y));
    }
  }

  resolveTarget(target: Vector2): Vector2 | null {
    const clamped = this.clampWorldPoint(target);
    const requestedCell = worldToCell(clamped);

    if (this.isWalkableCell(requestedCell.x, requestedCell.y)) {
      return clamped;
    }

    const maxRadius = Math.max(this.width, this.height);

    for (let radius = 1; radius <= maxRadius; radius += 1) {
      let best: GridCell | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let y = requestedCell.y - radius; y <= requestedCell.y + radius; y += 1) {
        for (let x = requestedCell.x - radius; x <= requestedCell.x + radius; x += 1) {
          const onRing =
            Math.abs(x - requestedCell.x) === radius ||
            Math.abs(y - requestedCell.y) === radius;

          if (!onRing || !this.isWalkableCell(x, y)) {
            continue;
          }

          const center = cellCenter({ x, y });
          const distance = squaredDistance(center, clamped);

          if (
            distance < bestDistance ||
            (Math.abs(distance - bestDistance) <= EPSILON &&
              best !== null &&
              (y < best.y || (y === best.y && x < best.x)))
          ) {
            best = { x, y };
            bestDistance = distance;
          }
        }
      }

      if (best) {
        return cellCenter(best);
      }
    }

    return null;
  }

  findPath(start: Vector2, target: Vector2): Vector2[] {
    const resolvedTarget = this.resolveTarget(target);

    if (!resolvedTarget) {
      return [];
    }

    const startPoint = this.clampWorldPoint(start);
    const startCell = worldToCell(startPoint);
    const targetCell = worldToCell(resolvedTarget);

    if (!this.isWalkableCell(startCell.x, startCell.y)) {
      return [];
    }

    if (startCell.x === targetCell.x && startCell.y === targetCell.y) {
      return distance(startPoint, resolvedTarget) <= EPSILON ? [] : [resolvedTarget];
    }

    const startKey = cellKey(startCell.x, startCell.y);
    const targetKey = cellKey(targetCell.x, targetCell.y);
    const open = new Map<string, OpenNode>();
    const closed = new Set<string>();
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>([[startKey, 0]]);

    open.set(startKey, {
      ...startCell,
      g: 0,
      f: octileDistance(startCell, targetCell)
    });

    while (open.size > 0) {
      const current = lowestCostNode(open);
      const currentKey = cellKey(current.x, current.y);

      if (currentKey === targetKey) {
        return this.reconstructPath(
          cameFrom,
          startKey,
          targetKey,
          resolvedTarget
        );
      }

      open.delete(currentKey);
      closed.add(currentKey);

      for (const neighbor of NEIGHBORS) {
        const nextX = current.x + neighbor.x;
        const nextY = current.y + neighbor.y;
        const nextKey = cellKey(nextX, nextY);

        if (
          !this.isWalkableCell(nextX, nextY) ||
          closed.has(nextKey) ||
          !this.canTraverseDiagonal(current, neighbor)
        ) {
          continue;
        }

        const tentativeG = current.g + neighbor.cost;
        const knownG = gScore.get(nextKey) ?? Number.POSITIVE_INFINITY;

        if (tentativeG >= knownG) {
          continue;
        }

        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentativeG);

        open.set(nextKey, {
          x: nextX,
          y: nextY,
          g: tentativeG,
          f: tentativeG + octileDistance({ x: nextX, y: nextY }, targetCell)
        });
      }
    }

    return [];
  }

  private clampWorldPoint(point: Vector2): Vector2 {
    return {
      x: Math.min(Math.max(point.x, 0), this.width - EPSILON),
      y: Math.min(Math.max(point.y, 0), this.height - EPSILON)
    };
  }

  private isInside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private canTraverseDiagonal(
    from: GridCell,
    offset: { x: number; y: number }
  ): boolean {
    if (offset.x === 0 || offset.y === 0) {
      return true;
    }

    return (
      this.isWalkableCell(from.x + offset.x, from.y) &&
      this.isWalkableCell(from.x, from.y + offset.y)
    );
  }

  private reconstructPath(
    cameFrom: Map<string, string>,
    startKey: string,
    targetKey: string,
    resolvedTarget: Vector2
  ): Vector2[] {
    const reversed: string[] = [targetKey];
    let currentKey = targetKey;

    while (currentKey !== startKey) {
      const previous = cameFrom.get(currentKey);

      if (!previous) {
        return [];
      }

      reversed.push(previous);
      currentKey = previous;
    }

    reversed.reverse();

    const waypoints = reversed
      .slice(1)
      .map(parseCellKey)
      .map(cellCenter);

    if (waypoints.length > 0) {
      waypoints[waypoints.length - 1] = { ...resolvedTarget };
    }

    return waypoints;
  }
}

function lowestCostNode(open: Map<string, OpenNode>): OpenNode {
  let best: OpenNode | undefined;

  for (const node of open.values()) {
    if (
      !best ||
      node.f < best.f ||
      (node.f === best.f && node.g < best.g) ||
      (node.f === best.f &&
        node.g === best.g &&
        (node.y < best.y || (node.y === best.y && node.x < best.x)))
    ) {
      best = node;
    }
  }

  if (!best) {
    throw new Error("Cannot select a node from an empty A* open set.");
  }

  return best;
}

function octileDistance(a: GridCell, b: GridCell): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const diagonal = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonal;

  return diagonal * SQRT_2 + straight;
}

function worldToCell(point: Vector2): GridCell {
  return {
    x: Math.floor(point.x),
    y: Math.floor(point.y)
  };
}

function cellCenter(cell: GridCell): Vector2 {
  return {
    x: cell.x + 0.5,
    y: cell.y + 0.5
  };
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parseCellKey(key: string): GridCell {
  const [x, y] = key.split(",");

  return {
    x: Number(x),
    y: Number(y)
  };
}

function squaredDistance(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function distance(a: Vector2, b: Vector2): number {
  return Math.sqrt(squaredDistance(a, b));
}
