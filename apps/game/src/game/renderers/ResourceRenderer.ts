import Phaser from "phaser";
import type { ResourceNodeState } from "@aeo2/simulation";
import { gridToScreen, type IsometricProjection } from "../isometric";
import type { VisibilityState } from "../visibility";

export class ResourceRenderer {
  private readonly views = new Map<string, Phaser.GameObjects.Image>();
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private readonly idByObject = new Map<Phaser.GameObjects.GameObject, string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly projection: IsometricProjection
  ) {}

  sync(
    resources: readonly ResourceNodeState[],
    visibilityAt: (resource: ResourceNodeState) => VisibilityState
  ): void {
    const liveIds = new Set(resources.map((resource) => resource.id));

    for (const [resourceId, view] of this.views) {
      if (liveIds.has(resourceId)) {
        continue;
      }

      this.idByObject.delete(view);
      view.destroy();
      this.views.delete(resourceId);
      this.labels.get(resourceId)?.destroy();
      this.labels.delete(resourceId);
    }

    for (const resource of resources) {
      this.ensure(resource);
      const view = this.views.get(resource.id);
      const label = this.labels.get(resource.id);
      const visibility = visibilityAt(resource);
      const discovered = visibility !== "unexplored";

      view?.setVisible(discovered);
      label?.setVisible(discovered);

      if (view) {
        if (discovered) {
          view.setInteractive({ useHandCursor: true });
        } else {
          view.disableInteractive();
        }

        view.setAlpha(
          resource.amount <= 0
            ? 0.2
            : visibility === "explored"
              ? 0.5
              : 1
        );
      }

      if (label) {
        label.setText(resourceLabel(resource));
        label.setAlpha(
          resource.amount <= 0
            ? 0.45
            : visibility === "explored"
              ? 0.5
              : 1
        );
      }
    }
  }

  findId(currentlyOver: Phaser.GameObjects.GameObject[]): string | undefined {
    for (const gameObject of currentlyOver) {
      const resourceId = this.idByObject.get(gameObject);

      if (resourceId) {
        return resourceId;
      }
    }

    return undefined;
  }

  destroy(): void {
    for (const view of this.views.values()) {
      view.destroy();
    }
    for (const label of this.labels.values()) {
      label.destroy();
    }
    this.views.clear();
    this.labels.clear();
    this.idByObject.clear();
  }

  private ensure(resource: ResourceNodeState): void {
    if (this.views.has(resource.id)) {
      return;
    }

    const point = gridToScreen(resource.position, this.projection);
    const view = this.scene.add
      .image(point.x, point.y - 8, resourceTextureKey(resource.kind))
      .setOrigin(0.5, 0.8)
      .setDepth(point.y)
      .setInteractive({ useHandCursor: true });

    const label = this.scene.add
      .text(point.x, point.y + 10, resourceLabel(resource), {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "10px",
        color: "#f6f1df",
        backgroundColor: "#091017bb",
        padding: { x: 3, y: 1 }
      })
      .setOrigin(0.5, 0)
      .setDepth(point.y + 1);

    this.views.set(resource.id, view);
    this.labels.set(resource.id, label);
    this.idByObject.set(view, resource.id);
  }
}

function resourceTextureKey(kind: ResourceNodeState["kind"]): string {
  return kind === "wood"
    ? "resource-wood"
    : kind === "food"
      ? "resource-food"
      : "resource-gold";
}

function resourceLabel(resource: ResourceNodeState): string {
  const name =
    resource.kind === "wood"
      ? "TREE"
      : resource.kind === "food"
        ? "BERRIES"
        : "GOLD";

  return `${name} ${Math.ceil(resource.amount)}`;
}
