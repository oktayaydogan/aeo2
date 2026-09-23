import Phaser from "phaser";
import { BUILDING_DEFINITIONS } from "@aeo2/content";
import type { BuildingState, SimulationSnapshot } from "@aeo2/simulation";
import { gridToScreen, type IsometricProjection } from "../isometric";

export interface BuildingRendererOptions {
  scene: Phaser.Scene;
  projection: IsometricProjection;
  getSelectedBuildingId(): string | undefined;
  onSelectOwnBuilding(buildingId: string): void;
  onBuildingRemoved(buildingId: string): void;
}

export class BuildingRenderer {
  private readonly views = new Map<string, Phaser.GameObjects.Image>();
  private hoveredBuildingId?: string;
  private readonly healthBars = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly lastHitPoints = new Map<string, number>();
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private readonly idByObject = new Map<Phaser.GameObjects.GameObject, string>();

  constructor(private readonly options: BuildingRendererOptions) {}

  sync(
    snapshot: SimulationSnapshot,
    isVisible: (building: BuildingState) => boolean
  ): void {
    const liveIds = new Set(snapshot.buildings.map((building) => building.id));

    for (const [buildingId, view] of this.views) {
      if (liveIds.has(buildingId)) {
        continue;
      }

      this.idByObject.delete(view);
      view.destroy();
      this.healthBars.get(buildingId)?.destroy();
      this.healthBars.delete(buildingId);
      this.labels.get(buildingId)?.destroy();
      this.labels.delete(buildingId);
      this.lastHitPoints.delete(buildingId);
      this.views.delete(buildingId);
      this.options.onBuildingRemoved(buildingId);
    }

    for (const building of snapshot.buildings) {
      if (isVisible(building)) {
        this.render(building);
      } else {
        this.views.get(building.id)?.setVisible(false);
        this.healthBars.get(building.id)?.setVisible(false);
        this.labels.get(building.id)?.setVisible(false);
      }
    }
  }

  findId(currentlyOver: Phaser.GameObjects.GameObject[]): string | undefined {
    for (const gameObject of currentlyOver) {
      const buildingId = this.idByObject.get(gameObject);

      if (buildingId) {
        return buildingId;
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
    for (const label of this.labels.values()) {
      label.destroy();
    }
    this.views.clear();
    this.healthBars.clear();
    this.labels.clear();
    this.lastHitPoints.clear();
    this.idByObject.clear();
  }

  private render(building: BuildingState): void {
    const definition = BUILDING_DEFINITIONS.find(
      (entry) => entry.kind === building.kind
    );

    if (!definition) {
      return;
    }

    const center = {
      x: building.position.x + definition.footprint.width / 2,
      y: building.position.y + definition.footprint.height / 2
    };
    const point = gridToScreen(center, this.options.projection);

    let view = this.views.get(building.id);
    let label = this.labels.get(building.id);

    if (!view) {
      view = this.options.scene.add
        .image(point.x, point.y - 10, `building-${building.kind}`)
        .setOrigin(0.5, 0.8)
        .setTint(buildingTint(building))
        .setDepth(point.y)
        .setInteractive({ useHandCursor: true });

      view.setScale(baseScale(building));
      view.on("pointerover", () => {
        this.hoveredBuildingId = building.id;
        this.labels.get(building.id)?.setVisible(true);
      });
      view.on("pointerout", () => {
        if (this.hoveredBuildingId === building.id) {
          this.hoveredBuildingId = undefined;
        }

        this.labels
          .get(building.id)
          ?.setVisible(
            this.options.getSelectedBuildingId() === building.id
          );
      });

      view.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (pointer.leftButtonDown() && building.ownerId === "player-1") {
          this.options.onSelectOwnBuilding(building.id);
        }
      });
      this.idByObject.set(view, building.id);

      const healthBar = this.options.scene.add
        .rectangle(point.x, point.y - 48, 48, 4, 0x7ecf7a, 1)
        .setOrigin(0.5, 0.5)
        .setDepth(point.y + 2);
      this.healthBars.set(building.id, healthBar);

      label = this.options.scene.add
        .text(point.x, point.y + 10, "", {
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: "10px",
          color: "#f6f1df",
          backgroundColor: "#091017bb",
          padding: { x: 3, y: 1 }
        })
        .setOrigin(0.5, 0);

      this.views.set(building.id, view);
      this.labels.set(building.id, label);
      this.lastHitPoints.set(building.id, building.hitPoints);
    }

    view.setVisible(true);
    this.healthBars.get(building.id)?.setVisible(true);
    view.setPosition(point.x, point.y - 10);
    view.setDepth(point.y);
    view.setAlpha(0.35 + building.progress * 0.65);
    view.setTint(buildingTint(building));

    const hpRatio = Phaser.Math.Clamp(
      building.hitPoints / definition.maxHitPoints,
      0,
      1
    );
    const healthBar = this.healthBars.get(building.id);
    healthBar?.setPosition(point.x, point.y - 48);
    healthBar?.setDisplaySize(Math.max(1, 48 * hpRatio), 4);
    healthBar?.setFillStyle(
      hpRatio > 0.6 ? 0x7ecf7a : hpRatio > 0.3 ? 0xe0bd62 : 0xd4655d,
      1
    );
    healthBar?.setDepth(point.y + 2);

    const previousHitPoints = this.lastHitPoints.get(building.id);
    if (
      previousHitPoints !== undefined &&
      building.hitPoints < previousHitPoints
    ) {
      view.setTint(0xffffff);
      this.options.scene.time.delayedCall(100, () => {
        if (view.active) {
          view.setTint(buildingTint(building));
        }
      });
    }
    this.lastHitPoints.set(building.id, building.hitPoints);

    const selected = this.options.getSelectedBuildingId() === building.id;
    view.setScale(baseScale(building) * (selected ? 1.06 : 1));

    if (label) {
      label.setVisible(
        selected || this.hoveredBuildingId === building.id
      );
      label.setPosition(point.x, point.y + 10);
      label.setDepth(point.y + 1);
      const queue = building.trainingQueue[0];
      const queueLabel = queue
        ? ` · ${queue.unitKind.toUpperCase()} ${Math.round(queue.progress * 100)}%`
        : "";
      const rallyLabel = building.rallyPoint ? " · RALLY" : "";

      label.setText(
        `${definition.displayName.toUpperCase()} · HP ${Math.ceil(
          building.hitPoints
        )}/${definition.maxHitPoints}${queueLabel}${rallyLabel}`
      );
    }
  }
}

function baseScale(building: BuildingState): number {
  return building.kind === "town-center"
    ? 1
    : building.kind === "barracks"
      ? 0.86
      : 0.78;
}

function buildingTint(building: BuildingState): number {
  return building.ownerId === "player-1" ? 0xffffff : 0xd77a72;
}
