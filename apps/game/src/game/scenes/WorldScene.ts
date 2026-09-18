import Phaser from "phaser";
import {
  DEFAULT_TICK_RATE,
  Simulation,
  type SimulationSnapshot,
  type UnitState
} from "@aeo2/simulation";
import {
  gridToScreen,
  screenToGrid,
  type IsometricProjection,
  type Point2
} from "../isometric";
import { BLOCKED_CELL_KEYS, PROTOTYPE_MAP } from "../prototypeMap";

const MAP_SIZE = 20;
const UNIT_RADIUS = 5;
const DRAG_THRESHOLD_PX = 6;

interface DragSelectionState {
  startScreen: Point2;
  startWorld: Point2;
}

export class WorldScene extends Phaser.Scene {
  private readonly simulation = new Simulation({
    tickRate: DEFAULT_TICK_RATE,
    map: PROTOTYPE_MAP,
    units: createInitialUnits()
  });

  private readonly projection: IsometricProjection = {
    tileWidth: 64,
    tileHeight: 32,
    originX: 700,
    originY: 110
  };

  private readonly unitViews = new Map<string, Phaser.GameObjects.Arc>();
  private readonly selectedUnitIds = new Set<string>();

  private accumulatorMs = 0;
  private metricsElapsedMs = 0;
  private simulationCostMs = 0;
  private metricsText?: Phaser.GameObjects.Text;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private selectionGraphics?: Phaser.GameObjects.Graphics;
  private dragSelection?: DragSelectionState;
  private wasd?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("world");
  }

  create(): void {
    this.drawMap();
    this.createUnitViews(this.simulation.getSnapshot());

    this.selectionGraphics = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(100_000);

    this.metricsText = this.add
      .text(14, 14, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#e9eef2",
        backgroundColor: "#091017cc",
        padding: { x: 8, y: 6 }
      })
      .setScrollFactor(0)
      .setDepth(100_001);

    this.configureInput();

    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(700, 420);
  }

  override update(_time: number, delta: number): void {
    this.updateCamera(delta);

    this.accumulatorMs += Math.min(delta, 250);

    while (this.accumulatorMs >= this.simulation.tickDurationMs) {
      const stepStartedAt = performance.now();
      this.simulation.step();
      this.simulationCostMs = performance.now() - stepStartedAt;
      this.accumulatorMs -= this.simulation.tickDurationMs;
    }

    const snapshot = this.simulation.getSnapshot();
    this.renderSnapshot(snapshot);
    this.updateMetrics(delta, snapshot);
  }

  private drawMap(): void {
    const graphics = this.add.graphics();

    for (let y = 0; y < MAP_SIZE; y += 1) {
      for (let x = 0; x < MAP_SIZE; x += 1) {
        const top = gridToScreen({ x, y }, this.projection);
        const right = gridToScreen({ x: x + 1, y }, this.projection);
        const bottom = gridToScreen({ x: x + 1, y: y + 1 }, this.projection);
        const left = gridToScreen({ x, y: y + 1 }, this.projection);
        const blocked = BLOCKED_CELL_KEYS.has(`${x},${y}`);

        graphics.fillStyle(
          blocked ? 0x4a4b47 : (x + y) % 2 === 0 ? 0x29483c : 0x2d4e41,
          1
        );
        graphics.lineStyle(1, blocked ? 0xa19a83 : 0x6d8a73, blocked ? 0.55 : 0.2);
        graphics.beginPath();
        graphics.moveTo(top.x, top.y);
        graphics.lineTo(right.x, right.y);
        graphics.lineTo(bottom.x, bottom.y);
        graphics.lineTo(left.x, left.y);
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();

        if (blocked) {
          graphics.lineStyle(2, 0xb4aa89, 0.32);
          graphics.beginPath();
          graphics.moveTo(
            (top.x + left.x) / 2,
            (top.y + left.y) / 2
          );
          graphics.lineTo(
            (right.x + bottom.x) / 2,
            (right.y + bottom.y) / 2
          );
          graphics.strokePath();
        }
      }
    }
  }

  private createUnitViews(snapshot: SimulationSnapshot): void {
    for (const unit of snapshot.units) {
      const point = gridToScreen(unit.position, this.projection);
      const circle = this.add.circle(
        point.x,
        point.y,
        UNIT_RADIUS,
        unit.ownerId === "player-1" ? 0xd9c56c : 0xb35c52
      );

      circle.setStrokeStyle(2, 0x101922, 0.8);
      circle.setDepth(point.y);

      if (unit.ownerId === "player-1") {
        circle.setInteractive({ useHandCursor: true });
        circle.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (pointer.leftButtonDown()) {
            this.selectOnly(unit.id);
          }
        });
      }

      this.unitViews.set(unit.id, circle);
    }
  }

  private configureInput(): void {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
      };
    }

    this.input.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        if (pointer.rightButtonDown()) {
          this.issueMoveCommand(pointer);
          return;
        }

        if (!pointer.leftButtonDown() || currentlyOver.length > 0) {
          return;
        }

        this.selectedUnitIds.clear();
        this.dragSelection = {
          startScreen: { x: pointer.x, y: pointer.y },
          startWorld: { x: pointer.worldX, y: pointer.worldY }
        };
      }
    );

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragSelection || !pointer.leftButtonDown()) {
        return;
      }

      this.drawSelectionBox(pointer);
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!this.dragSelection) {
        return;
      }

      this.finishSelectionBox(pointer);
    });

    this.input.on(
      "wheel",
      (
        _pointer: Phaser.Input.Pointer,
        _currentlyOver: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number
      ) => {
        const camera = this.cameras.main;
        camera.setZoom(
          Phaser.Math.Clamp(camera.zoom - deltaY * 0.001, 0.55, 1.8)
        );
      }
    );
  }

  private issueMoveCommand(pointer: Phaser.Input.Pointer): void {
    if (this.selectedUnitIds.size === 0) {
      return;
    }

    const target = screenToGrid(
      { x: pointer.worldX, y: pointer.worldY },
      this.projection
    );

    this.simulation.queueCommand({
      type: "move",
      playerId: "player-1",
      unitIds: [...this.selectedUnitIds],
      target: {
        x: Phaser.Math.Clamp(target.x, 0, MAP_SIZE - 0.01),
        y: Phaser.Math.Clamp(target.y, 0, MAP_SIZE - 0.01)
      }
    });
  }

  private drawSelectionBox(pointer: Phaser.Input.Pointer): void {
    if (!this.dragSelection || !this.selectionGraphics) {
      return;
    }

    const start = this.dragSelection.startScreen;
    const left = Math.min(start.x, pointer.x);
    const top = Math.min(start.y, pointer.y);
    const width = Math.abs(pointer.x - start.x);
    const height = Math.abs(pointer.y - start.y);

    this.selectionGraphics.clear();
    this.selectionGraphics.fillStyle(0xd9c56c, 0.1);
    this.selectionGraphics.lineStyle(1, 0xf7e7a9, 0.9);
    this.selectionGraphics.fillRect(left, top, width, height);
    this.selectionGraphics.strokeRect(left, top, width, height);
  }

  private finishSelectionBox(pointer: Phaser.Input.Pointer): void {
    const drag = this.dragSelection;

    this.dragSelection = undefined;
    this.selectionGraphics?.clear();

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

    for (const unit of this.simulation.getSnapshot().units) {
      if (unit.ownerId !== "player-1") {
        continue;
      }

      const point = gridToScreen(unit.position, this.projection);

      if (
        point.x >= left &&
        point.x <= right &&
        point.y >= top &&
        point.y <= bottom
      ) {
        this.selectedUnitIds.add(unit.id);
      }
    }
  }

  private updateMetrics(delta: number, snapshot: SimulationSnapshot): void {
    if (!this.metricsText) {
      return;
    }

    this.metricsElapsedMs += delta;

    if (this.metricsElapsedMs < 250) {
      return;
    }

    this.metricsElapsedMs = 0;
    this.metricsText.setText([
      `entities: ${snapshot.units.length}`,
      `selected: ${this.selectedUnitIds.size}`,
      `fps: ${Math.round(this.game.loop.actualFps)}`,
      `sim tick: ${this.simulationCostMs.toFixed(2)} ms`,
      `tick: ${snapshot.tick}`
    ]);
  }

  private updateCamera(delta: number): void {
    const camera = this.cameras.main;
    const speed = (520 * delta) / 1000 / camera.zoom;

    if (this.wasd?.up.isDown || this.cursors?.up.isDown) camera.scrollY -= speed;
    if (this.wasd?.down.isDown || this.cursors?.down.isDown) camera.scrollY += speed;
    if (this.wasd?.left.isDown || this.cursors?.left.isDown) camera.scrollX -= speed;
    if (this.wasd?.right.isDown || this.cursors?.right.isDown) camera.scrollX += speed;
  }

  private renderSnapshot(snapshot: SimulationSnapshot): void {
    for (const unit of snapshot.units) {
      const view = this.unitViews.get(unit.id);

      if (!view) {
        continue;
      }

      const point = gridToScreen(unit.position, this.projection);
      view.setPosition(point.x, point.y);
      view.setDepth(point.y);
      view.setStrokeStyle(
        this.selectedUnitIds.has(unit.id) ? 3 : 2,
        this.selectedUnitIds.has(unit.id) ? 0xf7e7a9 : 0x101922,
        1
      );
    }
  }

  private selectOnly(unitId: string): void {
    this.selectedUnitIds.clear();
    this.selectedUnitIds.add(unitId);
  }
}

function createInitialUnits(): UnitState[] {
  const units: UnitState[] = [];

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      const index = row * 10 + column + 1;

      units.push({
        id: `villager-${index}`,
        ownerId: "player-1",
        position: {
          x: 1.4 + column * 0.68,
          y: 2.4 + row * 0.68
        },
        destination: null,
        speed: 2.4
      });
    }
  }

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      const index = row * 10 + column + 1;

      units.push({
        id: `enemy-${index}`,
        ownerId: "player-2",
        position: {
          x: 11.6 + column * 0.68,
          y: 11.2 + row * 0.68
        },
        destination: null,
        speed: 2.2
      });
    }
  }

  return units;
}
