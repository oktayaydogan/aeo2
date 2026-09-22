import Phaser from "phaser";
import type { UnitState } from "@aeo2/simulation";
import type { Point2 } from "../isometric";

export class SelectionRenderer {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(79_999);
  }

  beginFrame(): void {
    this.graphics.clear();
  }

  drawUnit(unit: UnitState, point: Point2): void {
    const activityColor =
      unit.activity === "gathering"
        ? 0x8fd18b
        : unit.activity === "returning"
          ? 0x8ec5e8
          : unit.activity === "building"
            ? 0xe4ad72
            : unit.activity === "attacking"
              ? 0xe98673
              : 0xf7e7a9;

    this.graphics.lineStyle(2, activityColor, 0.95);
    this.graphics.strokeEllipse(point.x, point.y + 2, 24, 10);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
