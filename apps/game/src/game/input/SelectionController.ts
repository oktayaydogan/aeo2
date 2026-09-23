import Phaser from "phaser";
import type { SimulationSnapshot } from "@aeo2/simulation";
import { gridToScreen, type IsometricProjection, type Point2 } from "../isometric";
import { applyUnitClickSelection } from "./selectionState";

const DRAG_THRESHOLD_PX = 6;
const DOUBLE_CLICK_WINDOW_MS = 320;

interface DragSelectionState {
  startScreen: Point2;
  startWorld: Point2;
  additive: boolean;
}

export interface SelectionBoxVisual {
  left: number;
  top: number;
  width: number;
  height: number;
  additive: boolean;
}

export interface SelectionControllerOptions {
  input: Phaser.Input.InputPlugin;
  setSelectionBox(box: SelectionBoxVisual | undefined): void;
  selectedUnitIds: Set<string>;
  projection: IsometricProjection;
  pointerToWorld(pointer: Phaser.Input.Pointer): Point2;
  getSnapshot(): SimulationSnapshot;
  isPlacementActive(): boolean;
  isWorldPointVisible(point: Point2): boolean;
  setSelectedBuildingId(buildingId: string | undefined): void;
  cancelPlacement(): void;
}

export class SelectionController {
  private dragSelection?: DragSelectionState;
  private shiftKey?: Phaser.Input.Keyboard.Key;
  private lastUnitClick?: {
    unitId: string;
    at: number;
  };

  constructor(private readonly options: SelectionControllerOptions) {}

  configure(): void {
    if (this.options.input.keyboard) {
      this.shiftKey = this.options.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SHIFT
      );
    }

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

        const additive = this.shiftKey?.isDown ?? false;

        this.options.setSelectedBuildingId(undefined);

        if (!additive) {
          this.options.selectedUnitIds.clear();
        }

        this.dragSelection = {
          startScreen: { x: pointer.x, y: pointer.y },
          startWorld: this.options.pointerToWorld(pointer),
          additive
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

  selectUnit(unitId: string, nowMs: number): void {
    const snapshot = this.options.getSnapshot();
    const clicked = snapshot.units.find(
      (unit) => unit.id === unitId && unit.ownerId === "player-1"
    );

    if (!clicked) {
      return;
    }

    const additive = this.shiftKey?.isDown ?? false;
    const doubleClick =
      this.lastUnitClick?.unitId === unitId &&
      nowMs - this.lastUnitClick.at <= DOUBLE_CLICK_WINDOW_MS;

    this.options.setSelectedBuildingId(undefined);

    if (doubleClick) {
      if (!additive) {
        this.options.selectedUnitIds.clear();
      }

      for (const unit of snapshot.units) {
        if (unit.ownerId !== "player-1" || unit.kind !== clicked.kind) {
          continue;
        }

        const point = gridToScreen(unit.position, this.options.projection);

        if (this.options.isWorldPointVisible(point)) {
          this.options.selectedUnitIds.add(unit.id);
        }
      }
    } else {
      applyUnitClickSelection(
        this.options.selectedUnitIds,
        unitId,
        additive
      );
    }

    this.lastUnitClick = {
      unitId,
      at: nowMs
    };
  }

  selectOnlyBuilding(buildingId: string): void {
    this.options.setSelectedBuildingId(buildingId);
    this.options.selectedUnitIds.clear();
    this.options.cancelPlacement();
  }

  cancelDrag(): void {
    this.dragSelection = undefined;
    this.options.setSelectionBox(undefined);
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

    this.options.setSelectionBox({
      left,
      top,
      width,
      height,
      additive: drag.additive
    });
  }

  private finishSelectionBox(pointer: Phaser.Input.Pointer): void {
    const drag = this.dragSelection;

    this.dragSelection = undefined;
    this.options.setSelectionBox(undefined);

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

    const pointerWorld = this.options.pointerToWorld(pointer);
    const left = Math.min(drag.startWorld.x, pointerWorld.x);
    const right = Math.max(drag.startWorld.x, pointerWorld.x);
    const top = Math.min(drag.startWorld.y, pointerWorld.y);
    const bottom = Math.max(drag.startWorld.y, pointerWorld.y);

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
