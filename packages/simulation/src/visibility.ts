import type {
  BuildingState,
  UnitState
} from "./types";

export type VisibilityState = "unexplored" | "explored" | "visible";

export interface VisionSource {
  x: number;
  y: number;
  radius: number;
}

export class FogOfWar {
  readonly width: number;
  readonly height: number;

  private readonly explored = new Set<string>();
  private readonly visible = new Set<string>();

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error("Fog width must be a positive integer.");
    }

    if (!Number.isInteger(height) || height <= 0) {
      throw new Error("Fog height must be a positive integer.");
    }

    this.width = width;
    this.height = height;
  }

  update(sources: readonly VisionSource[]): void {
    this.visible.clear();

    for (const source of sources) {
      const minX = Math.max(0, Math.floor(source.x - source.radius));
      const maxX = Math.min(
        this.width - 1,
        Math.floor(source.x + source.radius)
      );
      const minY = Math.max(0, Math.floor(source.y - source.radius));
      const maxY = Math.min(
        this.height - 1,
        Math.floor(source.y + source.radius)
      );
      const radiusSquared = source.radius * source.radius;

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const centerX = x + 0.5;
          const centerY = y + 0.5;
          const dx = centerX - source.x;
          const dy = centerY - source.y;

          if (dx * dx + dy * dy > radiusSquared) {
            continue;
          }

          const key = cellKey(x, y);
          this.visible.add(key);
          this.explored.add(key);
        }
      }
    }
  }

  stateAtCell(x: number, y: number): VisibilityState {
    if (!this.isInside(x, y)) {
      return "unexplored";
    }

    const key = cellKey(x, y);

    if (this.visible.has(key)) {
      return "visible";
    }

    return this.explored.has(key) ? "explored" : "unexplored";
  }

  stateAtPoint(x: number, y: number): VisibilityState {
    return this.stateAtCell(Math.floor(x), Math.floor(y));
  }

  isVisiblePoint(x: number, y: number): boolean {
    return this.stateAtPoint(x, y) === "visible";
  }

  exploredCellCount(): number {
    return this.explored.size;
  }

  visibleCellCount(): number {
    return this.visible.size;
  }

  exploredCells(): readonly string[] {
    return [...this.explored].sort();
  }

  visibleCells(): readonly string[] {
    return [...this.visible].sort();
  }

  private isInside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
}

export function unitVisionRadius(unit: UnitState): number {
  if (unit.kind === "archer") {
    return 6;
  }

  if (unit.kind === "spearman") {
    return 5.4;
  }

  return unit.kind === "militia" ? 5.2 : 4.4;
}

export function buildingVisionRadius(building: BuildingState): number {
  if (building.kind === "town-center") {
    return 6.4;
  }

  if (
    building.kind === "barracks" ||
    building.kind === "archery-range"
  ) {
    return 4.6;
  }

  return 3.6;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}
