import Phaser from "phaser";
import type { ResourceNodeState, SimulationSnapshot } from "@aeo2/simulation";
import { fixedViewportTransform } from "../fixedViewport";
import { gridToScreen, screenToGrid, type IsometricProjection } from "../isometric";
import type { FogRenderer } from "../renderers/FogRenderer";

export interface MinimapAdapterOptions {
  scene: Phaser.Scene;
  projection: IsometricProjection;
  fogRenderer: FogRenderer;
  mapSize: number;
  size: number;
  margin: number;
  benchmarkMode: boolean;
}

export class MinimapAdapter {
  private readonly viewportContainer: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly hitArea: Phaser.GameObjects.Rectangle;

  constructor(private readonly options: MinimapAdapterOptions) {
    this.viewportContainer = options.scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(100_002);

    this.graphics = options.scene.add
      .graphics()
      .setScrollFactor(1)
      .setDepth(0);

    this.hitArea = options.scene.add
      .rectangle(0, 0, options.size, options.size, 0x000000, 0.001)
      .setScrollFactor(1)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });

    this.hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.centerCamera(pointer);
    });

    this.viewportContainer.add([
      this.graphics,
      this.hitArea
    ]);
    this.syncViewport();
  }

  render(snapshot: SimulationSnapshot): void {
    if (this.options.benchmarkMode) {
      this.graphics.clear();
      this.hitArea.setVisible(false);
      this.syncViewport();
      return;
    }

    this.hitArea.setVisible(true);

    const originX = this.originX();
    const originY = this.options.margin;
    const cellSize = this.options.size / this.options.mapSize;

    this.hitArea.setPosition(
      originX + this.options.size / 2,
      originY + this.options.size / 2
    );

    this.graphics.clear();
    this.graphics.fillStyle(0x091017, 0.94);
    this.graphics.fillRect(
      originX - 4,
      originY - 4,
      this.options.size + 8,
      this.options.size + 8
    );

    for (let y = 0; y < this.options.mapSize; y += 1) {
      for (let x = 0; x < this.options.mapSize; x += 1) {
        const state = this.options.fogRenderer.stateAtCell(x, y);

        this.graphics.fillStyle(
          state === "unexplored"
            ? 0x050709
            : state === "explored"
              ? 0x26372f
              : 0x3f6250,
          1
        );
        this.graphics.fillRect(
          originX + x * cellSize,
          originY + y * cellSize,
          Math.ceil(cellSize),
          Math.ceil(cellSize)
        );
      }
    }

    for (const resource of snapshot.resources) {
      if (
        this.options.fogRenderer.stateAtPoint(
          resource.position.x,
          resource.position.y
        ) === "unexplored"
      ) {
        continue;
      }

      this.graphics.fillStyle(resourceColor(resource.kind), 1);
      this.graphics.fillCircle(
        originX +
          (resource.position.x / this.options.mapSize) * this.options.size,
        originY +
          (resource.position.y / this.options.mapSize) * this.options.size,
        2
      );
    }

    for (const building of snapshot.buildings) {
      if (
        building.ownerId !== "player-1" &&
        !this.options.fogRenderer.isVisiblePoint(
          building.position.x,
          building.position.y
        )
      ) {
        continue;
      }

      this.graphics.fillStyle(
        building.ownerId === "player-1" ? 0xe1ca78 : 0xc7655c,
        1
      );
      this.graphics.fillRect(
        originX +
          (building.position.x / this.options.mapSize) * this.options.size -
          2,
        originY +
          (building.position.y / this.options.mapSize) * this.options.size -
          2,
        5,
        5
      );
    }

    for (const unit of snapshot.units) {
      const visible =
        unit.ownerId === "player-1" ||
        this.options.fogRenderer.isVisiblePoint(
          unit.position.x,
          unit.position.y
        );

      if (!visible) {
        continue;
      }

      this.graphics.fillStyle(
        unit.ownerId === "player-1" ? 0xf0dc83 : 0xd66d63,
        1
      );
      this.graphics.fillCircle(
        originX +
          (unit.position.x / this.options.mapSize) * this.options.size,
        originY +
          (unit.position.y / this.options.mapSize) * this.options.size,
        1.8
      );
    }

    const cameraGrid = screenToGrid(
      {
        x: this.options.scene.cameras.main.midPoint.x,
        y: this.options.scene.cameras.main.midPoint.y
      },
      this.options.projection
    );

    this.graphics.lineStyle(1, 0xffffff, 0.9);
    this.graphics.strokeRect(
      originX +
        (Phaser.Math.Clamp(cameraGrid.x, 0, this.options.mapSize) /
          this.options.mapSize) *
          this.options.size -
        7,
      originY +
        (Phaser.Math.Clamp(cameraGrid.y, 0, this.options.mapSize) /
          this.options.mapSize) *
          this.options.size -
        5,
      14,
      10
    );

    this.syncViewport();
  }

  destroy(): void {
    this.viewportContainer.destroy(true);
  }

  private syncViewport(): void {
    const scene = this.options.scene;
    const transform = fixedViewportTransform(
      scene.cameras.main.zoom,
      scene.scale.width,
      scene.scale.height
    );

    this.viewportContainer
      .setPosition(transform.x, transform.y)
      .setScale(transform.scale);
  }

  private centerCamera(pointer: Phaser.Input.Pointer): void {
    if (this.options.benchmarkMode) {
      return;
    }

    const originX = this.originX();
    const localX = Phaser.Math.Clamp(
      pointer.x - originX,
      0,
      this.options.size
    );
    const localY = Phaser.Math.Clamp(
      pointer.y - this.options.margin,
      0,
      this.options.size
    );

    const mapPoint = {
      x: (localX / this.options.size) * this.options.mapSize,
      y: (localY / this.options.size) * this.options.mapSize
    };
    const worldPoint = gridToScreen(mapPoint, this.options.projection);

    this.options.scene.cameras.main.centerOn(worldPoint.x, worldPoint.y);
  }

  private originX(): number {
    return Math.max(
      this.options.margin,
      this.options.scene.scale.width - this.options.size - this.options.margin
    );
  }
}

function resourceColor(kind: ResourceNodeState["kind"]): number {
  if (kind === "wood") {
    return 0x4f7d4a;
  }
  if (kind === "food") {
    return 0xa94f72;
  }
  return 0xd1ad3c;
}
