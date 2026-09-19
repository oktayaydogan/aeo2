import Phaser from "phaser";
import { BUILDING_DEFINITIONS, UNIT_DEFINITIONS } from "@aeo2/content";
import {
  DEFAULT_TICK_RATE,
  Simulation,
  type BuildingKind,
  type BuildingState,
  type ResourceNodeState,
  type SimulationSnapshot,
  type UnitKind,
  type UnitState
} from "@aeo2/simulation";
import {
  gridToScreen,
  screenToGrid,
  type IsometricProjection,
  type Point2
} from "../isometric";
import { BLOCKED_CELL_KEYS, PROTOTYPE_MAP } from "../prototypeMap";
import { getHudCommandAvailability } from "../hudState";
import { FogOfWar } from "../visibility";

const MAP_SIZE = 20;
const UNIT_RADIUS = 6;
const DRAG_THRESHOLD_PX = 6;
const FOG_UPDATE_INTERVAL_MS = 100;
const MINIMAP_SIZE = 160;
const MINIMAP_MARGIN = 14;
const BENCHMARK_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("benchmark") === "1";

const RESOURCE_NODES: ResourceNodeState[] = [
  {
    id: "tree-1",
    kind: "wood",
    position: { x: 6.3, y: 3.8 },
    amount: 300
  },
  {
    id: "berries-1",
    kind: "food",
    position: { x: 5.4, y: 13.2 },
    amount: 250
  },
  {
    id: "gold-1",
    kind: "gold",
    position: { x: 7.1, y: 15.4 },
    amount: 200
  }
];


interface DragSelectionState {
  startScreen: Point2;
  startWorld: Point2;
}

interface HudButton {
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  command: "house" | "barracks" | "villager" | "militia";
}

export class WorldScene extends Phaser.Scene {
  private readonly simulation = new Simulation({
    tickRate: DEFAULT_TICK_RATE,
    map: PROTOTYPE_MAP,
    units: createInitialUnits(),
    resources: RESOURCE_NODES,
    buildingDefinitions: BUILDING_DEFINITIONS,
    unitDefinitions: UNIT_DEFINITIONS,
    buildings: [
      {
        id: "town-center-1",
        ownerId: "player-1",
        kind: "town-center",
        position: { x: 2, y: 8 },
        progress: 1,
        completed: true,
        hitPoints: 2400,
        trainingQueue: []
      },
      {
        id: "enemy-town-center",
        ownerId: "player-2",
        kind: "town-center",
        position: { x: 14, y: 2 },
        progress: 1,
        completed: true,
        hitPoints: 2400,
        trainingQueue: []
      },
      {
        id: "enemy-house",
        ownerId: "player-2",
        kind: "house",
        position: { x: 15, y: 7 },
        progress: 1,
        completed: true,
        hitPoints: 550,
        trainingQueue: []
      }
    ],
    dropOffPoints: [
      {
        id: "town-center-dropoff",
        ownerId: "player-1",
        position: { x: 1.5, y: 10 }
      }
    ],
    aiPlayers: BENCHMARK_MODE
      ? []
      : [
          {
            playerId: "player-2",
            enemyPlayerId: "player-1",
            thinkIntervalTicks: 400
          }
        ],
    stockpiles: {
      "player-1": {
        wood: 100,
        food: 0,
        gold: 0
      }
    }
  });

  private readonly projection: IsometricProjection = {
    tileWidth: 64,
    tileHeight: 32,
    originX: 700,
    originY: 110
  };

  private readonly unitViews = new Map<string, Phaser.GameObjects.Arc>();
  private readonly unitHealthBars = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly lastUnitHitPoints = new Map<string, number>();
  private readonly unitIdByObject = new Map<Phaser.GameObjects.GameObject, string>();
  private readonly selectedUnitIds = new Set<string>();
  private readonly resourceViews = new Map<string, Phaser.GameObjects.Arc>();
  private readonly resourceLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly resourceIdByObject = new Map<Phaser.GameObjects.GameObject, string>();
  private readonly buildingViews = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly buildingHealthBars = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly lastBuildingHitPoints = new Map<string, number>();
  private readonly buildingLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly buildingIdByObject = new Map<Phaser.GameObjects.GameObject, string>();
  private readonly fog = new FogOfWar(MAP_SIZE, MAP_SIZE);

  private accumulatorMs = 0;
  private fogElapsedMs = 0;
  private metricsElapsedMs = 0;
  private simulationCostMs = 0;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private selectionGraphics?: Phaser.GameObjects.Graphics;
  private placementGraphics?: Phaser.GameObjects.Graphics;
  private fogGraphics?: Phaser.GameObjects.Graphics;
  private minimapGraphics?: Phaser.GameObjects.Graphics;
  private minimapHitArea?: Phaser.GameObjects.Rectangle;
  private hudGraphics?: Phaser.GameObjects.Graphics;
  private metricsText?: Phaser.GameObjects.Text;
  private economyText?: Phaser.GameObjects.Text;
  private selectionTitleText?: Phaser.GameObjects.Text;
  private selectionDetailsText?: Phaser.GameObjects.Text;
  private objectiveText?: Phaser.GameObjects.Text;
  private matchText?: Phaser.GameObjects.Text;
  private readonly hudButtons: HudButton[] = [];
  private dragSelection?: DragSelectionState;
  private placementKind?: BuildingKind;
  private selectedBuildingId?: string;
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
    const initialSnapshot = this.simulation.getSnapshot();
    this.createResourceViews(initialSnapshot);
    this.createUnitViews(initialSnapshot);

    this.selectionGraphics = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(100_000);

    this.placementGraphics = this.add
      .graphics()
      .setDepth(90_000);

    this.fogGraphics = this.add
      .graphics()
      .setDepth(80_000);

    this.minimapGraphics = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(100_002);

    this.minimapHitArea = this.add
      .rectangle(0, 0, MINIMAP_SIZE, MINIMAP_SIZE, 0x000000, 0.001)
      .setScrollFactor(0)
      .setDepth(100_003)
      .setInteractive({ useHandCursor: true });

    this.minimapHitArea.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer) => this.centerCameraFromMinimap(pointer)
    );

    this.hudGraphics = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(100_000);

    this.economyText = this.add
      .text(18, 14, "", {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#f5ead0"
      })
      .setScrollFactor(0)
      .setDepth(100_004);

    this.objectiveText = this.add
      .text(this.scale.width / 2, 16, "Destroy the enemy Town Center", {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "13px",
        color: "#d9cfae"
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100_004);

    this.selectionTitleText = this.add
      .text(24, this.scale.height - 108, "No selection", {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#f5ead0"
      })
      .setScrollFactor(0)
      .setDepth(100_004);

    this.selectionDetailsText = this.add
      .text(24, this.scale.height - 78, "", {
        fontFamily: "Inter, Arial, sans-serif",
        fontSize: "13px",
        color: "#b9c5cc",
        lineSpacing: 4
      })
      .setScrollFactor(0)
      .setDepth(100_004);

    this.createHudButtons();

    this.metricsText = this.add
      .text(14, 54, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#d7e1e7",
        backgroundColor: "#091017bb",
        padding: { x: 8, y: 6 }
      })
      .setScrollFactor(0)
      .setDepth(100_001)
      .setVisible(BENCHMARK_MODE);

    this.matchText = this.add
      .text(this.scale.width / 2, this.scale.height / 2, "", {
        fontFamily: "monospace",
        fontSize: "34px",
        color: "#fff6d5",
        backgroundColor: "#081016ee",
        align: "center",
        padding: { x: 24, y: 18 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200_000)
      .setVisible(false);

    this.configureInput();

    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(700, 420);

    this.updateVisibility(FOG_UPDATE_INTERVAL_MS, initialSnapshot);
    this.renderSnapshot(initialSnapshot);
    this.renderMinimap(initialSnapshot);
    this.updateHud(initialSnapshot);
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
    this.updateVisibility(delta, snapshot);
    this.renderSnapshot(snapshot);
    this.renderMinimap(snapshot);
    this.updateMetrics(delta, snapshot);
    this.layoutHud(snapshot);
    this.updateHud(snapshot);
    this.updateMatchOverlay(snapshot);
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
        graphics.lineStyle(
          1,
          blocked ? 0xa19a83 : 0x6d8a73,
          blocked ? 0.55 : 0.2
        );
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
          graphics.moveTo((top.x + left.x) / 2, (top.y + left.y) / 2);
          graphics.lineTo((right.x + bottom.x) / 2, (right.y + bottom.y) / 2);
          graphics.strokePath();
        }
      }
    }
  }

  private createResourceViews(snapshot: SimulationSnapshot): void {
    for (const resource of snapshot.resources) {
      const point = gridToScreen(resource.position, this.projection);
      const view = this.add
        .circle(
          point.x,
          point.y,
          resource.kind === "wood" ? 13 : 10,
          resourceColor(resource.kind),
          1
        )
        .setStrokeStyle(2, 0x101922, 0.85)
        .setDepth(point.y)
        .setInteractive({ useHandCursor: true });

      const label = this.add
        .text(point.x, point.y + 13, resourceLabel(resource), {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#f6f1df",
          backgroundColor: "#091017bb",
          padding: { x: 3, y: 1 }
        })
        .setOrigin(0.5, 0)
        .setDepth(point.y + 1);

      this.resourceViews.set(resource.id, view);
      this.resourceLabels.set(resource.id, label);
      this.resourceIdByObject.set(view, resource.id);
    }
  }

  private createUnitViews(snapshot: SimulationSnapshot): void {
    for (const unit of snapshot.units) {
      this.ensureUnitView(unit);
    }
  }

  private ensureUnitView(unit: UnitState): Phaser.GameObjects.Arc {
    const existing = this.unitViews.get(unit.id);

    if (existing) {
      return existing;
    }

    const point = gridToScreen(unit.position, this.projection);
    const circle = this.add
      .circle(
        point.x,
        point.y,
        unit.kind === "militia" ? UNIT_RADIUS + 1 : UNIT_RADIUS,
        unitColor(unit),
        1
      )
      .setStrokeStyle(2, 0x101922, 0.8)
      .setDepth(point.y)
      .setInteractive({ useHandCursor: true });

    circle.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown() && unit.ownerId === "player-1") {
        this.selectOnly(unit.id);
      }
    });

    const healthBar = this.add
      .rectangle(point.x, point.y - 12, 18, 3, 0x7ecf7a, 1)
      .setOrigin(0.5, 0.5)
      .setDepth(point.y + 2);

    this.unitViews.set(unit.id, circle);
    this.unitHealthBars.set(unit.id, healthBar);
    this.lastUnitHitPoints.set(unit.id, unit.hitPoints);
    this.unitIdByObject.set(circle, unit.id);
    return circle;
  }

  private createHudButtons(): void {
    const commands: HudButton["command"][] = [
      "house",
      "barracks",
      "villager",
      "militia"
    ];

    for (const command of commands) {
      const background = this.add
        .rectangle(0, 0, 108, 54, 0x18242c, 0.96)
        .setScrollFactor(0)
        .setDepth(100_004)
        .setStrokeStyle(1, 0x60717b, 0.8)
        .setInteractive({ useHandCursor: true });

      const label = this.add
        .text(0, 0, "", {
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: "12px",
          align: "center",
          color: "#f4ead1"
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(100_005);

      background.on("pointerdown", () => {
        if (command === "house" || command === "barracks") {
          this.setPlacementMode(command);
          return;
        }

        this.issueTrainCommand(command);
      });

      this.hudButtons.push({
        background,
        label,
        command
      });
    }
  }

  private layoutHud(snapshot: SimulationSnapshot): void {
    const graphics = this.hudGraphics;

    if (!graphics) {
      return;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const panelHeight = 126;

    graphics.clear();

    if (BENCHMARK_MODE) {
      this.economyText?.setVisible(false);
      this.objectiveText?.setVisible(false);
      this.selectionTitleText?.setVisible(false);
      this.selectionDetailsText?.setVisible(false);

      for (const button of this.hudButtons) {
        button.background.setVisible(false);
        button.label.setVisible(false);
      }

      return;
    }

    this.economyText?.setVisible(true);
    this.objectiveText?.setVisible(true);
    this.selectionTitleText?.setVisible(true);
    this.selectionDetailsText?.setVisible(true);
    graphics.fillStyle(0x081016, 0.9);
    graphics.fillRect(0, 0, width, 44);
    graphics.lineStyle(1, 0x52636d, 0.45);
    graphics.lineBetween(0, 44, width, 44);

    graphics.fillStyle(0x081016, 0.94);
    graphics.fillRect(0, height - panelHeight, width, panelHeight);
    graphics.lineStyle(1, 0x52636d, 0.55);
    graphics.lineBetween(0, height - panelHeight, width, height - panelHeight);

    this.objectiveText?.setPosition(width / 2, 14);
    this.selectionTitleText?.setPosition(24, height - 108);
    this.selectionDetailsText?.setPosition(24, height - 78);

    const buttonStartX = Math.max(360, width - 490);
    const buttonY = height - 64;

    this.hudButtons.forEach((button, index) => {
      const x = buttonStartX + index * 116;
      button.background.setPosition(x, buttonY);
      button.label.setPosition(x, buttonY);
    });

    if (snapshot.match.status === "ended") {
      for (const button of this.hudButtons) {
        this.setHudButtonEnabled(button, false);
      }
    }
  }

  private setHudButtonEnabled(button: HudButton, enabled: boolean): void {
    button.background
      .setAlpha(enabled ? 1 : 0.35)
      .setFillStyle(enabled ? 0x18242c : 0x11181d, 0.96);

    button.label.setAlpha(enabled ? 1 : 0.45);

    if (enabled) {
      button.background.setInteractive({ useHandCursor: true });
    } else {
      button.background.disableInteractive();
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

      this.input.keyboard
        .addKey(Phaser.Input.Keyboard.KeyCodes.H)
        .on("down", () => this.setPlacementMode("house"));
      this.input.keyboard
        .addKey(Phaser.Input.Keyboard.KeyCodes.B)
        .on("down", () => this.setPlacementMode("barracks"));
      this.input.keyboard
        .addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
        .on("down", () => this.setPlacementMode(undefined));
      this.input.keyboard
        .addKey(Phaser.Input.Keyboard.KeyCodes.M)
        .on("down", () => this.issueTrainCommand("militia"));
      this.input.keyboard
        .addKey(Phaser.Input.Keyboard.KeyCodes.V)
        .on("down", () => this.issueTrainCommand("villager"));
      this.input.keyboard
        .addKey(Phaser.Input.Keyboard.KeyCodes.R)
        .on("down", () => {
          if (this.simulation.getSnapshot().match.status === "ended") {
            window.location.reload();
          }
        });
    }

    this.input.on(
      "pointerdown",
      (
        pointer: Phaser.Input.Pointer,
        currentlyOver: Phaser.GameObjects.GameObject[]
      ) => {
        if (pointer.leftButtonDown() && this.placementKind) {
          this.issueBuildCommand(pointer);
          return;
        }

        if (pointer.rightButtonDown()) {
          const resourceId = this.findResourceUnderPointer(currentlyOver);
          const targetUnitId = this.findEnemyUnitUnderPointer(currentlyOver);
          const targetBuildingId =
            this.findEnemyBuildingUnderPointer(currentlyOver);

          if (resourceId) {
            this.issueGatherCommand(resourceId);
          } else if (targetUnitId) {
            this.issueAttackCommand(targetUnitId);
          } else if (targetBuildingId) {
            this.issueAttackBuildingCommand(targetBuildingId);
          } else if (this.selectedBuildingId) {
            this.issueRallyPointCommand(pointer);
          } else {
            this.issueMoveCommand(pointer);
          }

          return;
        }

        if (!pointer.leftButtonDown() || currentlyOver.length > 0) {
          return;
        }

        this.selectedBuildingId = undefined;
        this.selectedUnitIds.clear();
        this.dragSelection = {
          startScreen: { x: pointer.x, y: pointer.y },
          startWorld: { x: pointer.worldX, y: pointer.worldY }
        };
      }
    );

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.placementKind) {
        this.drawPlacementPreview(pointer);
      }

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

  private findResourceUnderPointer(
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): string | undefined {
    for (const gameObject of currentlyOver) {
      const resourceId = this.resourceIdByObject.get(gameObject);

      if (resourceId) {
        return resourceId;
      }
    }

    return undefined;
  }

  private findEnemyUnitUnderPointer(
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): string | undefined {
    const snapshot = this.simulation.getSnapshot();

    for (const gameObject of currentlyOver) {
      const unitId = this.unitIdByObject.get(gameObject);

      if (!unitId) {
        continue;
      }

      const unit = snapshot.units.find((entry) => entry.id === unitId);

      if (unit && unit.ownerId !== "player-1") {
        return unit.id;
      }
    }

    return undefined;
  }

  private findEnemyBuildingUnderPointer(
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): string | undefined {
    const snapshot = this.simulation.getSnapshot();

    for (const gameObject of currentlyOver) {
      const buildingId = this.buildingIdByObject.get(gameObject);

      if (!buildingId) {
        continue;
      }

      const building = snapshot.buildings.find(
        (entry) => entry.id === buildingId
      );

      if (building && building.ownerId !== "player-1") {
        return building.id;
      }
    }

    return undefined;
  }

  private issueAttackBuildingCommand(targetBuildingId: string): void {
    if (this.selectedUnitIds.size === 0) {
      return;
    }

    this.simulation.queueCommand({
      type: "attack-building",
      playerId: "player-1",
      unitIds: [...this.selectedUnitIds],
      targetBuildingId
    });
  }

  private issueAttackCommand(targetUnitId: string): void {
    if (this.selectedUnitIds.size === 0) {
      return;
    }

    this.simulation.queueCommand({
      type: "attack",
      playerId: "player-1",
      unitIds: [...this.selectedUnitIds],
      targetUnitId
    });
  }

  private issueTrainCommand(unitKind: UnitKind): void {
    const buildingId = this.selectedBuildingId;

    if (!buildingId) {
      return;
    }

    this.simulation.queueCommand({
      type: "train",
      playerId: "player-1",
      buildingId,
      unitKind
    });
  }

  private issueGatherCommand(resourceId: string): void {
    if (this.selectedUnitIds.size === 0) {
      return;
    }

    this.simulation.queueCommand({
      type: "gather",
      playerId: "player-1",
      unitIds: [...this.selectedUnitIds],
      resourceId
    });
  }

  private issueBuildCommand(pointer: Phaser.Input.Pointer): void {
    const buildingKind = this.placementKind;

    if (!buildingKind || this.selectedUnitIds.size === 0) {
      return;
    }

    const target = screenToGrid(
      { x: pointer.worldX, y: pointer.worldY },
      this.projection
    );

    this.simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds: [...this.selectedUnitIds],
      buildingKind,
      position: {
        x: Phaser.Math.Clamp(Math.floor(target.x), 0, MAP_SIZE - 1),
        y: Phaser.Math.Clamp(Math.floor(target.y), 0, MAP_SIZE - 1)
      }
    });

    this.setPlacementMode(undefined);
  }

  private setPlacementMode(kind: BuildingKind | undefined): void {
    this.placementKind = kind;
    this.placementGraphics?.clear();
    this.dragSelection = undefined;
    this.selectionGraphics?.clear();
  }

  private drawPlacementPreview(pointer: Phaser.Input.Pointer): void {
    const buildingKind = this.placementKind;
    const graphics = this.placementGraphics;

    if (!buildingKind || !graphics) {
      return;
    }

    const definition = BUILDING_DEFINITIONS.find(
      (entry) => entry.kind === buildingKind
    );

    if (!definition) {
      return;
    }

    const target = screenToGrid(
      { x: pointer.worldX, y: pointer.worldY },
      this.projection
    );
    const origin = {
      x: Phaser.Math.Clamp(Math.floor(target.x), 0, MAP_SIZE - 1),
      y: Phaser.Math.Clamp(Math.floor(target.y), 0, MAP_SIZE - 1)
    };

    graphics.clear();

    for (let y = 0; y < definition.footprint.height; y += 1) {
      for (let x = 0; x < definition.footprint.width; x += 1) {
        const cellX = origin.x + x;
        const cellY = origin.y + y;

        if (cellX >= MAP_SIZE || cellY >= MAP_SIZE) {
          continue;
        }

        const top = gridToScreen({ x: cellX, y: cellY }, this.projection);
        const right = gridToScreen({ x: cellX + 1, y: cellY }, this.projection);
        const bottom = gridToScreen(
          { x: cellX + 1, y: cellY + 1 },
          this.projection
        );
        const left = gridToScreen({ x: cellX, y: cellY + 1 }, this.projection);

        graphics.fillStyle(0xe2c56f, 0.18);
        graphics.lineStyle(2, 0xf7e7a9, 0.9);
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

  private issueRallyPointCommand(pointer: Phaser.Input.Pointer): void {
    const buildingId = this.selectedBuildingId;

    if (!buildingId) {
      return;
    }

    const target = screenToGrid(
      { x: pointer.worldX, y: pointer.worldY },
      this.projection
    );

    this.simulation.queueCommand({
      type: "set-rally-point",
      playerId: "player-1",
      buildingId,
      target: {
        x: Phaser.Math.Clamp(target.x, 0, MAP_SIZE - 0.01),
        y: Phaser.Math.Clamp(target.y, 0, MAP_SIZE - 0.01)
      }
    });
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

  private updateVisibility(
    delta: number,
    snapshot: SimulationSnapshot
  ): void {
    if (BENCHMARK_MODE) {
      return;
    }

    this.fogElapsedMs += delta;

    if (
      this.fogElapsedMs < FOG_UPDATE_INTERVAL_MS &&
      this.fog.exploredCellCount() > 0
    ) {
      return;
    }

    this.fogElapsedMs = 0;

    const unitSources = snapshot.units
      .filter((unit) => unit.ownerId === "player-1")
      .map((unit) => ({
        x: unit.position.x,
        y: unit.position.y,
        radius: unitVisionRadius(unit)
      }));

    const buildingSources = snapshot.buildings
      .filter(
        (building) =>
          building.ownerId === "player-1" && building.completed
      )
      .map((building) => {
        const definition = BUILDING_DEFINITIONS.find(
          (entry) => entry.kind === building.kind
        );

        return {
          x:
            building.position.x +
            (definition?.footprint.width ?? 1) / 2,
          y:
            building.position.y +
            (definition?.footprint.height ?? 1) / 2,
          radius: buildingVisionRadius(building)
        };
      });

    this.fog.update([...unitSources, ...buildingSources]);
    this.renderFog();
  }

  private renderFog(): void {
    const graphics = this.fogGraphics;

    if (!graphics || BENCHMARK_MODE) {
      return;
    }

    graphics.clear();

    for (let y = 0; y < MAP_SIZE; y += 1) {
      for (let x = 0; x < MAP_SIZE; x += 1) {
        const state = this.fog.stateAtCell(x, y);

        if (state === "visible") {
          continue;
        }

        const top = gridToScreen({ x, y }, this.projection);
        const right = gridToScreen({ x: x + 1, y }, this.projection);
        const bottom = gridToScreen(
          { x: x + 1, y: y + 1 },
          this.projection
        );
        const left = gridToScreen({ x, y: y + 1 }, this.projection);

        graphics.fillStyle(
          state === "unexplored" ? 0x020406 : 0x071017,
          state === "unexplored" ? 0.94 : 0.58
        );
        graphics.beginPath();
        graphics.moveTo(top.x, top.y);
        graphics.lineTo(right.x, right.y);
        graphics.lineTo(bottom.x, bottom.y);
        graphics.lineTo(left.x, left.y);
        graphics.closePath();
        graphics.fillPath();
      }
    }
  }

  private renderMinimap(snapshot: SimulationSnapshot): void {
    const graphics = this.minimapGraphics;
    const hitArea = this.minimapHitArea;

    if (!graphics || !hitArea || BENCHMARK_MODE) {
      graphics?.clear();
      hitArea?.setVisible(false);
      return;
    }

    hitArea.setVisible(true);

    const originX = this.minimapOriginX();
    const originY = MINIMAP_MARGIN;
    const cellSize = MINIMAP_SIZE / MAP_SIZE;

    hitArea.setPosition(
      originX + MINIMAP_SIZE / 2,
      originY + MINIMAP_SIZE / 2
    );

    graphics.clear();
    graphics.fillStyle(0x091017, 0.94);
    graphics.fillRect(
      originX - 4,
      originY - 4,
      MINIMAP_SIZE + 8,
      MINIMAP_SIZE + 8
    );

    for (let y = 0; y < MAP_SIZE; y += 1) {
      for (let x = 0; x < MAP_SIZE; x += 1) {
        const state = this.fog.stateAtCell(x, y);

        graphics.fillStyle(
          state === "unexplored"
            ? 0x050709
            : state === "explored"
              ? 0x26372f
              : 0x3f6250,
          1
        );
        graphics.fillRect(
          originX + x * cellSize,
          originY + y * cellSize,
          Math.ceil(cellSize),
          Math.ceil(cellSize)
        );
      }
    }

    for (const resource of snapshot.resources) {
      if (
        this.fog.stateAtPoint(
          resource.position.x,
          resource.position.y
        ) === "unexplored"
      ) {
        continue;
      }

      graphics.fillStyle(resourceColor(resource.kind), 1);
      graphics.fillCircle(
        originX + (resource.position.x / MAP_SIZE) * MINIMAP_SIZE,
        originY + (resource.position.y / MAP_SIZE) * MINIMAP_SIZE,
        2
      );
    }

    for (const building of snapshot.buildings) {
      if (
        building.ownerId !== "player-1" &&
        !this.fog.isVisiblePoint(
          building.position.x,
          building.position.y
        )
      ) {
        continue;
      }

      graphics.fillStyle(
        building.ownerId === "player-1" ? 0xe1ca78 : 0xc7655c,
        1
      );
      graphics.fillRect(
        originX + (building.position.x / MAP_SIZE) * MINIMAP_SIZE - 2,
        originY + (building.position.y / MAP_SIZE) * MINIMAP_SIZE - 2,
        5,
        5
      );
    }

    for (const unit of snapshot.units) {
      const visible =
        unit.ownerId === "player-1" ||
        this.fog.isVisiblePoint(unit.position.x, unit.position.y);

      if (!visible) {
        continue;
      }

      graphics.fillStyle(
        unit.ownerId === "player-1" ? 0xf0dc83 : 0xd66d63,
        1
      );
      graphics.fillCircle(
        originX + (unit.position.x / MAP_SIZE) * MINIMAP_SIZE,
        originY + (unit.position.y / MAP_SIZE) * MINIMAP_SIZE,
        1.8
      );
    }

    const cameraGrid = screenToGrid(
      {
        x: this.cameras.main.midPoint.x,
        y: this.cameras.main.midPoint.y
      },
      this.projection
    );

    graphics.lineStyle(1, 0xffffff, 0.9);
    graphics.strokeRect(
      originX +
        (Phaser.Math.Clamp(cameraGrid.x, 0, MAP_SIZE) / MAP_SIZE) *
          MINIMAP_SIZE -
        7,
      originY +
        (Phaser.Math.Clamp(cameraGrid.y, 0, MAP_SIZE) / MAP_SIZE) *
          MINIMAP_SIZE -
        5,
      14,
      10
    );
  }

  private centerCameraFromMinimap(pointer: Phaser.Input.Pointer): void {
    if (BENCHMARK_MODE) {
      return;
    }

    const originX = this.minimapOriginX();
    const localX = Phaser.Math.Clamp(
      pointer.x - originX,
      0,
      MINIMAP_SIZE
    );
    const localY = Phaser.Math.Clamp(
      pointer.y - MINIMAP_MARGIN,
      0,
      MINIMAP_SIZE
    );

    const mapPoint = {
      x: (localX / MINIMAP_SIZE) * MAP_SIZE,
      y: (localY / MINIMAP_SIZE) * MAP_SIZE
    };
    const worldPoint = gridToScreen(mapPoint, this.projection);

    this.cameras.main.centerOn(worldPoint.x, worldPoint.y);
  }

  private minimapOriginX(): number {
    return Math.max(
      MINIMAP_MARGIN,
      this.scale.width - MINIMAP_SIZE - MINIMAP_MARGIN
    );
  }

  private updateMetrics(
    delta: number,
    snapshot: SimulationSnapshot
  ): void {
    if (!this.metricsText) {
      return;
    }

    this.metricsElapsedMs += delta;

    if (this.metricsElapsedMs < 250) {
      return;
    }

    this.metricsElapsedMs = 0;
    this.metricsText.setText([
      BENCHMARK_MODE ? "mode: benchmark" : "mode: economy",
      `entities: ${snapshot.units.length}`,
      `selected: ${this.selectedUnitIds.size}`,
      `fps: ${Math.round(this.game.loop.actualFps)}`,
      `sim tick: ${this.simulationCostMs.toFixed(2)} ms`,
      `tick: ${snapshot.tick}`,
      BENCHMARK_MODE
        ? "fog: disabled"
        : `vision: ${this.fog.visibleCellCount()} · explored: ${this.fog.exploredCellCount()}/${MAP_SIZE * MAP_SIZE}`
    ]);
  }

  private updateHud(snapshot: SimulationSnapshot): void {
    if (!this.economyText) {
      return;
    }

    const stockpile = snapshot.stockpiles.find(
      (entry) => entry.playerId === "player-1"
    );
    const population = snapshot.population.find(
      (entry) => entry.playerId === "player-1"
    );
    const selectedUnits = snapshot.units.filter((unit) =>
      this.selectedUnitIds.has(unit.id)
    );
    const selectedBuilding = snapshot.buildings.find(
      (building) => building.id === this.selectedBuildingId
    );

    this.economyText.setText(
      `WOOD  ${Math.floor(stockpile?.resources.wood ?? 0)}     FOOD  ${Math.floor(
        stockpile?.resources.food ?? 0
      )}     GOLD  ${Math.floor(
        stockpile?.resources.gold ?? 0
      )}     POP  ${population?.used ?? 0}/${population?.cap ?? 0}${
        population?.queued ? ` (+${population.queued})` : ""
      }`
    );

    if (selectedBuilding) {
      const definition = BUILDING_DEFINITIONS.find(
        (entry) => entry.kind === selectedBuilding.kind
      );
      const queue =
        selectedBuilding.trainingQueue.length > 0
          ? selectedBuilding.trainingQueue
              .map(
                (item, index) =>
                  `${index + 1}. ${item.unitKind} ${Math.round(
                    item.progress * 100
                  )}%`
              )
              .join("   ")
          : "Queue empty";

      this.selectionTitleText?.setText(
        definition?.displayName ?? selectedBuilding.kind
      );
      this.selectionDetailsText?.setText([
        `HP ${Math.ceil(selectedBuilding.hitPoints)}/${
          definition?.maxHitPoints ?? selectedBuilding.hitPoints
        }`,
        queue,
        selectedBuilding.rallyPoint
          ? `Rally ${selectedBuilding.rallyPoint.x.toFixed(
              1
            )}, ${selectedBuilding.rallyPoint.y.toFixed(1)}`
          : "Right-click ground to set rally"
      ]);
    } else if (selectedUnits.length > 0) {
      const primary = selectedUnits[0];
      const sameKind = selectedUnits.every(
        (unit) => unit.kind === primary?.kind
      );
      const label = sameKind
        ? UNIT_DEFINITIONS.find((entry) => entry.kind === primary?.kind)
            ?.displayName ?? primary?.kind ?? "Units"
        : "Mixed units";
      const averageHp =
        selectedUnits.reduce((sum, unit) => sum + unit.hitPoints, 0) /
        selectedUnits.length;
      const carrying = selectedUnits.reduce(
        (sum, unit) => sum + (unit.cargo?.amount ?? 0),
        0
      );

      this.selectionTitleText?.setText(
        selectedUnits.length === 1
          ? label
          : `${selectedUnits.length} × ${label}`
      );
      this.selectionDetailsText?.setText([
        `Average HP ${averageHp.toFixed(0)}`,
        `Activity ${primary?.activity ?? "idle"}`,
        carrying > 0 ? `Carrying ${carrying.toFixed(1)}` : "Ready"
      ]);
    } else {
      this.selectionTitleText?.setText("No selection");
      this.selectionDetailsText?.setText([
        "Select villagers to gather or build.",
        "Select a production building to train units."
      ]);
    }

    const availability = getHudCommandAvailability({
      selectedUnitKinds: selectedUnits.map((unit) => unit.kind),
      selectedBuildingKind: selectedBuilding?.kind,
      selectedBuildingCompleted: selectedBuilding?.completed,
      resources: {
        wood: stockpile?.resources.wood ?? 0,
        food: stockpile?.resources.food ?? 0,
        gold: stockpile?.resources.gold ?? 0
      },
      populationUsed: population?.used ?? 0,
      populationQueued: population?.queued ?? 0,
      populationCap: population?.cap ?? 0,
      matchEnded: snapshot.match.status === "ended"
    });

    const buttonLabels: Record<HudButton["command"], string> = {
      house: "HOUSE\n25 Wood   [H]",
      barracks: "BARRACKS\n75 Wood   [B]",
      villager: "VILLAGER\n50 Food   [V]",
      militia: "MILITIA\n60 Food · 20 Gold   [M]"
    };

    for (const button of this.hudButtons) {
      button.label.setText(buttonLabels[button.command]);
      button.background.setVisible(!BENCHMARK_MODE);
      button.label.setVisible(!BENCHMARK_MODE);
      this.setHudButtonEnabled(
        button,
        !BENCHMARK_MODE && availability[button.command]
      );
    }

    this.objectiveText?.setText(
      snapshot.match.status === "ended"
        ? "Match complete"
        : "Objective · Destroy the enemy Town Center"
    );
  }

  private updateMatchOverlay(snapshot: SimulationSnapshot): void {
    if (!this.matchText) {
      return;
    }

    if (snapshot.match.status !== "ended") {
      this.matchText.setVisible(false);
      return;
    }

    const victory = snapshot.match.winnerPlayerId === "player-1";

    this.matchText
      .setPosition(this.scale.width / 2, this.scale.height / 2)
      .setText([
        victory ? "VICTORY" : "DEFEAT",
        victory
          ? "Enemy Town Center destroyed"
          : "Your Town Center was destroyed",
        "",
        "Press R to restart"
      ])
      .setVisible(true);
  }

  private updateCamera(delta: number): void {
    const camera = this.cameras.main;
    const speed = (520 * delta) / 1000 / camera.zoom;

    if (this.wasd?.up.isDown || this.cursors?.up.isDown) {
      camera.scrollY -= speed;
    }
    if (this.wasd?.down.isDown || this.cursors?.down.isDown) {
      camera.scrollY += speed;
    }
    if (this.wasd?.left.isDown || this.cursors?.left.isDown) {
      camera.scrollX -= speed;
    }
    if (this.wasd?.right.isDown || this.cursors?.right.isDown) {
      camera.scrollX += speed;
    }
  }

  private renderSnapshot(snapshot: SimulationSnapshot): void {
    const liveUnitIds = new Set(snapshot.units.map((unit) => unit.id));
    const liveBuildingIds = new Set(
      snapshot.buildings.map((building) => building.id)
    );

    for (const [buildingId, view] of this.buildingViews) {
      if (liveBuildingIds.has(buildingId)) {
        continue;
      }

      this.buildingIdByObject.delete(view);
      view.destroy();
      this.buildingHealthBars.get(buildingId)?.destroy();
      this.buildingHealthBars.delete(buildingId);
      this.buildingLabels.get(buildingId)?.destroy();
      this.buildingLabels.delete(buildingId);
      this.lastBuildingHitPoints.delete(buildingId);
      this.buildingViews.delete(buildingId);

      if (this.selectedBuildingId === buildingId) {
        this.selectedBuildingId = undefined;
      }
    }

    for (const [unitId, view] of this.unitViews) {
      if (liveUnitIds.has(unitId)) {
        continue;
      }

      this.unitIdByObject.delete(view);
      view.destroy();
      this.unitHealthBars.get(unitId)?.destroy();
      this.unitHealthBars.delete(unitId);
      this.lastUnitHitPoints.delete(unitId);
      this.unitViews.delete(unitId);
      this.selectedUnitIds.delete(unitId);
    }

    for (const unit of snapshot.units) {
      const view = this.ensureUnitView(unit);
      const enemyVisible =
        unit.ownerId === "player-1" ||
        BENCHMARK_MODE ||
        this.fog.isVisiblePoint(unit.position.x, unit.position.y);
      const healthBar = this.unitHealthBars.get(unit.id);

      view.setVisible(enemyVisible);
      healthBar?.setVisible(enemyVisible);

      if (unit.ownerId !== "player-1") {
        if (enemyVisible) {
          view.setInteractive({ useHandCursor: true });
        } else {
          view.disableInteractive();
        }
      }

      if (!enemyVisible) {
        continue;
      }

      const point = gridToScreen(unit.position, this.projection);
      view.setPosition(point.x, point.y);
      view.setDepth(point.y);

      const definition = UNIT_DEFINITIONS.find(
        (entry) => entry.kind === unit.kind
      );
      const maxHitPoints = definition?.maxHitPoints ?? unit.hitPoints;
      const hpRatio = Phaser.Math.Clamp(unit.hitPoints / maxHitPoints, 0, 1);
      healthBar?.setPosition(point.x, point.y - 12);
      healthBar?.setDisplaySize(Math.max(1, 18 * hpRatio), 3);
      healthBar?.setFillStyle(
        hpRatio > 0.6 ? 0x7ecf7a : hpRatio > 0.3 ? 0xe0bd62 : 0xd4655d,
        1
      );
      healthBar?.setDepth(point.y + 2);

      const previousHitPoints = this.lastUnitHitPoints.get(unit.id);
      if (
        previousHitPoints !== undefined &&
        unit.hitPoints < previousHitPoints
      ) {
        view.setFillStyle(0xffffff, 1);
        this.time.delayedCall(90, () => {
          if (view.active) {
            view.setFillStyle(unitColor(unit), 1);
          }
        });
      } else {
        view.setFillStyle(unitColor(unit), 1);
      }
      this.lastUnitHitPoints.set(unit.id, unit.hitPoints);

      const selected = this.selectedUnitIds.has(unit.id);
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

      view.setStrokeStyle(selected ? 3 : 2, selected ? activityColor : 0x101922, 1);
    }

    for (const resource of snapshot.resources) {
      const view = this.resourceViews.get(resource.id);
      const label = this.resourceLabels.get(resource.id);
      const visibility = BENCHMARK_MODE
        ? "visible"
        : this.fog.stateAtPoint(
            resource.position.x,
            resource.position.y
          );
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

    for (const building of snapshot.buildings) {
      const visible =
        building.ownerId === "player-1" ||
        BENCHMARK_MODE ||
        this.fog.isVisiblePoint(
          building.position.x,
          building.position.y
        );

      if (visible) {
        this.renderBuilding(building);
      } else {
        this.buildingViews.get(building.id)?.setVisible(false);
        this.buildingHealthBars.get(building.id)?.setVisible(false);
        this.buildingLabels.get(building.id)?.setVisible(false);
      }
    }
  }

  private renderBuilding(building: BuildingState): void {
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
    const point = gridToScreen(center, this.projection);

    let view = this.buildingViews.get(building.id);
    let label = this.buildingLabels.get(building.id);

    if (!view) {
      view = this.add
        .rectangle(
          point.x,
          point.y - 8,
          28 + definition.footprint.width * 10,
          18 + definition.footprint.height * 7,
          buildingColor(building),
          1
        )
        .setStrokeStyle(2, 0xe4d2ad, 0.9);

      view.setInteractive({ useHandCursor: true });
      view.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (pointer.leftButtonDown() && building.ownerId === "player-1") {
          this.selectedBuildingId = building.id;
          this.selectedUnitIds.clear();
          this.setPlacementMode(undefined);
        }
      });
      this.buildingIdByObject.set(view, building.id);

      const healthBar = this.add
        .rectangle(point.x, point.y - 30, 42, 4, 0x7ecf7a, 1)
        .setOrigin(0.5, 0.5)
        .setDepth(point.y + 2);
      this.buildingHealthBars.set(building.id, healthBar);

      label = this.add
        .text(point.x, point.y + 12, "", {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#f6f1df",
          backgroundColor: "#091017bb",
          padding: { x: 3, y: 1 }
        })
        .setOrigin(0.5, 0);

      this.buildingViews.set(building.id, view);
      this.buildingLabels.set(building.id, label);
      this.lastBuildingHitPoints.set(building.id, building.hitPoints);
    }

    view.setVisible(true);
    label?.setVisible(true);
    this.buildingHealthBars.get(building.id)?.setVisible(true);
    view.setPosition(point.x, point.y - 8);
    view.setDepth(point.y);
    view.setAlpha(0.35 + building.progress * 0.65);
    const maxHitPoints = definition.maxHitPoints;
    const hpRatio = Phaser.Math.Clamp(building.hitPoints / maxHitPoints, 0, 1);
    const healthBar = this.buildingHealthBars.get(building.id);
    healthBar?.setPosition(point.x, point.y - 30);
    healthBar?.setDisplaySize(Math.max(1, 42 * hpRatio), 4);
    healthBar?.setFillStyle(
      hpRatio > 0.6 ? 0x7ecf7a : hpRatio > 0.3 ? 0xe0bd62 : 0xd4655d,
      1
    );
    healthBar?.setDepth(point.y + 2);

    const previousHitPoints = this.lastBuildingHitPoints.get(building.id);
    if (
      previousHitPoints !== undefined &&
      building.hitPoints < previousHitPoints
    ) {
      view.setFillStyle(0xffffff, 1);
      this.time.delayedCall(100, () => {
        if (view.active) {
          view.setFillStyle(buildingColor(building), 1);
        }
      });
    } else {
      view.setFillStyle(buildingColor(building), 1);
    }
    this.lastBuildingHitPoints.set(building.id, building.hitPoints);

    const selected = this.selectedBuildingId === building.id;

    view.setStrokeStyle(
      selected ? 4 : building.completed ? 3 : 2,
      selected
        ? 0xf7e7a9
        : building.completed
          ? 0xc9ddb5
          : 0xe4d2ad,
      0.9
    );

    if (label) {
      label.setPosition(point.x, point.y + 12);
      label.setDepth(point.y + 1);
      const queue = building.trainingQueue[0];
      const queueLabel = queue
        ? ` · ${queue.unitKind.toUpperCase()} ${Math.round(queue.progress * 100)}%`
        : "";

      const rallyLabel = building.rallyPoint
        ? ` · RALLY ${building.rallyPoint.x.toFixed(1)},${building.rallyPoint.y.toFixed(1)}`
        : "";

      label.setText(
        `${definition.displayName.toUpperCase()} ${Math.round(
          building.progress * 100
        )}% · HP ${Math.ceil(building.hitPoints)}/${definition.maxHitPoints}${queueLabel}${rallyLabel}`
      );
    }
  }

  private selectOnly(unitId: string): void {
    this.selectedBuildingId = undefined;
    this.selectedUnitIds.clear();
    this.selectedUnitIds.add(unitId);
  }
}

function createInitialUnits(): UnitState[] {
  return BENCHMARK_MODE ? createBenchmarkUnits() : createEconomyUnits();
}

function createEconomyUnits(): UnitState[] {
  const units: UnitState[] = [];

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const index = row * 4 + column + 1;

      units.push({
        id: `villager-${index}`,
        ownerId: "player-1",
        kind: "villager",
        position: {
          x: 2.0 + column * 0.75,
          y: 7.0 + row * 0.75
        },
        destination: null,
        speed: 2.4,
        hitPoints: 25,
        activity: "idle",
        cargo: null
      });
    }
  }

  for (let index = 0; index < 6; index += 1) {
    units.push({
      id: `enemy-${index + 1}`,
      ownerId: "player-2",
      kind: "militia",
      position: {
        x: 12.0 + (index % 3) * 0.85,
        y: 11.0 + Math.floor(index / 3) * 0.85
      },
      destination: null,
      speed: 2.5,
      hitPoints: 40,
      activity: "idle",
      cargo: null
    });
  }

  return units;
}

function createBenchmarkUnits(): UnitState[] {
  const units: UnitState[] = [];

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      const index = row * 10 + column + 1;

      units.push({
        id: `villager-${index}`,
        ownerId: "player-1",
        kind: "villager",
        position: {
          x: 1.4 + column * 0.68,
          y: 2.4 + row * 0.68
        },
        destination: null,
        speed: 2.4,
        hitPoints: 25,
        activity: "idle",
        cargo: null
      });
    }
  }

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      const index = row * 10 + column + 1;

      units.push({
        id: `enemy-${index}`,
        ownerId: "player-2",
        kind: "militia",
        position: {
          x: 11.6 + column * 0.68,
          y: 11.2 + row * 0.68
        },
        destination: null,
        speed: 2.5,
        hitPoints: 40,
        activity: "idle",
        cargo: null
      });
    }
  }

  return units;
}

function unitVisionRadius(unit: UnitState): number {
  return unit.kind === "militia" ? 5.2 : 4.4;
}

function buildingVisionRadius(building: BuildingState): number {
  if (building.kind === "town-center") {
    return 6.4;
  }

  return building.kind === "barracks" ? 4.6 : 3.6;
}

function buildingColor(building: BuildingState): number {
  if (building.ownerId !== "player-1") {
    return building.kind === "town-center"
      ? 0x8f4c48
      : building.kind === "house"
        ? 0x854d43
        : 0x74453f;
  }

  return building.kind === "town-center"
    ? 0x8b6b45
    : building.kind === "house"
      ? 0x9a744c
      : 0x7d5148;
}

function unitColor(unit: UnitState): number {
  if (unit.ownerId !== "player-1") {
    return 0xb35c52;
  }

  return unit.kind === "militia" ? 0x8fb3cf : 0xd9c56c;
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

function resourceLabel(resource: ResourceNodeState): string {
  const name =
    resource.kind === "wood"
      ? "TREE"
      : resource.kind === "food"
        ? "BERRIES"
        : "GOLD";

  return `${name} ${Math.ceil(resource.amount)}`;
}
