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
import { HudAdapter } from "../adapters/HudAdapter";
import { MinimapAdapter } from "../adapters/MinimapAdapter";
import {
  DEFAULT_BENCHMARK_BUDGET,
  summarizeBenchmark,
  type BenchmarkResult
} from "../benchmark";
import { PROTOTYPE_MAP } from "../prototypeMap";
import { createSkirmishSetup } from "../skirmishMap";
import { createPrototypeTextures } from "../prototypeTextures";
import { BuildingRenderer } from "../renderers/BuildingRenderer";
import { CommandFeedbackRenderer } from "../renderers/CommandFeedbackRenderer";
import { FogRenderer } from "../renderers/FogRenderer";
import { ResourceRenderer } from "../renderers/ResourceRenderer";
import { SelectionRenderer } from "../renderers/SelectionRenderer";
import { UnitRenderer } from "../renderers/UnitRenderer";

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

  private readonly selectedUnitIds = new Set<string>();

  private accumulatorMs = 0;
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
  private buildingRenderer?: BuildingRenderer;
  private commandFeedbackRenderer?: CommandFeedbackRenderer;
  private fogRenderer?: FogRenderer;
  private resourceRenderer?: ResourceRenderer;
  private selectionRenderer?: SelectionRenderer;
  private unitRenderer?: UnitRenderer;
  private selectionGraphics?: Phaser.GameObjects.Graphics;
  private placementGraphics?: Phaser.GameObjects.Graphics;
  private hudAdapter?: HudAdapter;
  private minimapAdapter?: MinimapAdapter;
  private metricsText?: Phaser.GameObjects.Text;
  private placementKind?: BuildingKind;
  private selectedBuildingId?: string;

  constructor() {
    super("world");
  }

  create(): void {
    createPrototypeTextures(this);
    this.drawMap();
    const initialSnapshot = this.simulation.getSnapshot();

    this.selectionGraphics = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(100_000);

    this.selectionRenderer = new SelectionRenderer(this);
    this.commandFeedbackRenderer = new CommandFeedbackRenderer(this);
    this.resourceRenderer = new ResourceRenderer(this, this.projection);
    this.unitRenderer = new UnitRenderer({
      scene: this,
      projection: this.projection,
      selectionRenderer: this.selectionRenderer,
      selectedUnitIds: this.selectedUnitIds,
      onSelectOwnUnit: (unitId) =>
        this.selectionController?.selectOnlyUnit(unitId)
    });
    this.buildingRenderer = new BuildingRenderer({
      scene: this,
      projection: this.projection,
      getSelectedBuildingId: () => this.selectedBuildingId,
      onSelectOwnBuilding: (buildingId) =>
        this.selectionController?.selectOnlyBuilding(buildingId),
      onBuildingRemoved: (buildingId) => {
        if (this.selectedBuildingId === buildingId) {
          this.selectedBuildingId = undefined;
        }
      }
    });
    this.fogRenderer = new FogRenderer({
      scene: this,
      projection: this.projection,
      mapSize: MAP_SIZE,
      updateIntervalMs: FOG_UPDATE_INTERVAL_MS,
      benchmarkMode: BENCHMARK_MODE
    });

    this.placementGraphics = this.add
      .graphics()
      .setDepth(90_000);

    this.minimapAdapter = new MinimapAdapter({
      scene: this,
      projection: this.projection,
      fogRenderer: this.fogRenderer,
      mapSize: MAP_SIZE,
      size: MINIMAP_SIZE,
      margin: MINIMAP_MARGIN,
      benchmarkMode: BENCHMARK_MODE
    });

    this.hudAdapter = new HudAdapter({
      scene: this,
      benchmarkMode: BENCHMARK_MODE,
      skirmishSeed: SKIRMISH_SEED,
      selectedUnitIds: this.selectedUnitIds,
      getSelectedBuildingId: () => this.selectedBuildingId,
      setPlacementMode: (kind) => this.setPlacementMode(kind),
      issueTrain: (unitKind) => this.issueTrainCommand(unitKind),
      issueResearch: (technologyKind) =>
        this.issueResearchCommand(technologyKind)
    });

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

    this.configureInput();

    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(700, 420);

    this.updateVisibility(FOG_UPDATE_INTERVAL_MS, initialSnapshot);
    this.renderSnapshot(initialSnapshot);
    this.minimapAdapter.render(initialSnapshot);
    this.hudAdapter.update(initialSnapshot);
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
    this.minimapAdapter?.render(snapshot);
    this.updateMetrics(delta, snapshot);
    this.hudAdapter?.layout(snapshot);
    this.hudAdapter?.update(snapshot);
    this.hudAdapter?.updateMatchOverlay(snapshot);
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

  private configureInput(): void {
    if (!this.selectionGraphics) {
      throw new Error("Selection graphics must exist before input is configured.");
    }

    this.cameraController = new CameraController(this);
    this.cameraController.configure();

    this.commandController = new CommandController(this.input, {
      isPlacementActive: () => this.placementKind !== undefined,
      hasSelectedUnits: () => this.selectedUnitIds.size > 0,
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
      issueMove: (pointer) => this.issueMoveCommand(pointer),
      setIntentCursor: (intent) =>
        this.commandFeedbackRenderer?.setCursor(intent),
      showCommandFeedback: (intent, pointer, accepted) =>
        this.commandFeedbackRenderer?.show(intent, pointer, accepted)
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
    return this.resourceRenderer?.findId(currentlyOver);
  }

  private findEnemyUnitUnderPointer(
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): string | undefined {
    const unitId = this.unitRenderer?.findId(currentlyOver);

    if (!unitId) {
      return undefined;
    }

    const unit = this.simulation
      .getSnapshot()
      .units.find((entry) => entry.id === unitId);

    return unit && unit.ownerId !== "player-1" ? unit.id : undefined;
  }

  private findEnemyBuildingUnderPointer(
    currentlyOver: Phaser.GameObjects.GameObject[]
  ): string | undefined {
    const buildingId = this.buildingRenderer?.findId(currentlyOver);

    if (!buildingId) {
      return undefined;
    }

    const building = this.simulation
      .getSnapshot()
      .buildings.find((entry) => entry.id === buildingId);

    return building && building.ownerId !== "player-1"
      ? building.id
      : undefined;
  }

  private issueAttackBuildingCommand(targetBuildingId: string): boolean {
    const unitIds = this.selectedCombatUnitIds();

    if (unitIds.length === 0) {
      return false;
    }

    this.simulation.queueCommand({
      type: "attack-building",
      playerId: "player-1",
      unitIds,
      targetBuildingId
    });
    return true;
  }

  private issueAttackCommand(targetUnitId: string): boolean {
    const unitIds = this.selectedCombatUnitIds();

    if (unitIds.length === 0) {
      return false;
    }

    this.simulation.queueCommand({
      type: "attack",
      playerId: "player-1",
      unitIds,
      targetUnitId
    });
    return true;
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

  private issueGatherCommand(resourceId: string): boolean {
    const unitIds = this.selectedVillagerIds();

    if (unitIds.length === 0) {
      return false;
    }

    this.simulation.queueCommand({
      type: "gather",
      playerId: "player-1",
      unitIds,
      resourceId
    });
    return true;
  }

  private issueBuildCommand(pointer: Phaser.Input.Pointer): boolean {
    const buildingKind = this.placementKind;
    const unitIds = this.selectedVillagerIds();

    if (!buildingKind || unitIds.length === 0) {
      return false;
    }

    const target = screenToGrid(
      { x: pointer.worldX, y: pointer.worldY },
      this.projection
    );

    this.simulation.queueCommand({
      type: "build",
      playerId: "player-1",
      unitIds,
      buildingKind,
      position: {
        x: Phaser.Math.Clamp(Math.floor(target.x), 0, MAP_SIZE - 1),
        y: Phaser.Math.Clamp(Math.floor(target.y), 0, MAP_SIZE - 1)
      }
    });

    this.setPlacementMode(undefined);
    return true;
  }

  private setPlacementMode(kind: BuildingKind | undefined): void {
    this.placementKind = kind;
    this.commandFeedbackRenderer?.setCursor(kind ? "build" : "none");
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

  private issueRallyPointCommand(pointer: Phaser.Input.Pointer): boolean {
    const buildingId = this.selectedBuildingId;

    if (!buildingId) {
      return false;
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
    return true;
  }

  private issueMoveCommand(pointer: Phaser.Input.Pointer): boolean {
    if (this.selectedUnitIds.size === 0) {
      return false;
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
    return true;
  }

  private selectedVillagerIds(): string[] {
    const selected = this.selectedUnitIds;

    return this.simulation
      .getSnapshot()
      .units.filter(
        (unit) => selected.has(unit.id) && unit.kind === "villager"
      )
      .map((unit) => unit.id);
  }

  private selectedCombatUnitIds(): string[] {
    const selected = this.selectedUnitIds;

    return this.simulation
      .getSnapshot()
      .units.filter((unit) => {
        if (!selected.has(unit.id)) {
          return false;
        }

        const definition = UNIT_DEFINITIONS.find(
          (entry) => entry.kind === unit.kind
        );

        return (definition?.attackDamage ?? 0) > 0;
      })
      .map((unit) => unit.id);
  }

  private updateVisibility(
    delta: number,
    snapshot: SimulationSnapshot
  ): void {
    this.fogRenderer?.update(delta, snapshot);
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
        : `vision: ${(this.fogRenderer?.visibleCellCount() ?? 0)} · explored: ${(this.fogRenderer?.exploredCellCount() ?? 0)}/${MAP_SIZE * MAP_SIZE}`
    ]);
  }

  private renderSnapshot(snapshot: SimulationSnapshot): void {
    this.unitRenderer?.sync(
      snapshot,
      (unit) =>
        unit.ownerId === "player-1" ||
        BENCHMARK_MODE ||
        (this.fogRenderer?.isVisiblePoint(
          unit.position.x,
          unit.position.y
        ) ?? false)
    );

    this.resourceRenderer?.sync(
      snapshot.resources,
      (resource) =>
        BENCHMARK_MODE
          ? "visible"
          : (this.fogRenderer?.stateAtPoint(
              resource.position.x,
              resource.position.y
            ) ?? "unexplored")
    );

    this.buildingRenderer?.sync(
      snapshot,
      (building) =>
        building.ownerId === "player-1" ||
        BENCHMARK_MODE ||
        (this.fogRenderer?.isVisiblePoint(
          building.position.x,
          building.position.y
        ) ?? false)
    );
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

function unitColor(unit: UnitState): number {
  if (unit.ownerId !== "player-1") {
    return 0xb35c52;
  }

  return unit.kind === "militia" ? 0x8fb3cf : 0xd9c56c;
}

