import Phaser from "phaser";
import { UNIT_DEFINITIONS } from "@aeo2/content";
import type { SimulationSnapshot, UnitState } from "@aeo2/simulation";
import { gridToScreen, type IsometricProjection } from "../isometric";
import { SelectionRenderer } from "./SelectionRenderer";

export interface UnitRendererOptions {
  scene: Phaser.Scene;
  projection: IsometricProjection;
  selectionRenderer: SelectionRenderer;
  selectedUnitIds: Set<string>;
  onSelectOwnUnit(unitId: string, nowMs: number): void;
}

export class UnitRenderer {
  private readonly views = new Map<string, Phaser.GameObjects.Image>();
  private readonly healthBars = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly lastHitPoints = new Map<string, number>();
  private readonly idByObject = new Map<Phaser.GameObjects.GameObject, string>();

  constructor(private readonly options: UnitRendererOptions) {}

  sync(
    snapshot: SimulationSnapshot,
    isVisible: (unit: UnitState) => boolean
  ): void {
    this.options.selectionRenderer.beginFrame();
    const liveIds = new Set(snapshot.units.map((unit) => unit.id));

    for (const [unitId, view] of this.views) {
      if (liveIds.has(unitId)) {
        continue;
      }

      this.idByObject.delete(view);
      view.destroy();
      this.healthBars.get(unitId)?.destroy();
      this.healthBars.delete(unitId);
      this.lastHitPoints.delete(unitId);
      this.views.delete(unitId);
      this.options.selectedUnitIds.delete(unitId);
    }

    for (const unit of snapshot.units) {
      const view = this.ensure(unit);
      const visible = isVisible(unit);
      const healthBar = this.healthBars.get(unit.id);

      view.setVisible(visible);

      if (unit.ownerId !== "player-1") {
        if (visible) {
          view.setInteractive({ useHandCursor: true });
        } else {
          view.disableInteractive();
        }
      }

      if (!visible) {
        continue;
      }

      const point = gridToScreen(unit.position, this.options.projection);
      view.setPosition(point.x, point.y - 7);
      view.setDepth(point.y);

      const definition = UNIT_DEFINITIONS.find(
        (entry) => entry.kind === unit.kind
      );
      const maxHitPoints = definition?.maxHitPoints ?? unit.hitPoints;
      const hpRatio = Phaser.Math.Clamp(unit.hitPoints / maxHitPoints, 0, 1);
      healthBar?.setPosition(point.x, point.y - 23);
      healthBar?.setDisplaySize(Math.max(1, 18 * hpRatio), 3);
      healthBar?.setFillStyle(
        hpRatio > 0.6 ? 0x7ecf7a : hpRatio > 0.3 ? 0xe0bd62 : 0xd4655d,
        1
      );
      healthBar?.setDepth(point.y + 2);

      const previousHitPoints = this.lastHitPoints.get(unit.id);
      if (
        previousHitPoints !== undefined &&
        unit.hitPoints < previousHitPoints
      ) {
        view.setTint(0xffffff);
        this.options.scene.time.delayedCall(90, () => {
          if (view.active) {
            view.setTint(unitTint(unit));
          }
        });
      } else {
        view.setTint(unitTint(unit));
      }
      this.lastHitPoints.set(unit.id, unit.hitPoints);

      const selected = this.options.selectedUnitIds.has(unit.id);
      healthBar?.setVisible(
        visible &&
          (selected || unit.hitPoints < maxHitPoints - 0.001)
      );

      const activityPhase = snapshot.tick * 0.22;
      const activityOffset =
        unit.activity === "gathering" || unit.activity === "building"
          ? Math.sin(activityPhase + unit.id.length) * 1.6
          : 0;
      const attackRotation =
        unit.activity === "attacking"
          ? Math.sin(activityPhase * 1.5 + unit.id.length) * 0.12
          : 0;

      view.setY(point.y - 7 + activityOffset);
      view.setRotation(attackRotation);
      view.setScale(selected ? 1.12 : 1);

      if (selected) {
        this.options.selectionRenderer.drawUnit(unit, point);
      }
    }
  }

  findId(currentlyOver: Phaser.GameObjects.GameObject[]): string | undefined {
    for (const gameObject of currentlyOver) {
      const unitId = this.idByObject.get(gameObject);

      if (unitId) {
        return unitId;
      }
    }

    return undefined;
  }

  destroy(): void {
    for (const view of this.views.values()) {
      view.destroy();
    }
    for (const healthBar of this.healthBars.values()) {
      healthBar.destroy();
    }
    this.views.clear();
    this.healthBars.clear();
    this.lastHitPoints.clear();
    this.idByObject.clear();
  }

  private ensure(unit: UnitState): Phaser.GameObjects.Image {
    const existing = this.views.get(unit.id);

    if (existing) {
      return existing;
    }

    const point = gridToScreen(unit.position, this.options.projection);
    const image = this.options.scene.add
      .image(point.x, point.y - 7, unitTextureKey(unit.kind))
      .setOrigin(0.5, 0.82)
      .setDepth(point.y)
      .setTint(unitTint(unit))
      .setInteractive({ useHandCursor: true });

    image.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown() && unit.ownerId === "player-1") {
        this.options.onSelectOwnUnit(unit.id, this.options.scene.time.now);
      }
    });

    const healthBar = this.options.scene.add
      .rectangle(point.x, point.y - 23, 18, 3, 0x7ecf7a, 1)
      .setOrigin(0.5, 0.5)
      .setDepth(point.y + 2);

    this.views.set(unit.id, image);
    this.healthBars.set(unit.id, healthBar);
    this.lastHitPoints.set(unit.id, unit.hitPoints);
    this.idByObject.set(image, unit.id);
    return image;
  }
}

function unitTextureKey(kind: UnitState["kind"]): string {
  if (kind === "militia") {
    return "unit-militia";
  }
  if (kind === "archer") {
    return "unit-archer";
  }
  if (kind === "spearman") {
    return "unit-spearman";
  }
  return "unit-villager";
}

function unitTint(unit: UnitState): number {
  return unit.ownerId === "player-1" ? 0xffffff : 0xd77a72;
}
