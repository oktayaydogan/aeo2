import { describe, expect, it } from "vitest";
import type {
  BuildingDefinition,
  BuildingState,
  ResourceNodeState,
  UnitState
} from "../types";
import { AiKnowledgeSystem } from "./AiKnowledgeSystem";

const HOUSE: BuildingDefinition = {
  kind: "house",
  displayName: "House",
  footprint: { width: 2, height: 2 },
  cost: { wood: 25, food: 0, gold: 0 },
  buildTimeSeconds: 8,
  maxHitPoints: 550,
  populationProvided: 5
};

function unit(
  id: string,
  ownerId: string,
  position: { x: number; y: number }
): UnitState {
  return {
    id,
    ownerId,
    kind: "militia",
    position,
    destination: null,
    speed: 2.5,
    hitPoints: 40,
    activity: "idle",
    cargo: null
  };
}

describe("AiKnowledgeSystem", () => {
  it("does not expose live hidden enemy movement and refreshes memory on re-sighting", () => {
    const scout = unit("ai-scout", "player-2", { x: 2, y: 2 });
    const enemy = unit("enemy", "player-1", { x: 6, y: 2 });
    const units = new Map([
      [scout.id, scout],
      [enemy.id, enemy]
    ]);
    const knowledge = new AiKnowledgeSystem({
      width: 20,
      height: 20,
      units,
      buildings: new Map<string, BuildingState>(),
      resources: new Map<string, ResourceNodeState>(),
      buildingDefinitions: new Map<string, BuildingDefinition>()
    });

    knowledge.update("player-2", "player-1", 1);

    expect(
      knowledge.getSnapshot("player-2").visibleEnemyUnits[0]?.position
    ).toEqual({ x: 6, y: 2 });

    enemy.position = { x: 16, y: 16 };
    knowledge.update("player-2", "player-1", 2);

    const hidden = knowledge.getSnapshot("player-2");
    expect(hidden.visibleEnemyUnits).toEqual([]);
    expect(hidden.rememberedEnemyUnits[0]).toMatchObject({
      id: "enemy",
      position: { x: 6, y: 2 },
      lastSeenTick: 1
    });

    scout.position = { x: 13, y: 16 };
    knowledge.update("player-2", "player-1", 3);

    expect(
      knowledge.getSnapshot("player-2").rememberedEnemyUnits[0]
    ).toMatchObject({
      id: "enemy",
      position: { x: 16, y: 16 },
      lastSeenTick: 3
    });
  });

  it("remembers static resources without reading hidden live depletion", () => {
    const scout = unit("ai-scout", "player-2", { x: 2, y: 2 });
    const resource: ResourceNodeState = {
      id: "food-1",
      kind: "food",
      position: { x: 5, y: 2 },
      amount: 100
    };
    const knowledge = new AiKnowledgeSystem({
      width: 20,
      height: 20,
      units: new Map([[scout.id, scout]]),
      buildings: new Map<string, BuildingState>(),
      resources: new Map([[resource.id, resource]]),
      buildingDefinitions: new Map<string, BuildingDefinition>()
    });

    knowledge.update("player-2", "player-1", 1);
    scout.position = { x: 15, y: 15 };
    resource.amount = 0;
    knowledge.update("player-2", "player-1", 2);

    expect(knowledge.getKnownResources("player-2")[0]).toMatchObject({
      id: "food-1",
      amount: 100,
      lastSeenTick: 1
    });

    scout.position = { x: 2, y: 2 };
    knowledge.update("player-2", "player-1", 3);

    expect(knowledge.getKnownResources("player-2")[0]).toMatchObject({
      id: "food-1",
      amount: 0,
      lastSeenTick: 3
    });
  });

  it("keeps a seen static building in memory while it is hidden", () => {
    const scout = unit("ai-scout", "player-2", { x: 2, y: 2 });
    const building: BuildingState = {
      id: "enemy-house",
      ownerId: "player-1",
      kind: "house",
      position: { x: 5, y: 2 },
      progress: 1,
      completed: true,
      hitPoints: 550,
      trainingQueue: []
    };
    const buildings = new Map([[building.id, building]]);
    const knowledge = new AiKnowledgeSystem({
      width: 20,
      height: 20,
      units: new Map([[scout.id, scout]]),
      buildings,
      resources: new Map<string, ResourceNodeState>(),
      buildingDefinitions: new Map([[HOUSE.kind, HOUSE]])
    });

    knowledge.update("player-2", "player-1", 1);
    scout.position = { x: 15, y: 15 };
    knowledge.update("player-2", "player-1", 2);

    expect(
      knowledge.getRememberedEnemyBuildings("player-2")[0]
    ).toMatchObject({
      id: "enemy-house",
      position: { x: 5, y: 2 },
      lastSeenTick: 1
    });
  });
});
