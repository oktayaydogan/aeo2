import { GridNavigation } from "../GridNavigation";
import {
  hasResources,
  selectOwnedVillagers
} from "../commands/commandValidation";
import type {
  BuildingDefinition,
  BuildingState,
  ResourceNodeState,
  ResourceStockpile,
  UnitState,
  Vector2
} from "../types";

const ARRIVAL_EPSILON = 0.000001;

export interface BuildTask {
  buildingId: string;
  target: Vector2;
}

export interface ConstructionUnit extends UnitState {
  waypoints: Vector2[];
  gatherTask?: unknown;
  buildTask?: BuildTask;
  attackTask?: unknown;
}

export interface ConstructionCallbacks {
  createBuildingId(kind: string): string;
  assignPath(unit: ConstructionUnit, target: Vector2): boolean;
}

export class ConstructionSystem {
  constructor(
    private readonly tickRate: number,
    private readonly navigation: GridNavigation,
    private readonly buildings: Map<string, BuildingState>,
    private readonly buildingDefinitions: ReadonlyMap<
      string,
      BuildingDefinition
    >,
    private readonly resources: ReadonlyMap<string, ResourceNodeState>,
    private readonly stockpiles: Map<string, ResourceStockpile>
  ) {}

  startBuild(
    playerId: string,
    unitIds: readonly string[],
    buildingKind: BuildingState["kind"],
    requestedPosition: Vector2,
    units: ReadonlyMap<string, ConstructionUnit>,
    callbacks: ConstructionCallbacks
  ): void {
    const definition = this.buildingDefinitions.get(buildingKind);

    if (!definition) {
      return;
    }

    const position = {
      x: Math.floor(requestedPosition.x),
      y: Math.floor(requestedPosition.y)
    };

    if (!this.canPlaceBuilding(definition, position, units.values())) {
      return;
    }

    const buildersWithTargets = selectOwnedVillagers(
      unitIds,
      playerId,
      units
    )
      .map((unit) => ({
        unit,
        target: this.findBuildApproachPosition(
          unit,
          definition,
          position
        )
      }))
      .filter(
        (
          entry
        ): entry is {
          unit: ConstructionUnit;
          target: Vector2;
        } => entry.target !== null
      );

    if (buildersWithTargets.length === 0) {
      return;
    }

    const stockpile = this.ensureStockpile(playerId);

    if (!hasResources(stockpile, definition.cost)) {
      return;
    }

    spendResources(stockpile, definition.cost);

    const buildingId = callbacks.createBuildingId(definition.kind);
    const building: BuildingState = {
      id: buildingId,
      ownerId: playerId,
      kind: definition.kind,
      position,
      progress: 0,
      completed: false,
      hitPoints: 1,
      trainingQueue: [],
      rallyPoint: null
    };

    this.buildings.set(building.id, building);
    this.navigation.blockCells(
      buildingFootprintCells(building, definition)
    );

    for (const { unit, target } of buildersWithTargets) {
      unit.gatherTask = undefined;
      unit.attackTask = undefined;
      unit.buildTask = {
        buildingId: building.id,
        target: { ...target }
      };
      unit.activity = "moving";

      if (!callbacks.assignPath(unit, target)) {
        unit.buildTask = undefined;
        unit.activity = "idle";
      }
    }
  }

  step(
    units: Iterable<ConstructionUnit>,
    assignPath: (unit: ConstructionUnit, target: Vector2) => boolean
  ): void {
    for (const unit of units) {
      const task = unit.buildTask;

      if (!task || unit.kind !== "villager") {
        continue;
      }

      const building = this.buildings.get(task.buildingId);

      if (!building || building.completed) {
        this.stopBuildTask(unit);
        continue;
      }

      const definition = this.buildingDefinitions.get(building.kind);

      if (!definition) {
        this.stopBuildTask(unit);
        continue;
      }

      if (distance(unit.position, task.target) > 0.35) {
        unit.activity = "moving";

        if (unit.waypoints.length === 0 && !assignPath(unit, task.target)) {
          this.stopBuildTask(unit);
        }

        continue;
      }

      unit.waypoints = [];
      unit.destination = null;
      unit.activity = "building";

      building.progress = Math.min(
        building.progress +
          1 / (definition.buildTimeSeconds * this.tickRate),
        1
      );
      building.hitPoints = Math.max(
        1,
        Math.round(definition.maxHitPoints * building.progress)
      );

      if (building.progress >= 1 - ARRIVAL_EPSILON) {
        building.progress = 1;
        building.completed = true;
        building.hitPoints = definition.maxHitPoints;
      }
    }
  }

  stopBuildTask(unit: ConstructionUnit): void {
    unit.buildTask = undefined;
    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "idle";
  }

  releaseBuildingFootprint(building: BuildingState): void {
    const definition = this.buildingDefinitions.get(building.kind);

    if (!definition) {
      return;
    }

    this.navigation.unblockCells(
      buildingFootprintCells(building, definition)
    );
  }

  findBuildApproachPosition(
    unit: ConstructionUnit,
    definition: BuildingDefinition,
    position: Vector2
  ): Vector2 | null {
    const candidates: Vector2[] = [];

    for (let x = 0; x < definition.footprint.width; x += 1) {
      candidates.push(
        { x: position.x + x + 0.5, y: position.y - 0.5 },
        {
          x: position.x + x + 0.5,
          y: position.y + definition.footprint.height + 0.5
        }
      );
    }

    for (let y = 0; y < definition.footprint.height; y += 1) {
      candidates.push(
        { x: position.x - 0.5, y: position.y + y + 0.5 },
        {
          x: position.x + definition.footprint.width + 0.5,
          y: position.y + y + 0.5
        }
      );
    }

    const ordered = candidates
      .filter((candidate) => this.navigation.isWalkablePoint(candidate))
      .sort(
        (a, b) =>
          distance(unit.position, a) - distance(unit.position, b) ||
          a.y - b.y ||
          a.x - b.x
      );

    for (const candidate of ordered) {
      if (
        distance(unit.position, candidate) <= ARRIVAL_EPSILON ||
        this.navigation.findPath(unit.position, candidate).length > 0
      ) {
        return candidate;
      }
    }

    return null;
  }

  private canPlaceBuilding(
    definition: BuildingDefinition,
    position: Vector2,
    units: Iterable<ConstructionUnit>
  ): boolean {
    for (let y = 0; y < definition.footprint.height; y += 1) {
      for (let x = 0; x < definition.footprint.width; x += 1) {
        const cellX = position.x + x;
        const cellY = position.y + y;

        if (!this.navigation.isWalkableCell(cellX, cellY)) {
          return false;
        }

        if (
          [...this.buildings.values()].some((building) =>
            this.buildingContainsCell(building, cellX, cellY)
          )
        ) {
          return false;
        }

        if (
          [...this.resources.values()].some(
            (resource) =>
              Math.floor(resource.position.x) === cellX &&
              Math.floor(resource.position.y) === cellY &&
              resource.amount > ARRIVAL_EPSILON
          )
        ) {
          return false;
        }

        for (const unit of units) {
          if (
            Math.floor(unit.position.x) === cellX &&
            Math.floor(unit.position.y) === cellY
          ) {
            return false;
          }
        }
      }
    }

    return true;
  }

  private buildingContainsCell(
    building: BuildingState,
    cellX: number,
    cellY: number
  ): boolean {
    const definition = this.buildingDefinitions.get(building.kind);

    if (!definition) {
      return false;
    }

    return (
      cellX >= building.position.x &&
      cellY >= building.position.y &&
      cellX < building.position.x + definition.footprint.width &&
      cellY < building.position.y + definition.footprint.height
    );
  }

  private ensureStockpile(playerId: string): ResourceStockpile {
    let stockpile = this.stockpiles.get(playerId);

    if (!stockpile) {
      stockpile = { wood: 0, food: 0, gold: 0 };
      this.stockpiles.set(playerId, stockpile);
    }

    return stockpile;
  }
}

export function buildingFootprintCells(
  building: Pick<BuildingState, "position">,
  definition: BuildingDefinition
): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];

  for (let y = 0; y < definition.footprint.height; y += 1) {
    for (let x = 0; x < definition.footprint.width; x += 1) {
      cells.push({
        x: building.position.x + x,
        y: building.position.y + y
      });
    }
  }

  return cells;
}

function spendResources(
  stockpile: ResourceStockpile,
  cost: ResourceStockpile
): void {
  stockpile.wood -= cost.wood;
  stockpile.food -= cost.food;
  stockpile.gold -= cost.gold;
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
