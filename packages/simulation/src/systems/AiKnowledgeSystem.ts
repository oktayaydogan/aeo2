import type {
  BuildingDefinition,
  BuildingState,
  ResourceNodeState,
  UnitState,
  Vector2
} from "../types";
import {
  FogOfWar,
  buildingVisionRadius,
  unitVisionRadius
} from "../visibility";

export interface AiRememberedUnit {
  id: string;
  ownerId: string;
  kind: UnitState["kind"];
  position: Vector2;
  lastSeenTick: number;
}

export interface AiRememberedBuilding {
  id: string;
  ownerId: string;
  kind: BuildingState["kind"];
  position: Vector2;
  lastSeenTick: number;
}

export interface AiRememberedResource {
  id: string;
  kind: ResourceNodeState["kind"];
  position: Vector2;
  amount: number;
  lastSeenTick: number;
}

export interface AiKnowledgeSnapshot {
  playerId: string;
  visibleCells: readonly string[];
  exploredCells: readonly string[];
  visibleEnemyUnits: readonly AiRememberedUnit[];
  rememberedEnemyUnits: readonly AiRememberedUnit[];
  rememberedEnemyBuildings: readonly AiRememberedBuilding[];
  rememberedResources: readonly AiRememberedResource[];
}

interface PlayerKnowledge {
  fog: FogOfWar;
  visibleEnemyUnits: Map<string, AiRememberedUnit>;
  rememberedEnemyUnits: Map<string, AiRememberedUnit>;
  rememberedEnemyBuildings: Map<string, AiRememberedBuilding>;
  rememberedResources: Map<string, AiRememberedResource>;
}

export interface AiKnowledgeSystemOptions<TUnit extends UnitState> {
  width: number;
  height: number;
  units: Map<string, TUnit>;
  buildings: Map<string, BuildingState>;
  resources: Map<string, ResourceNodeState>;
  buildingDefinitions: Map<string, BuildingDefinition>;
}

export class AiKnowledgeSystem<TUnit extends UnitState> {
  private readonly players = new Map<string, PlayerKnowledge>();

  constructor(private readonly options: AiKnowledgeSystemOptions<TUnit>) {}

  update(playerId: string, enemyPlayerId: string, tick: number): void {
    const knowledge = this.ensurePlayer(playerId);
    const ownUnits = [...this.options.units.values()]
      .filter((unit) => unit.ownerId === playerId)
      .sort((a, b) => a.id.localeCompare(b.id));
    const ownBuildings = [...this.options.buildings.values()]
      .filter(
        (building) =>
          building.ownerId === playerId &&
          building.completed
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    knowledge.fog.update([
      ...ownUnits.map((unit) => ({
        x: unit.position.x,
        y: unit.position.y,
        radius: unitVisionRadius(unit)
      })),
      ...ownBuildings.map((building) => {
        const definition = this.options.buildingDefinitions.get(
          building.kind
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
      })
    ]);

    knowledge.visibleEnemyUnits.clear();

    for (const unit of [...this.options.units.values()].sort((a, b) =>
      a.id.localeCompare(b.id)
    )) {
      if (
        unit.ownerId !== enemyPlayerId ||
        !knowledge.fog.isVisiblePoint(unit.position.x, unit.position.y)
      ) {
        continue;
      }

      const remembered = rememberUnit(unit, tick);
      knowledge.visibleEnemyUnits.set(unit.id, remembered);
      knowledge.rememberedEnemyUnits.set(unit.id, remembered);
    }

    for (const resource of [...this.options.resources.values()].sort((a, b) =>
      a.id.localeCompare(b.id)
    )) {
      if (
        !knowledge.fog.isVisiblePoint(
          resource.position.x,
          resource.position.y
        )
      ) {
        continue;
      }

      knowledge.rememberedResources.set(resource.id, {
        id: resource.id,
        kind: resource.kind,
        position: { ...resource.position },
        amount: resource.amount,
        lastSeenTick: tick
      });
    }

    const enemyBuildings = [...this.options.buildings.values()]
      .filter((building) => building.ownerId === enemyPlayerId)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const building of enemyBuildings) {
      if (!this.isBuildingVisible(knowledge.fog, building)) {
        continue;
      }

      knowledge.rememberedEnemyBuildings.set(building.id, {
        id: building.id,
        ownerId: building.ownerId,
        kind: building.kind,
        position: { ...building.position },
        lastSeenTick: tick
      });
    }

    for (const [buildingId, remembered] of [
      ...knowledge.rememberedEnemyBuildings.entries()
    ]) {
      if (
        this.isRememberedBuildingAreaVisible(knowledge.fog, remembered) &&
        !this.options.buildings.has(buildingId)
      ) {
        knowledge.rememberedEnemyBuildings.delete(buildingId);
      }
    }
  }

  getVisibleEnemyUnitIds(playerId: string): ReadonlySet<string> {
    return new Set(
      this.ensurePlayer(playerId).visibleEnemyUnits.keys()
    );
  }

  getRememberedEnemyBuildings(
    playerId: string
  ): readonly AiRememberedBuilding[] {
    return [
      ...this.ensurePlayer(playerId).rememberedEnemyBuildings.values()
    ]
      .map((building) => ({
        ...building,
        position: { ...building.position }
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  getKnownResources(playerId: string): readonly AiRememberedResource[] {
    return [...this.ensurePlayer(playerId).rememberedResources.values()]
      .map((resource) => ({
        ...resource,
        position: { ...resource.position }
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  getSnapshot(playerId: string): AiKnowledgeSnapshot {
    const knowledge = this.ensurePlayer(playerId);
    const sortById = <T extends { id: string; position: Vector2 }>(
      entries: Iterable<T>
    ) =>
      [...entries]
        .map((entry) => ({
          ...entry,
          position: { ...entry.position }
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

    return {
      playerId,
      visibleCells: knowledge.fog.visibleCells(),
      exploredCells: knowledge.fog.exploredCells(),
      visibleEnemyUnits: sortById(
        knowledge.visibleEnemyUnits.values()
      ),
      rememberedEnemyUnits: sortById(
        knowledge.rememberedEnemyUnits.values()
      ),
      rememberedEnemyBuildings: sortById(
        knowledge.rememberedEnemyBuildings.values()
      ),
      rememberedResources: sortById(
        knowledge.rememberedResources.values()
      )
    };
  }

  private ensurePlayer(playerId: string): PlayerKnowledge {
    let knowledge = this.players.get(playerId);

    if (!knowledge) {
      knowledge = {
        fog: new FogOfWar(this.options.width, this.options.height),
        visibleEnemyUnits: new Map(),
        rememberedEnemyUnits: new Map(),
        rememberedEnemyBuildings: new Map(),
        rememberedResources: new Map()
      };
      this.players.set(playerId, knowledge);
    }

    return knowledge;
  }

  private isBuildingVisible(
    fog: FogOfWar,
    building: BuildingState
  ): boolean {
    const definition = this.options.buildingDefinitions.get(building.kind);
    const width = definition?.footprint.width ?? 1;
    const height = definition?.footprint.height ?? 1;

    return fog.isVisiblePoint(
      building.position.x + width / 2,
      building.position.y + height / 2
    );
  }

  private isRememberedBuildingAreaVisible(
    fog: FogOfWar,
    building: AiRememberedBuilding
  ): boolean {
    const definition = this.options.buildingDefinitions.get(building.kind);
    const width = definition?.footprint.width ?? 1;
    const height = definition?.footprint.height ?? 1;

    return fog.isVisiblePoint(
      building.position.x + width / 2,
      building.position.y + height / 2
    );
  }
}

function rememberUnit(
  unit: UnitState,
  tick: number
): AiRememberedUnit {
  return {
    id: unit.id,
    ownerId: unit.ownerId,
    kind: unit.kind,
    position: { ...unit.position },
    lastSeenTick: tick
  };
}
