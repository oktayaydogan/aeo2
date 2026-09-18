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
  type IsometricProjection
} from "../isometric";

const MAP_SIZE = 20;
const UNIT_RADIUS = 9;

export class WorldScene extends Phaser.Scene {
  private readonly simulation = new Simulation({
    tickRate: DEFAULT_TICK_RATE,
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
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("world");
  }

  override create(): void {
    this.drawMap();
    this.createUnitViews(this.simulation.getSnapshot());
    this.configureInput();

    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(700, 420);
  }

  override update(_time: number, delta: number): void {
    this.updateCamera(delta);

    this.accumulatorMs += Math.min(delta, 250);

    while (this.accumulatorMs >= this.simulation.tickDurationMs) {
      this.simulation.step();
      this.accumulatorMs -= this.simulation.tickDurationMs;
    }

    this.renderSnapshot(this.simulation.getSnapshot());
  }

  private drawMap(): void {
    const graphics = this.add.graphics();

    for (let y = 0; y < MAP_SIZE; y += 1) {
      for (let x = 0; x < MAP_SIZE; x += 1) {
        const top = gridToScreen({ x, y }, this.projection);
        const right = gridToScreen({ x: x + 1, y }, this.projection);
        const bottom = gridToScreen({ x: x + 1, y: y + 1 }, this.projection);
        const left = gridToScreen({ x, y: y + 1 }, this.projection);

        graphics.fillStyle((x + y) % 2 === 0 ? 0x29483c : 0x2d4e41, 1);
        graphics.lineStyle(1, 0x6d8a73, 0.2);
        graphics.beginPath();
        graphics.moveTo(top.x, top.y);
        graphics.lineTo(right.x, right.y);
        graphics.lineTo(bottom.x, bottom.y);
        graphics.lineTo(left.x, left.y);
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();
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
      circle.setInteractive({ useHandCursor: true });
      circle.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (pointer.leftButtonDown() && unit.ownerId === "player-1") {
          this.selectOnly(unit.id);
        }
      });

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
          if (this.selectedUnitIds.size === 0) return;

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

          return;
        }

        if (pointer.leftButtonDown() && currentlyOver.length === 0) {
          this.selectedUnitIds.clear();
        }
      }
    );

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
      if (!view) continue;

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
  return [
    {
      id: "villager-1",
      ownerId: "player-1",
      position: { x: 5, y: 5 },
      destination: null,
      speed: 2.4
    },
    {
      id: "villager-2",
      ownerId: "player-1",
      position: { x: 6, y: 5.5 },
      destination: null,
      speed: 2.4
    },
    {
      id: "villager-3",
      ownerId: "player-1",
      position: { x: 5.5, y: 6.5 },
      destination: null,
      speed: 2.4
    },
    {
      id: "enemy-1",
      ownerId: "player-2",
      position: { x: 14, y: 13 },
      destination: null,
      speed: 2.2
    }
  ];
}
