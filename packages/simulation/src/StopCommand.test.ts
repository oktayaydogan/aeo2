import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";
import type {
  BuildingDefinition,
  UnitDefinition,
  UnitState
} from "./types";

function unit(
  id: string,
  ownerId: string,
  kind: UnitState["kind"],
  position: { x: number; y: number },
  cargo: UnitState["cargo"] = null
): UnitState {
  return {
    id,
    ownerId,
    kind,
    position: { ...position },
    destination: null,
    speed: kind === "villager" ? 2.4 : 2.5,
    hitPoints: kind === "villager" ? 25 : 40,
    activity: "idle",
    cargo
  };
}

function run(simulation: Simulation, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    simulation.step();
  }
}

const MILITIA: UnitDefinition = {
  kind: "militia",
  displayName: "Militia",
  cost: { wood: 0, food: 60, gold: 20 },
  trainTimeSeconds: 1,
  maxHitPoints: 40,
  speed: 2.5,
  attackDamage: 4,
  attackRange: 0.75,
  attackCooldownSeconds: 0.1,
  populationCost: 1
};

const HOUSE: BuildingDefinition = {
  kind: "house",
  displayName: "House",
  footprint: { width: 2, height: 2 },
  cost: { wood: 25, food: 0, gold: 0 },
  buildTimeSeconds: 2,
  maxHitPoints: 100,
  populationProvided: 5
};

describe("Stop command", () => {
  it("stops movement and clears appended unit orders", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [unit("v1", "p1", "villager", { x: 1.5, y: 1.5 })]
    });

    simulation.queueCommand({
      type: "move",
      playerId: "p1",
      unitIds: ["v1"],
      target: { x: 10.5, y: 1.5 }
    });
    simulation.queueCommand({
      type: "move",
      playerId: "p1",
      unitIds: ["v1"],
      target: { x: 15.5, y: 1.5 },
      queueMode: "append"
    });
    simulation.step();

    const beforeStop = simulation.getSnapshot().units[0]?.position.x ?? 0;

    simulation.queueCommand({
      type: "stop",
      playerId: "p1",
      unitIds: ["v1"]
    });
    simulation.step();

    const stopped = simulation.getSnapshot().units[0];

    expect(stopped?.activity).toBe("idle");
    expect(stopped?.destination).toBeNull();
    expect(stopped?.orderQueue).toEqual([]);

    run(simulation, 30);

    expect(simulation.getSnapshot().units[0]?.position.x).toBeCloseTo(
      stopped?.position.x ?? beforeStop
    );
  });

  it("stops gathering without deleting or depositing carried resources", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 10, height: 10 },
      units: [
        unit(
          "v1",
          "p1",
          "villager",
          { x: 2.5, y: 2.5 },
          { kind: "wood", amount: 4 }
        )
      ],
      resources: [
        {
          id: "tree-1",
          kind: "wood",
          position: { x: 2.5, y: 2.5 },
          amount: 50
        }
      ],
      stockpiles: {
        p1: { wood: 10 }
      }
    });

    simulation.queueCommand({
      type: "gather",
      playerId: "p1",
      unitIds: ["v1"],
      resourceId: "tree-1"
    });
    simulation.step();

    const beforeStop = simulation.getSnapshot();
    const carried = beforeStop.units[0]?.cargo?.amount ?? 0;
    const resourceAmount = beforeStop.resources[0]?.amount ?? 0;
    const stockpileWood =
      beforeStop.stockpiles.find((entry) => entry.playerId === "p1")
        ?.resources.wood ?? 0;

    simulation.queueCommand({
      type: "stop",
      playerId: "p1",
      unitIds: ["v1"]
    });
    simulation.step();
    run(simulation, 20);

    const stopped = simulation.getSnapshot();
    const stoppedUnit = stopped.units[0];

    expect(stoppedUnit?.activity).toBe("idle");
    expect(stoppedUnit?.cargo?.amount).toBeCloseTo(carried);
    expect(stopped.resources[0]?.amount).toBeCloseTo(resourceAmount);
    expect(
      stopped.stockpiles.find((entry) => entry.playerId === "p1")
        ?.resources.wood
    ).toBeCloseTo(stockpileWood);
  });

  it("stops an attacker from chasing or dealing further damage", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 12, height: 12 },
      unitDefinitions: [MILITIA],
      units: [
        unit("a", "p1", "militia", { x: 2.5, y: 2.5 }),
        unit("b", "p2", "militia", { x: 3, y: 2.5 })
      ]
    });

    simulation.queueCommand({
      type: "attack",
      playerId: "p1",
      unitIds: ["a"],
      targetUnitId: "b"
    });
    simulation.step();

    simulation.queueCommand({
      type: "stop",
      playerId: "p1",
      unitIds: ["a"]
    });
    simulation.step();

    const afterStop = simulation.getSnapshot();
    const hpAfterStop =
      afterStop.units.find((entry) => entry.id === "b")?.hitPoints ?? 0;

    run(simulation, 20);

    const final = simulation.getSnapshot();

    expect(final.units.find((entry) => entry.id === "a")?.activity).toBe(
      "idle"
    );
    expect(final.units.find((entry) => entry.id === "b")?.hitPoints).toBe(
      hpAfterStop
    );
  });

  it("stops a builder while leaving the unfinished building in place", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 16, height: 16 },
      units: [unit("v1", "p1", "villager", { x: 3.5, y: 5.5 })],
      buildingDefinitions: [HOUSE],
      stockpiles: {
        p1: { wood: 100 }
      }
    });

    simulation.queueCommand({
      type: "build",
      playerId: "p1",
      unitIds: ["v1"],
      buildingKind: "house",
      position: { x: 5, y: 5 }
    });
    run(simulation, 25);

    const beforeStop = simulation.getSnapshot();
    const building = beforeStop.buildings[0];

    expect(building).toBeDefined();
    expect(building?.progress).toBeGreaterThan(0);
    expect(building?.completed).toBe(false);

    simulation.queueCommand({
      type: "stop",
      playerId: "p1",
      unitIds: ["v1"]
    });
    simulation.step();

    const progressAfterStop =
      simulation.getSnapshot().buildings[0]?.progress ?? 0;

    run(simulation, 30);

    expect(simulation.getSnapshot().buildings[0]?.progress).toBeCloseTo(
      progressAfterStop
    );
    expect(simulation.getSnapshot().units[0]?.activity).toBe("idle");
  });

  it("rejects stop for units the player does not own", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [unit("enemy", "p2", "villager", { x: 1.5, y: 1.5 })]
    });

    simulation.queueCommand({
      type: "move",
      playerId: "p2",
      unitIds: ["enemy"],
      target: { x: 8.5, y: 1.5 }
    });
    simulation.step();

    simulation.queueCommand({
      type: "stop",
      playerId: "p1",
      unitIds: ["enemy"]
    });
    simulation.step();

    const afterUnauthorizedStop = simulation.getSnapshot().units[0];

    expect(afterUnauthorizedStop?.activity).toBe("moving");
    expect(afterUnauthorizedStop?.destination).not.toBeNull();
  });
});
