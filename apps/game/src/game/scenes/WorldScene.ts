import Phaser from "phaser";
import {
  BUILDING_DEFINITIONS,
  TECHNOLOGY_DEFINITIONS,
  UNIT_DEFINITIONS
} from "@aeo2/content";
import {
  DEFAULT_TICK_RATE,
  Simulation,
  type BuildingKind,
  type BuildingState,
  type ResourceNodeState,
  type SimulationSnapshot,
  type TechnologyKind,
  type UnitKind,
  type UnitState
} from "@aeo2/simulation";
import {
  gridToScreen,
  screenToGrid,
  type IsometricProjection
} from "../isometric";
import { CameraController } from "../input/CameraController";
import { CommandController } from "../input/CommandController";
import { HotkeyController } from "../input/HotkeyController";
import { SelectionController } from "../input/SelectionController";
import {
  DEFAULT_BENCHMARK_BUDGET,
  summarizeBenchmark,
  type BenchmarkResult
} from "../benchmark";
import { PROTOTYPE_MAP } from "../prototypeMap";
import { createSkirmishSetup } from "../skirmishMap";
import { getHudCommandAvailability } from "../hudState";
import { createPrototypeTextures } from "../prototypeTextures";
import { FogOfWar } from "../visibility";

const MAP_SIZE = 20;
const UNIT_RADIUS = 6;
const FOG_UPDATE_INTERVAL_MS = 100;
const MINIMAP_SIZE = 160;
const MINIMAP_MARGIN = 14;
const BENCHMARK_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("benchmark") === "1";
const BENCHMARK_AUTORUN =
  BENCHMARK_MODE &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("autorun") === "1";
const BENCHMARK_DURATION_MS = 10_000;
const BENCHMARK_ORDER_INTERVAL_MS = 1_000;

const DEFAULT_SKIRMISH_SEED = 20260920;
const SKIRMISH_SEED = readSkirmishSeed();
const SKIRMISH_SETUP = createSkirmishSetup(SKIRMISH_SEED);

const PROTOTYPE_RESOURCE_NODES: ResourceNodeState[] = [
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

const ACTIVE_MAP = BENCHMARK_MODE
  ? PROTOTYPE_MAP
  : SKIRMISH_SETUP.map;
const RESOURCE_NODES = BENCHMARK_MODE
  ? PROTOTYPE_RESOURCE_NODES
  : SKIRMISH_SETUP.resources;
const ACTIVE_BLOCKED_CELL_KEYS = new Set(
  (ACTIVE_MAP.blocked ?? []).map(
    (cell) => `${cell.x},${cell.y}`
  )
);


interface HudButton {
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  command:
    | "house"
    | "barracks"
    | "archery-range"
    | "villager"
    | "militia"
    | "spearman"
    | "archer"
    | "forged-weapons";
}

export class WorldScene extends Phaser.Scene {
  private readonly simulation = new Simulation({
    tickRate: DEFAULT_TICK_RATE,
    map: ACTIVE_MAP,
    units: createInitialUnits(),
    resources: RESOURCE_NODES,
    buildingDefinitions: BUILDING_DEFINITIONS,
    unitDefinitions: UNIT_DEFINITIONS,
    technologyDefinitions: TECHNOLOGY_DEFINITIONS,
    buildings: [
      {
        id: "town-center-1",
        ownerId: "player-1",
        kind: "town-center",
        position: BENCHMARK_MODE
          ? { x: 2, y: 8 }
          : { ...SKIRMISH_SETUP.player.townCenter },
        progress: 1,
        completed: true,
        hitPoints: 2400,
        trainingQueue: []
      },
      {
        id: "enemy-town-center",
        ownerId: "player-2",
        kind: "town-center",
        position: BENCHMARK_MODE
          ? { x: 14, y: 2 }
          : { ...SKIRMISH_SETUP.enemy.townCenter },
        progress: 1,
        completed: true,
        hitPoints: 2400,
        trainingQueue: []
      },
      {
        id: "player-house",
        ownerId: "player-1",
        kind: "house",
        position: BENCHMARK_MODE
          ? { x: 3, y: 4 }
          : { ...SKIRMISH_SETUP.player.house },
        progress: 1,
        completed: true,
        hitPoints: 550,
        trainingQueue: []
      },
      {
        id: "enemy-house",
        ownerId: "player-2",
        kind: "house",
        position: BENCHMARK_MODE
          ? { x: 15, y: 7 }
          : { ...SKIRMISH_SETUP.enemy.house },
        progress: 1,
        completed: true,
        hitPoints: 550,
        trainingQueue: []
      },
    ],
    dropOffPoints: [
      {
        id: "town-center-dropoff",
        ownerId: "player-1",
        position: BENCHMARK_MODE
          ? { x: 1.5, y: 10 }
          : { ...SKIRMISH_SETUP.player.dropOff }
      },
      {
        id: "enemy-town-center-dropoff",
        ownerId: "player-2",
        position: BENCHMARK_MODE
          ? { x: 13.5, y: 4 }
          : { ...SKIRMISH_SETUP.enemy.dropOff }
      }
    ],
    aiPlayers: BENCHMARK_MODE
      ? []
      : [
          {
            playerId: "player-2",
            enemyPlayerId: "player-1",
            thinkIntervalTicks: 40,
            targetVillagers: 4,
            targetMilitary: 7,
            attackThreshold: 5
          }
        ],
    stockpiles: {
      "player-1": {
        wood: 100,
        food: 0,
        gold: 0
      },
      "player-2": {
        wood: 25,
        food: 100,
        gold: 45
      }
    }
  });

  private readonly projection: IsometricProjection = {
    tileWidth: 64,
    tileHeight: 32,
    originX: 700,
    originY: 110
  };

  private readonly unitViews = new Map<string, Phaser.GameObjects.Image>();
  private readonly unitHealthBars = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly lastUnitHitPoints = new Map<string, number>();
  private readonly unitIdByObject = new Map<Phaser.GameObjects.GameObject, string>();
  private readonly selectedUnitIds = new Set<string>();
  private readonly resourceViews = new Map<string, Phaser.GameObjects.Image>();
  private readonly resourceLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly resourceIdByObject = new Map<Phaser.GameObjects.GameObject, string>();
  private readonly buildingViews = new Map<string, Phaser.GameObjects.Image>();
  private readonly buildingHealthBars = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly lastBuildingHitPoints = new Map<string, number>();
  private readonly buildingLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly buildingIdByObject = new Map<Phaser.GameObjects.GameObject, string>();
  private readonly fog = new FogOfWar(MAP_SIZE, MAP_SIZE);

  private accumulatorMs = 0;
  private fogElapsedMs = 0;
  private metricsElapsedMs = 0;
  private simulationCostMs = 0;
  private benchmarkElapsedMs = 0;
  private benchmarkOrderElapsedMs = 0;
  private benchmarkOrderPhase = 0;
  private readonly benchmarkFpsSamples: number[] = [];
  private readonly benchmarkSimulationSamples: number[] = [];
  private benchmarkResult?: BenchmarkResult;
  private cameraController?: CameraController;
  private commandController?: CommandController;
  private hotkeyController?: HotkeyController;
  private selectionController?: SelectionController;
  private selectionGraphics?: Phaser.GameObjects.Graphics;
  private unitSelectionGraphics?: Phaser.GameObjects.Graphics;
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
  private placementKind?: BuildingKind;
  private selectedBuildingId?: string;

  constructor() {
    super("world");
  }

  create(): void {
    createPrototypeTextures(this);
    this.drawMap();
    const initialSnapshot = this.simulation.getSnapshot();
    this.createResourceViews(initialSnapshot);
    this.createUnitViews(initialSnapshot);

    this.selectionGraphics = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(100_000);

    this.unitSelectionGraphics = this.add
      .graphics()
      .setDepth(79_999);

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
    this.cameraController?.update(delta);
    this.accumulatorMs += Math.min(delta, 250);

    while (this.accumulatorMs >= this.simulation.tickDurationMs) {
      const stepStartedAt = performance.now();
      this.simulation.step();
      this.simulationCostMs = performance.now() - stepStartedAt;

      if (BENCHMARK_AUTORUN && !this.benchmarkResult) {
        this.benchmarkSimulationSamples.push(this.simulationCostMs);
      }

      this.accumulatorMs -= this.simulation.tickDurationMs;
    }

    const snapshot = this.simulation.getSnapshot();
    this.updateBenchmark(delta, snapshot);
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
        const blocked = ACTIVE_BLOCKED_CELL_KEYS.has(`${x},${y}`);

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
        .image(
          point.x,
          point.y - 8,
          resourceTextureKey(resource.kind)
        )
        .setOrigin(0.5, 0.8)
        .setDepth(point.y)
        .setInteractive({ useHandCursor: true });

      const label = this.add
        .text(point.x, point.y + 10, resourceLabel(resource), {
          fontFamily: "Inter, Arial, sans-serif",
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

  private ensureUnitView(unit: UnitState): Phaser.GameObjects.Image {
    const existing = this.unitViews.get(unit.id);

    if (existing) {
      return existing;
    }

    const point = gridToScreen(unit.position, this.projection);
    const image = this.add
      .image(
        point.x,
        point.y - 7,
        unitTextureKey(unit.kind)
      )
      .setOrigin(0.5, 0.82)
      .setDepth(point.y)
      .setTint(unitTint(unit))
      .setInteractive({ useHandCursor: true });

    image.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown() && unit.ownerId === "player-1") {
        this.selectionController?.selectOnlyUnit(unit.id);
      }
    });

    const healthBar = this.add
      .rectangle(point.x, point.y - 23, 18, 3, 0x7ecf7a, 1)
      .setOrigin(0.5, 0.5)
      .setDepth(point.y + 2);

    this.unitViews.set(unit.id, image);
    this.unitHealthBars.set(unit.id, healthBar);
    this.lastUnitHitPoints.set(unit.id, unit.hitPoints);
    this.unitIdByObject.set(image, unit.id);
    return image;
  }

  private createHudButtons(): void {
    const commands: HudButton["command"][] = [
      "house",
      "barracks",
      "archery-range",
      "villager",
      "militia",
      "spearman",
      "archer",
      "forged-weapons"
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
        if (
          command === "house" ||
          command === "barracks" ||
          command === "archery-range"
        ) {
          this.setPlacementMode(command);
          return;
        }

        if (command === "forged-weapons") {
          this.issueResearchCommand(command);
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

    const buttonStartX = Math.max(350, width - 480);
    const firstRowY = height - 92;

    this.hudButtons.forEach((button, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const x = buttonStartX + column * 116;
      const y = firstRowY + row * 58;
      button.background.setPosition(x, y);
      button.label.setPosition(x, y);
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
    if (!this.selectionGraphics) {
      throw new Error("Selection graphics must exist before input is configured.");
    }

    this.cameraController = new CameraController(this);
    this.cameraController.configure();

    this.commandController = new CommandController(this.input, {
      isPlacementActive: () => this.placementKind !== undefined,
      issueBuild: (pointer) => this.issueBuildCommand(pointer),
      drawPlacementPreview: (pointer) => this.drawPlacementPreview(pointer),
      findResource: (currentlyOver) =>
        this.findResourceUnderPointer(currentlyOver),
      findEnemyUnit: (currentlyOver) =>
        this.findEnemyUnitUnderPointer(currentlyOver),
      findEnemyBuilding: (currentlyOver) =>
        this.findEnemyBuildingUnderPointer(currentlyOver),
      hasSelectedBuilding: () => this.selectedBuildingId !== undefined,
      issueGather: (resourceId) => this.issueGatherCommand(resourceId),
      issueAttack: (targetUnitId) => this.issueAttackCommand(targetUnitId),
      issueAttackBuilding: (targetBuildingId) =>
        this.issueAttackBuildingCommand(targetBuildingId),
      issueRallyPoint: (pointer) => this.issueRallyPointCommand(pointer),
      issueMove: (pointer) => this.issueMoveCommand(pointer)
    });
    this.commandController.configure();

    this.selectionController = new SelectionController({
      input: this.input,
      graphics: this.selectionGraphics,
      selectedUnitIds: this.selectedUnitIds,
      projection: this.projection,
      getSnapshot: () => this.simulation.getSnapshot(),
      isPlacementActive: () => this.placementKind !== undefined,
      setSelectedBuildingId: (buildingId) => {
        this.selectedBuildingId = buildingId;
      },
      cancelPlacement: () => this.setPlacementMode(undefined)
    });
    this.selectionController.configure();

    this.hotkeyController = new HotkeyController(this.input.keyboard, {
      placeHouse: () => this.setPlacementMode("house"),
      placeBarracks: () => this.setPlacementMode("barracks"),
      placeArcheryRange: () => this.setPlacementMode("archery-range"),
      cancelPlacement: () => this.setPlacementMode(undefined),
      trainMilitia: () => this.issueTrainCommand("militia"),
      trainVillager: () => this.issueTrainCommand("villager"),
      trainArcher: () => this.issueTrainCommand("archer"),
      trainSpearman: () => this.issueTrainCommand("spearman"),
      researchForgedWeapons: () =>
        this.issueResearchCommand("forged-weapons"),
      restartEndedMatch: () => {
        if (this.simulation.getSnapshot().match.status === "ended") {
          window.location.reload();
        }
      }
    });
    this.hotkeyController.configure();
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

  private issueResearchCommand(
    technologyKind: TechnologyKind
  ): void {
    const buildingId = this.selectedBuildingId;

    if (!buildingId) {
      return;
    }

    this.simulation.queueCommand({
      type: "research",
      playerId: "player-1",
      buildingId,
      technologyKind
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
    if (this.selectionController) {
      this.selectionController.cancelDrag();
    } else {
      this.selectionGraphics?.clear();
    }
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

  private updateBenchmark(
    delta: number,
    snapshot: SimulationSnapshot
  ): void {
    if (!BENCHMARK_AUTORUN || this.benchmarkResult) {
      return;
    }

    this.benchmarkElapsedMs += delta;
    this.benchmarkOrderElapsedMs += delta;

    const fps = this.game.loop.actualFps;
    if (Number.isFinite(fps) && fps > 0) {
      this.benchmarkFpsSamples.push(fps);
    }

    if (this.benchmarkOrderElapsedMs >= BENCHMARK_ORDER_INTERVAL_MS) {
      this.benchmarkOrderElapsedMs %= BENCHMARK_ORDER_INTERVAL_MS;

      const playerUnits = snapshot.units
        .filter((unit) => unit.ownerId === "player-1")
        .map((unit) => unit.id);
      const enemyUnits = snapshot.units
        .filter((unit) => unit.ownerId === "player-2")
        .map((unit) => unit.id);
      const phase = this.benchmarkOrderPhase % 2;

      this.simulation.queueCommand({
        type: "move",
        playerId: "player-1",
        unitIds: playerUnits,
        target: phase === 0
          ? { x: 15.5, y: 15.5 }
          : { x: 4.5, y: 4.5 }
      });
      this.simulation.queueCommand({
        type: "move",
        playerId: "player-2",
        unitIds: enemyUnits,
        target: phase === 0
          ? { x: 4.5, y: 4.5 }
          : { x: 15.5, y: 15.5 }
      });
      this.benchmarkOrderPhase += 1;
    }

    if (this.benchmarkElapsedMs < BENCHMARK_DURATION_MS) {
      return;
    }

    this.benchmarkResult = summarizeBenchmark(
      this.benchmarkFpsSamples,
      this.benchmarkSimulationSamples
    );

    if (typeof window !== "undefined") {
      (
        window as Window & {
          __AEO2_BENCHMARK__?: BenchmarkResult;
        }
      ).__AEO2_BENCHMARK__ = { ...this.benchmarkResult };
    }
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
    const benchmarkLines =
      BENCHMARK_AUTORUN
        ? this.benchmarkResult
          ? [
              `benchmark: ${this.benchmarkResult.passed ? "PASS" : "FAIL"}`,
              `avg fps: ${this.benchmarkResult.averageFps.toFixed(1)} / >= ${DEFAULT_BENCHMARK_BUDGET.minimumAverageFps}`,
              `sim p95: ${this.benchmarkResult.p95SimulationMs.toFixed(2)} ms / <= ${DEFAULT_BENCHMARK_BUDGET.maximumP95SimulationMs} ms`,
              `samples: ${this.benchmarkResult.sampleCount}`
            ]
          : [
              `benchmark: running ${Math.min(
                100,
                Math.round(
                  (this.benchmarkElapsedMs / BENCHMARK_DURATION_MS) * 100
                )
              )}%`
            ]
        : [];

    this.metricsText.setText([
      BENCHMARK_MODE ? "mode: benchmark" : "mode: economy",
      `entities: ${snapshot.units.length}`,
      `selected: ${this.selectedUnitIds.size}`,
      `fps: ${Math.round(this.game.loop.actualFps)}`,
      `sim tick: ${this.simulationCostMs.toFixed(2)} ms`,
      `tick: ${snapshot.tick}`,
      ...benchmarkLines,
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
    const playerTechnologies =
      snapshot.technologies.find(
        (entry) => entry.playerId === "player-1"
      )?.researched ?? [];

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
      const trainingQueue =
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
      const researchItem = selectedBuilding.researchQueue?.[0];
      const researchQueue = researchItem
        ? `Research ${researchItem.technologyKind} ${Math.round(
            researchItem.progress * 100
          )}%`
        : playerTechnologies.length > 0
          ? `Tech ${playerTechnologies.join(", ")}`
          : "No research";

      this.selectionTitleText?.setText(
        definition?.displayName ?? selectedBuilding.kind
      );
      this.selectionDetailsText?.setText([
        `HP ${Math.ceil(selectedBuilding.hitPoints)}/${
          definition?.maxHitPoints ?? selectedBuilding.hitPoints
        }`,
        trainingQueue,
        researchQueue,
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
      selectedBuildingResearchBusy:
        (selectedBuilding?.researchQueue?.length ?? 0) > 0,
      researchedTechnologies: playerTechnologies,
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
      "archery-range": "ARCHERY RANGE\n100 Wood   [X]",
      villager: "VILLAGER\n50 Food   [V]",
      militia: "MILITIA\n60 Food · 20 Gold   [M]",
      spearman: "SPEARMAN\n25 Wood · 45 Food   [P]",
      archer: "ARCHER\n25 Wood · 45 Gold   [C]",
      "forged-weapons": "FORGED WEAPONS\n75 Food · 75 Gold   [F]"
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
        : `Objective · Destroy the enemy Town Center · Seed ${SKIRMISH_SEED}`
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

  private renderSnapshot(snapshot: SimulationSnapshot): void {
    this.unitSelectionGraphics?.clear();

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

      const previousHitPoints = this.lastUnitHitPoints.get(unit.id);
      if (
        previousHitPoints !== undefined &&
        unit.hitPoints < previousHitPoints
      ) {
        view.setTint(0xffffff);
        this.time.delayedCall(90, () => {
          if (view.active) {
            view.setTint(unitTint(unit));
          }
        });
      } else {
        view.setTint(unitTint(unit));
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

      if (selected && this.unitSelectionGraphics) {
        this.unitSelectionGraphics.lineStyle(2, activityColor, 0.95);
        this.unitSelectionGraphics.strokeEllipse(point.x, point.y + 2, 24, 10);
      }
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
        .image(
          point.x,
          point.y - 10,
          `building-${building.kind}`
        )
        .setOrigin(0.5, 0.8)
        .setTint(buildingTint(building))
        .setDepth(point.y)
        .setInteractive({ useHandCursor: true });

      const displayScale =
        building.kind === "town-center"
          ? 1
          : building.kind === "barracks"
            ? 0.86
            : 0.78;
      view.setScale(displayScale);

      view.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (pointer.leftButtonDown() && building.ownerId === "player-1") {
          this.selectionController?.selectOnlyBuilding(building.id);
        }
      });
      this.buildingIdByObject.set(view, building.id);

      const healthBar = this.add
        .rectangle(point.x, point.y - 48, 48, 4, 0x7ecf7a, 1)
        .setOrigin(0.5, 0.5)
        .setDepth(point.y + 2);
      this.buildingHealthBars.set(building.id, healthBar);

      label = this.add
        .text(point.x, point.y + 10, "", {
          fontFamily: "Inter, Arial, sans-serif",
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
    view.setPosition(point.x, point.y - 10);
    view.setDepth(point.y);
    view.setAlpha(0.35 + building.progress * 0.65);
    view.setTint(buildingTint(building));

    const maxHitPoints = definition.maxHitPoints;
    const hpRatio = Phaser.Math.Clamp(building.hitPoints / maxHitPoints, 0, 1);
    const healthBar = this.buildingHealthBars.get(building.id);
    healthBar?.setPosition(point.x, point.y - 48);
    healthBar?.setDisplaySize(Math.max(1, 48 * hpRatio), 4);
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
      view.setTint(0xffffff);
      this.time.delayedCall(100, () => {
        if (view.active) {
          view.setTint(buildingTint(building));
        }
      });
    }
    this.lastBuildingHitPoints.set(building.id, building.hitPoints);

    const selected = this.selectedBuildingId === building.id;
    view.setScale(
      (building.kind === "town-center"
        ? 1
        : building.kind === "barracks"
          ? 0.86
          : 0.78) * (selected ? 1.06 : 1)
    );

    if (label) {
      label.setPosition(point.x, point.y + 10);
      label.setDepth(point.y + 1);
      const queue = building.trainingQueue[0];
      const queueLabel = queue
        ? ` · ${queue.unitKind.toUpperCase()} ${Math.round(queue.progress * 100)}%`
        : "";

      const rallyLabel = building.rallyPoint
        ? ` · RALLY`
        : "";

      label.setText(
        `${definition.displayName.toUpperCase()} · HP ${Math.ceil(
          building.hitPoints
        )}/${definition.maxHitPoints}${queueLabel}${rallyLabel}`
      );
    }
  }

}

function createInitialUnits(): UnitState[] {
  return BENCHMARK_MODE ? createBenchmarkUnits() : createEconomyUnits();
}

function createEconomyUnits(): UnitState[] {
  const units: UnitState[] = [];
  const playerOrigin = SKIRMISH_SETUP.player.unitsOrigin;
  const enemyOrigin = SKIRMISH_SETUP.enemy.unitsOrigin;

  for (let row = 0; row < 2; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const index = row * 4 + column + 1;

      units.push({
        id: `villager-${index}`,
        ownerId: "player-1",
        kind: "villager",
        position: {
          x: playerOrigin.x + column * 0.7,
          y: playerOrigin.y + row * 0.7
        },
        destination: null,
        speed: 2.4,
        hitPoints: 25,
        activity: "idle",
        cargo: null
      });
    }
  }

  for (let index = 0; index < 2; index += 1) {
    units.push({
      id: `enemy-villager-${index + 1}`,
      ownerId: "player-2",
      kind: "villager",
      position: {
        x: enemyOrigin.x - index * 0.7,
        y: enemyOrigin.y
      },
      destination: null,
      speed: 2.4,
      hitPoints: 25,
      activity: "idle",
      cargo: null
    });
  }

  units.push({
    id: "enemy-militia-1",
    ownerId: "player-2",
    kind: "militia",
    position: {
      x: enemyOrigin.x - 1.4,
      y: enemyOrigin.y + 1.2
    },
    destination: null,
    speed: 2.5,
    hitPoints: 40,
    activity: "idle",
    cargo: null
  });

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

function readSkirmishSeed(): number {
  if (typeof window === "undefined") {
    return DEFAULT_SKIRMISH_SEED;
  }

  const raw = new URLSearchParams(window.location.search).get("seed");
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;

  return Number.isFinite(parsed)
    ? parsed
    : DEFAULT_SKIRMISH_SEED;
}

function unitVisionRadius(unit: UnitState): number {
  if (unit.kind === "archer") {
    return 6;
  }

  if (unit.kind === "spearman") {
    return 5.4;
  }

  return unit.kind === "militia" ? 5.2 : 4.4;
}

function buildingVisionRadius(building: BuildingState): number {
  if (building.kind === "town-center") {
    return 6.4;
  }

  if (
    building.kind === "barracks" ||
    building.kind === "archery-range"
  ) {
    return 4.6;
  }

  return 3.6;
}

function unitTextureKey(kind: UnitKind): string {
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

function resourceTextureKey(
  kind: ResourceNodeState["kind"]
): string {
  return kind === "wood"
    ? "resource-wood"
    : kind === "food"
      ? "resource-food"
      : "resource-gold";
}

function buildingTint(building: BuildingState): number {
  return building.ownerId === "player-1" ? 0xffffff : 0xd77a72;
}

function unitTint(unit: UnitState): number {
  return unit.ownerId === "player-1" ? 0xffffff : 0xd77a72;
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
