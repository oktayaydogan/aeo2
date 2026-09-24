import { GridNavigation } from "../GridNavigation";
import { MIN_UNIT_DISTANCE } from "./MovementSystem";
import type {
  BuildingDefinition,
  BuildingState,
  ResourceNodeState,
  UnitState,
  Vector2
} from "../types";

const ARRIVAL_EPSILON = 0.000001;
const BUILD_START_RANGE = 0.35;
const BUILD_RETENTION_RANGE = BUILD_START_RANGE + MIN_UNIT_DISTANCE;

export interface BuildTask {
  buildingId: string;
  target: Vector2;
}

export interface ConstructionUnit extends UnitState {
  waypoints: Vector2[];
  buildTask?: BuildTask;
}

export class ConstructionSystem<TUnit extends ConstructionUnit> {
  constructor(
    private readonly tickRate: number,
    private readonly navigation: GridNavigation,
    private readonly buildings: Map<string, BuildingState>,
    private readonly buildingDefinitions: Map<string, BuildingDefinition>,
    private readonly resources: Map<string, ResourceNodeState>,
    private readonly units: Map<string, TUnit>,
    private readonly assignPath: (unit: TUnit, target: Vector2) => boolean
  ) {}

  step(units: Iterable<TUnit>): void {
    const activeBuildersByBuilding = new Map<string, number>();

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

      const target = task.target;
      const interactionRange =
        unit.activity === "building"
          ? BUILD_RETENTION_RANGE
          : BUILD_START_RANGE;

      if (distance(unit.position, target) > interactionRange) {
        unit.activity = "moving";

        if (unit.waypoints.length === 0 && !this.assignPath(unit, target)) {
          this.stopBuildTask(unit);
        }

        continue;
      }

      unit.waypoints = [];
      unit.destination = null;
      unit.activity = "building";
      activeBuildersByBuilding.set(
        building.id,
        (activeBuildersByBuilding.get(building.id) ?? 0) + 1
      );
    }

    for (const [buildingId, builderCount] of activeBuildersByBuilding) {
      const building = this.buildings.get(buildingId);

      if (!building || building.completed) {
        continue;
      }

      const definition = this.buildingDefinitions.get(building.kind);

      if (!definition) {
        continue;
      }

      building.progress = Math.min(
        building.progress +
          builderConstructionMultiplier(builderCount) /
            (definition.buildTimeSeconds * this.tickRate),
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

  canPlaceBuilding(
    definition: BuildingDefinition,
    position: Vector2
  ): boolean {
    const unitList = [...this.units.values()];

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

        if (
          unitList.some(
            (unit) =>
              Math.floor(unit.position.x) === cellX &&
              Math.floor(unit.position.y) === cellY
          )
        ) {
          return false;
        }
      }
    }

    return true;
  }

  findBuildApproachPosition(
    unit: TUnit,
    definition: BuildingDefinition,
    position: Vector2,
    reservedTargets: readonly Vector2[] = []
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

    const unreserved = ordered.filter(
      (candidate) =>
        !reservedTargets.some((reserved) => samePoint(candidate, reserved))
    );

    for (const candidate of [...unreserved, ...ordered]) {
      if (
        distance(unit.position, candidate) <= ARRIVAL_EPSILON ||
        this.navigation.findPath(unit.position, candidate).length > 0
      ) {
        return candidate;
      }
    }

    return null;
  }

  stopBuildTask(unit: TUnit): void {
    unit.buildTask = undefined;
    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "idle";
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
}

function builderConstructionMultiplier(builderCount: number): number {
  if (builderCount <= 0) {
    return 0;
  }

  // AoE2-style diminishing returns: the first builder contributes the full
  // rate, while each additional builder contributes one third of that rate.
  return 1 + (builderCount - 1) / 3;
}

function samePoint(a: Vector2, b: Vector2): boolean {
  return (
    Math.abs(a.x - b.x) <= ARRIVAL_EPSILON &&
    Math.abs(a.y - b.y) <= ARRIVAL_EPSILON
  );
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
