import Phaser from "phaser";
import { HudAdapter } from "../adapters/HudAdapter";
import { MinimapAdapter } from "../adapters/MinimapAdapter";
import type { WorldScene } from "./WorldScene";

const MINIMAP_SIZE = 160;
const MINIMAP_MARGIN = 14;

export class UiScene extends Phaser.Scene {
  private worldScene?: WorldScene;
  private hudAdapter?: HudAdapter;
  private minimapAdapter?: MinimapAdapter;
  private selectionGraphics?: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: "ui", active: false });
  }

  create(): void {
    const worldScene = this.scene.get("world") as WorldScene;
    const fogRenderer = worldScene.getUiFogRenderer();

    if (!fogRenderer) {
      throw new Error(
        "World fog renderer must exist before UiScene starts."
      );
    }

    this.worldScene = worldScene;

    this.cameras.main
      .setScroll(0, 0)
      .setZoom(1);

    this.selectionGraphics = this.add
      .graphics()
      .setDepth(90_000);

    this.minimapAdapter = new MinimapAdapter({
      scene: this,
      projection: worldScene.getUiProjection(),
      fogRenderer,
      mapSize: worldScene.getUiMapSize(),
      size: MINIMAP_SIZE,
      margin: MINIMAP_MARGIN,
      benchmarkMode: worldScene.isUiBenchmarkMode(),
      getWorldCameraMidPoint: () =>
        worldScene.getWorldCameraMidPoint(),
      centerWorldCamera: (x, y) =>
        worldScene.centerWorldCamera(x, y)
    });

    this.hudAdapter = new HudAdapter({
      scene: this,
      benchmarkMode: worldScene.isUiBenchmarkMode(),
      skirmishSeed: worldScene.getUiSkirmishSeed(),
      selectedUnitIds: worldScene.getUiSelectedUnitIds(),
      getSelectedBuildingId: () =>
        worldScene.getUiSelectedBuildingId(),
      setPlacementMode: (kind) =>
        worldScene.setUiPlacementMode(kind),
      issueTrain: (unitKind) =>
        worldScene.issueUiTrain(unitKind),
      issueResearch: (technologyKind) =>
        worldScene.issueUiResearch(technologyKind)
    });

    this.events.once(
      Phaser.Scenes.Events.SHUTDOWN,
      this.destroyUi,
      this
    );

    this.renderUi();
  }

  override update(): void {
    this.renderUi();
  }

  private renderUi(): void {
    const worldScene = this.worldScene;

    if (!worldScene || !worldScene.sys.isActive()) {
      return;
    }

    const snapshot = worldScene.getUiSnapshot();

    this.drawSelectionBox();
    this.minimapAdapter?.render(snapshot);
    this.hudAdapter?.layout(snapshot);
    this.hudAdapter?.update(snapshot);
    this.hudAdapter?.updateMatchOverlay(snapshot);
  }

  private drawSelectionBox(): void {
    const graphics = this.selectionGraphics;
    const worldScene = this.worldScene;

    if (!graphics || !worldScene) {
      return;
    }

    graphics.clear();

    const box = worldScene.getUiSelectionBox();

    if (!box) {
      return;
    }

    graphics.fillStyle(
      0xd9c56c,
      box.additive ? 0.16 : 0.1
    );
    graphics.lineStyle(
      box.additive ? 2 : 1,
      box.additive ? 0x8fd18b : 0xf7e7a9,
      0.9
    );
    graphics.fillRect(
      box.left,
      box.top,
      box.width,
      box.height
    );
    graphics.strokeRect(
      box.left,
      box.top,
      box.width,
      box.height
    );
  }

  private destroyUi(): void {
    this.hudAdapter?.destroy();
    this.minimapAdapter?.destroy();
    this.selectionGraphics?.destroy();

    this.hudAdapter = undefined;
    this.minimapAdapter = undefined;
    this.selectionGraphics = undefined;
    this.worldScene = undefined;
  }
}
