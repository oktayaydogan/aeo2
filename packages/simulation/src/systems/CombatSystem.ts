import { GridNavigation } from "../GridNavigation";
import { MIN_UNIT_DISTANCE } from "./MovementSystem";
import type {
  BuildingDefinition,
  BuildingState,
  MatchState,
  UnitDefinition,
  UnitKind,
  UnitState,
  Vector2
} from "../types";

export interface AttackTask {
  targetType: "unit" | "building";
  targetId: string;
}

export interface CombatUnit extends UnitState {
  waypoints: Vector2[];
  attackTask?: AttackTask;
  buildTask?: {
    buildingId: string;
    target: Vector2;
  };
  attackCooldownTicks: number;
}

export class CombatSystem<TUnit extends CombatUnit> {
  constructor(
    private readonly tickRate: number,
    private readonly units: Map<string, TUnit>,
    private readonly buildings: Map<string, BuildingState>,
    private readonly unitDefinitions: Map<string, UnitDefinition>,
    private readonly buildingDefinitions: Map<string, BuildingDefinition>,
    private readonly matchState: MatchState,
    private readonly navigation: GridNavigation,
    private readonly getAttackDamageBonus: (playerId: string) => number,
    private readonly assignPath: (unit: TUnit, target: Vector2) => boolean,
    private readonly findBuildingApproach: (
      unit: TUnit,
      definition: BuildingDefinition,
      position: Vector2
    ) => Vector2 | null,
    private readonly stopBuildTask: (unit: TUnit) => void
  ) {}

  step(): void {
    const deadUnitIds = new Set<string>();
    const destroyedBuildings = new Map<string, string>();

    for (const unit of this.units.values()) {
      if (unit.attackCooldownTicks > 0) {
        unit.attackCooldownTicks -= 1;
      }
    }

    for (const unit of this.units.values()) {
      const task = unit.attackTask;

      if (!task || deadUnitIds.has(unit.id)) {
        continue;
      }

      const definition = this.unitDefinitions.get(unit.kind);

      if (!definition || definition.attackDamage <= 0) {
        this.stopAttackTask(unit);
        continue;
      }

      if (task.targetType === "unit") {
        this.processUnitTarget(
          unit,
          task.targetId,
          definition,
          deadUnitIds
        );
        continue;
      }

      this.processBuildingTarget(
        unit,
        task.targetId,
        definition,
        destroyedBuildings
      );
    }

    for (const unitId of deadUnitIds) {
      this.units.delete(unitId);
    }

    for (const [buildingId, attackerOwnerId] of destroyedBuildings) {
      const building = this.buildings.get(buildingId);

      if (!building) {
        continue;
      }

      const definition = this.buildingDefinitions.get(building.kind);

      if (definition) {
        this.navigation.unblockCells(
          buildingFootprintCells(building, definition)
        );
      }

      this.buildings.delete(buildingId);

      if (
        building.kind === "town-center" &&
        this.matchState.status !== "ended"
      ) {
        this.matchState.status = "ended";
        this.matchState.winnerPlayerId = attackerOwnerId;
        this.matchState.loserPlayerId = building.ownerId;
        this.matchState.reason = "town-center-destroyed";
      }
    }

    if (deadUnitIds.size === 0 && destroyedBuildings.size === 0) {
      return;
    }

    for (const unit of this.units.values()) {
      if (
        unit.attackTask?.targetType === "unit" &&
        deadUnitIds.has(unit.attackTask.targetId)
      ) {
        this.stopAttackTask(unit);
      }

      if (
        unit.attackTask?.targetType === "building" &&
        destroyedBuildings.has(unit.attackTask.targetId)
      ) {
        this.stopAttackTask(unit);
      }

      if (
        unit.buildTask &&
        destroyedBuildings.has(unit.buildTask.buildingId)
      ) {
        this.stopBuildTask(unit);
      }
    }
  }

  routeAttackerToTarget(
    unit: TUnit,
    target: TUnit,
    definition: UnitDefinition
  ): void {
    if (distance(unit.position, target.position) <= definition.attackRange) {
      unit.waypoints = [];
      unit.destination = null;
      unit.activity = "attacking";
      return;
    }

    unit.activity = "attacking";

    if (definition.attackRange <= 1.25) {
      for (const approach of this.unitApproachCandidates(
        unit,
        target,
        definition.attackRange
      )) {
        if (this.assignPath(unit, approach)) {
          return;
        }
      }
    }

    if (!this.assignPath(unit, target.position)) {
      this.stopAttackTask(unit);
    }
  }

  routeAttackerToBuilding(
    unit: TUnit,
    target: BuildingState,
    targetDefinition: BuildingDefinition,
    unitDefinition: UnitDefinition
  ): boolean {
    if (
      distanceToBuilding(
        unit.position,
        target,
        targetDefinition
      ) <= unitDefinition.attackRange
    ) {
      unit.waypoints = [];
      unit.destination = null;
      unit.activity = "attacking";
      return true;
    }

    const approach = this.findBuildingApproach(
      unit,
      targetDefinition,
      target.position
    );

    if (!approach) {
      return false;
    }

    unit.activity = "attacking";
    return this.assignPath(unit, approach);
  }

  stopAttackTask(unit: TUnit): void {
    unit.attackTask = undefined;
    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "idle";
  }

  private processUnitTarget(
    unit: TUnit,
    targetId: string,
    definition: UnitDefinition,
    deadUnitIds: Set<string>
  ): void {
    const target = this.units.get(targetId);

    if (
      !target ||
      target.ownerId === unit.ownerId ||
      target.hitPoints <= 0
    ) {
      this.stopAttackTask(unit);
      return;
    }

    const targetDistance = distance(unit.position, target.position);

    if (targetDistance > definition.attackRange) {
      unit.activity = "attacking";

      const destinationDriftTolerance =
        definition.attackRange <= 1.25
          ? Math.max(0.6, definition.attackRange * 1.1)
          : 0.6;
      const needsRepath =
        unit.waypoints.length === 0 ||
        !unit.destination ||
        distance(unit.destination, target.position) >
          destinationDriftTolerance;

      if (needsRepath) {
        this.routeAttackerToTarget(unit, target, definition);
      }

      return;
    }

    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "attacking";

    if (unit.attackCooldownTicks > 0) {
      return;
    }

    target.hitPoints -= this.attackDamageFor(
      unit,
      definition,
      target.kind
    );
    unit.attackCooldownTicks = Math.max(
      1,
      Math.round(definition.attackCooldownSeconds * this.tickRate)
    );

    if (target.hitPoints <= 0) {
      deadUnitIds.add(target.id);
    }
  }

  private processBuildingTarget(
    unit: TUnit,
    targetId: string,
    definition: UnitDefinition,
    destroyedBuildings: Map<string, string>
  ): void {
    const building = this.buildings.get(targetId);
    const buildingDefinition = building
      ? this.buildingDefinitions.get(building.kind)
      : undefined;

    if (
      !building ||
      building.ownerId === unit.ownerId ||
      building.hitPoints <= 0 ||
      !buildingDefinition
    ) {
      this.stopAttackTask(unit);
      return;
    }

    const targetDistance = distanceToBuilding(
      unit.position,
      building,
      buildingDefinition
    );

    if (targetDistance > definition.attackRange) {
      unit.activity = "attacking";

      if (
        unit.waypoints.length === 0 &&
        !this.routeAttackerToBuilding(
          unit,
          building,
          buildingDefinition,
          definition
        )
      ) {
        this.stopAttackTask(unit);
      }

      return;
    }

    unit.waypoints = [];
    unit.destination = null;
    unit.activity = "attacking";

    if (unit.attackCooldownTicks > 0) {
      return;
    }

    building.hitPoints -= this.attackDamageFor(unit, definition);
    unit.attackCooldownTicks = Math.max(
      1,
      Math.round(definition.attackCooldownSeconds * this.tickRate)
    );

    if (building.hitPoints <= 0) {
      destroyedBuildings.set(building.id, unit.ownerId);
    }
  }

  private unitApproachCandidates(
    unit: TUnit,
    target: TUnit,
    attackRange: number
  ): Vector2[] {
    const radius = Math.max(0.4, attackRange - 0.12);
    const slotCount = Math.max(
      4,
      Math.min(
        12,
        Math.floor((Math.PI * 2 * radius) / MIN_UNIT_DISTANCE)
      )
    );
    const attackers = [...this.units.values()]
      .filter(
        (candidate) =>
          candidate.ownerId === unit.ownerId &&
          candidate.attackTask?.targetType === "unit" &&
          candidate.attackTask.targetId === target.id
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const rank = Math.max(
      0,
      attackers.findIndex((candidate) => candidate.id === unit.id)
    );
    const preferredSlot = rank % slotCount;
    const candidates: Vector2[] = [];

    for (let offset = 0; offset < slotCount; offset += 1) {
      const slot = (preferredSlot + offset) % slotCount;
      const angle = (slot / slotCount) * Math.PI * 2;
      const candidate = {
        x: target.position.x + Math.cos(angle) * radius,
        y: target.position.y + Math.sin(angle) * radius
      };

      if (this.navigation.isWalkablePoint(candidate)) {
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  private attackDamageFor(
    unit: TUnit,
    definition: UnitDefinition,
    targetKind?: UnitKind
  ): number {
    let damage = definition.attackDamage;

    if (targetKind) {
      damage +=
        definition.bonuses?.find(
          (bonus) => bonus.targetKind === targetKind
        )?.damage ?? 0;
    }

    damage += this.getAttackDamageBonus(unit.ownerId);

    return damage;
  }
}

function buildingFootprintCells(
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

function distanceToBuilding(
  point: Vector2,
  building: BuildingState,
  definition: BuildingDefinition
): number {
  const minX = building.position.x;
  const minY = building.position.y;
  const maxX = minX + definition.footprint.width;
  const maxY = minY + definition.footprint.height;
  const nearestX = Math.min(Math.max(point.x, minX), maxX);
  const nearestY = Math.min(Math.max(point.y, minY), maxY);

  return distance(point, {
    x: nearestX,
    y: nearestY
  });
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
