import Phaser from "phaser";
import { BUILDING_DEFINITIONS } from "@aeo2/content";
import type {
  BuildingState,
  SimulationSnapshot,
  UnitState
} from "@aeo2/simulation";
import { gridToScreen, type IsometricProjection } from "../isometric";
import { FogOfWar, type VisibilityState } from "../visibility";

export interface FogRendererOptions {
  scene: Phaser.Scene;
  projection: IsometricProjection;
  mapSize: number;
  updateIntervalMs: number;
  benchmarkMode: boolean;
}

export class FogRenderer {
  private readonly fog: FogOfWar;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private elapsedMs = 0;

  constructor(private readonly options: FogRendererOptions) {
    this.fog = new FogOfWar(options.mapSize, options.mapSize);
    this.graphics = options.scene.add.graphics().setDepth(80_000);
  }

  update(delta: number, snapshot: SimulationSnapshot): void {
    if (this.options.benchmarkMode) {
      return;
    }

    this.elapsedMs += delta;

    if (
      this.elapsedMs < this.options.updateIntervalMs &&
      this.fog.exploredCellCount() > 0
    ) {
      return;
    }

    this.elapsedMs = 0;

    const unitSources = snapshot.units
      .filter((unit) => unit.ownerId === "player-1")
      .map((unit) => ({
        x: unit.position.x,
        y: unit.position.y,
        radius: unitVisionRadius(unit)
      }));

    const buildingSources = snapshot.buildings
      .filter(
        (building) =>
          building.ownerId === "player-1" && building.completed
      )
      .map((building) => {
        const definition = BUILDING_DEFINITIONS.find(
          (entry) => entry.kind === building.kind
        );

        return {
          x:
            building.position.x +
            (definition?.footprint.width ?? 1) / 2,
          y:
            building.position.y +
            (definition?.footprint.height ?? 1) / 2,
          radius: buildingVisionRadius(building)
        };
      });

    this.fog.update([...unitSources, ...buildingSources]);
    this.render();
  }

  stateAtCell(x: number, y: number): VisibilityState {
    return this.options.benchmarkMode
      ? "visible"
      : this.fog.stateAtCell(x, y);
  }

  stateAtPoint(x: number, y: number): VisibilityState {
    return this.options.benchmarkMode
      ? "visible"
      : this.fog.stateAtPoint(x, y);
  }

  isVisiblePoint(x: number, y: number): boolean {
    return this.options.benchmarkMode || this.fog.isVisiblePoint(x, y);
  }

  visibleCellCount(): number {
    return this.fog.visibleCellCount();
  }

  exploredCellCount(): number {
    return this.fog.exploredCellCount();
  }

  destroy(): void {
    this.graphics.destroy();
  }

  private render(): void {
    if (this.options.benchmarkMode) {
      return;
    }

    this.graphics.clear();

    for (let y = 0; y < this.options.mapSize; y += 1) {
      for (let x = 0; x < this.options.mapSize; x += 1) {
        const state = this.fog.stateAtCell(x, y);

        if (state === "visible") {
          continue;
        }

        const top = gridToScreen({ x, y }, this.options.projection);
        const right = gridToScreen({ x: x + 1, y }, this.options.projection);
        const bottom = gridToScreen(
          { x: x + 1, y: y + 1 },
          this.options.projection
        );
        const left = gridToScreen({ x, y: y + 1 }, this.options.projection);

        this.graphics.fillStyle(
          state === "unexplored" ? 0x020406 : 0x071017,
          state === "unexplored" ? 0.94 : 0.58
        );
        this.graphics.beginPath();
        this.graphics.moveTo(top.x, top.y);
        this.graphics.lineTo(right.x, right.y);
        this.graphics.lineTo(bottom.x, bottom.y);
        this.graphics.lineTo(left.x, left.y);
        this.graphics.closePath();
        this.graphics.fillPath();
      }
    }
  }
}

function unitVisionRadius(unit: UnitState): number {
  if (unit.kind === "archer") {
    return 6;
  }
  if (unit.kind === "spearman") {
    return 5.4;
  }
  return unit.kind === "militia" ? 5.2 : 4.4;
}

function buildingVisionRadius(building: BuildingState): number {
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
