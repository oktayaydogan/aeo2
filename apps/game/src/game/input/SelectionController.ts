import Phaser from "phaser";
import type { SimulationSnapshot } from "@aeo2/simulation";
import { gridToScreen, type IsometricProjection, type Point2 } from "../isometric";

const DRAG_THRESHOLD_PX = 6;

interface DragSelectionState {
  startScreen: Point2;
  startWorld: Point2;
}

export interface SelectionControllerOptions {
  input: Phaser.Input.InputPlugin;
  graphics: Phaser.GameObjects.Graphics;
  selectedUnitIds: Set<string>;
  projection: IsometricProjection;
  getSnapshot(): SimulationSnapshot;
  isPlacementActive(): boolean;
  setSelectedBuildingId(buildingId: string | undefined): void;
  cancelPlacement(): void;
}

export class SelectionController {
  private dragSelection?: DragSelectionState;

  constructor(private readonly options: SelectionControllerOptions) {}

  configure(): void {
    this.options.input.on(
      "pointerdown",
      (
        pointer: Phaser.Input.Pointer,
        currentlyOver: Phaser.GameObjects.GameObject[]
      ) => {
        if (
          this.options.isPlacementActive() ||
          !pointer.leftButtonDown() ||
          currentlyOver.length > 0
        ) {
          return;
        }

        this.options.setSelectedBuildingId(undefined);
        this.options.selectedUnitIds.clear();
        this.dragSelection = {
          startScreen: { x: pointer.x, y: pointer.y },
          startWorld: { x: pointer.worldX, y: pointer.worldY }
        };
      }
    );

    this.options.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragSelection || !pointer.leftButtonDown()) {
        return;
      }

      this.drawSelectionBox(pointer);
    });

    this.options.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragSelection) {
        return;
      }

      this.finishSelectionBox(pointer);
    });
  }

  selectOnlyUnit(unitId: string): void {
    this.options.setSelectedBuildingId(undefined);
    this.options.selectedUnitIds.clear();
    this.options.selectedUnitIds.add(unitId);
  }

  selectOnlyBuilding(buildingId: string): void {
    this.options.setSelectedBuildingId(buildingId);
    this.options.selectedUnitIds.clear();
    this.options.cancelPlacement();
  }

  cancelDrag(): void {
    this.dragSelection = undefined;
    this.options.graphics.clear();
  }

  private drawSelectionBox(pointer: Phaser.Input.Pointer): void {
    const drag = this.dragSelection;

    if (!drag) {
      return;
    }

    const start = drag.startScreen;
    const left = Math.min(start.x, pointer.x);
    const top = Math.min(start.y, pointer.y);
    const width = Math.abs(pointer.x - start.x);
    const height = Math.abs(pointer.y - start.y);

    this.options.graphics.clear();
    this.options.graphics.fillStyle(0xd9c56c, 0.1);
    this.options.graphics.lineStyle(1, 0xf7e7a9, 0.9);
    this.options.graphics.fillRect(left, top, width, height);
    this.options.graphics.strokeRect(left, top, width, height);
  }

  private finishSelectionBox(pointer: Phaser.Input.Pointer): void {
    const drag = this.dragSelection;

    this.dragSelection = undefined;
    this.options.graphics.clear();

    if (!drag) {
      return;
    }

    const screenDistance = Math.hypot(
      pointer.x - drag.startScreen.x,
      pointer.y - drag.startScreen.y
    );

    if (screenDistance < DRAG_THRESHOLD_PX) {
      return;
    }

    const left = Math.min(drag.startWorld.x, pointer.worldX);
    const right = Math.max(drag.startWorld.x, pointer.worldX);
    const top = Math.min(drag.startWorld.y, pointer.worldY);
    const bottom = Math.max(drag.startWorld.y, pointer.worldY);

    for (const unit of this.options.getSnapshot().units) {
      if (unit.ownerId !== "player-1") {
        continue;
      }

      const point = gridToScreen(unit.position, this.options.projection);

      if (
        point.x >= left &&
        point.x <= right &&
        point.y >= top &&
        point.y <= bottom
      ) {
        this.options.selectedUnitIds.add(unit.id);
      }
    }
  }
}
