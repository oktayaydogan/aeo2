import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";
import type {
  BuildingDefinition,
  SimulationSnapshot,
  UnitState
} from "./types";

function villager(
  id: string,
  position: { x: number; y: number }
): UnitState {
  return {
    id,
    ownerId: "p1",
    kind: "villager",
    position: { ...position },
    destination: null,
    speed: 2.4,
    hitPoints: 25,
    activity: "idle",
    cargo: null
  };
}

function run(simulation: Simulation, ticks: number): SimulationSnapshot {
  let snapshot = simulation.getSnapshot();

  for (let tick = 0; tick < ticks; tick += 1) {
    simulation.step();
    snapshot = simulation.getSnapshot();
  }

  return snapshot;
}

describe("per-unit order queues", () => {
  it("executes appended move orders in sequence", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [villager("v1", { x: 1.5, y: 1.5 })]
    });

    simulation.queueCommand({
      type: "move",
      playerId: "p1",
      unitIds: ["v1"],
      target: { x: 5.5, y: 1.5 }
    });
    simulation.queueCommand({
      type: "move",
      playerId: "p1",
      unitIds: ["v1"],
      target: { x: 9.5, y: 1.5 },
      queueMode: "append"
    });

    simulation.step();

    expect(simulation.getSnapshot().units[0]?.orderQueue).toEqual([
      { type: "move" }
    ]);

    const snapshot = run(simulation, 100);
    const unit = snapshot.units[0];

    expect(unit?.position.x).toBeCloseTo(9.5);
    expect(unit?.position.y).toBeCloseTo(1.5);
    expect(unit?.activity).toBe("idle");
    expect(unit?.orderQueue).toEqual([]);
  });

  it("replace clears pending appended orders", () => {
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [villager("v1", { x: 1.5, y: 1.5 })]
    });

    simulation.queueCommand({
      type: "move",
      playerId: "p1",
      unitIds: ["v1"],
      target: { x: 8.5, y: 1.5 }
    });
    simulation.queueCommand({
      type: "move",
      playerId: "p1",
      unitIds: ["v1"],
      target: { x: 12.5, y: 1.5 },
      queueMode: "append"
    });
    simulation.step();

    simulation.queueCommand({
      type: "move",
      playerId: "p1",
      unitIds: ["v1"],
      target: { x: 2.5, y: 8.5 },
      queueMode: "replace"
    });
    simulation.step();

    expect(simulation.getSnapshot().units[0]?.orderQueue).toEqual([]);

    const snapshot = run(simulation, 100);
    const unit = snapshot.units[0];

    expect(unit?.position.x).toBeCloseTo(2.5);
    expect(unit?.position.y).toBeCloseTo(8.5);
  });

  it("keeps multi-unit queued movement deterministic across input ordering", () => {
    const create = () =>
      new Simulation({
        tickRate: 20,
        map: { width: 24, height: 24 },
        units: [
          villager("v-a", { x: 1.5, y: 1.5 }),
          villager("v-b", { x: 2.5, y: 1.5 })
        ]
      });

    const first = create();
    const second = create();

    for (const [simulation, ids] of [
      [first, ["v-a", "v-b"]],
      [second, ["v-b", "v-a"]]
    ] as const) {
      simulation.queueCommand({
        type: "move",
        playerId: "p1",
        unitIds: ids,
        target: { x: 8, y: 8 }
      });
      simulation.queueCommand({
        type: "move",
        playerId: "p1",
        unitIds: ids,
        target: { x: 15, y: 15 },
        queueMode: "append"
      });
    }

    const firstSnapshot = run(first, 180);
    const secondSnapshot = run(second, 180);
    const normalize = (snapshot: SimulationSnapshot) =>
      snapshot.units
        .map((unit) => ({
          id: unit.id,
          position: unit.position,
          activity: unit.activity,
          orderQueue: unit.orderQueue
        }))
        .sort((a, b) => a.id.localeCompare(b.id));

    expect(normalize(firstSnapshot)).toEqual(normalize(secondSnapshot));
    expect(
      firstSnapshot.units.every(
        (unit) => unit.activity === "idle" && unit.orderQueue?.length === 0
      )
    ).toBe(true);
  });

  it("keeps a queued multi-builder construction order grouped", () => {
    const house: BuildingDefinition = {
      kind: "house",
      displayName: "House",
      footprint: { width: 2, height: 2 },
      cost: { wood: 25, food: 0, gold: 0 },
      buildTimeSeconds: 1,
      maxHitPoints: 100,
      populationProvided: 5
    };
    const simulation = new Simulation({
      tickRate: 20,
      map: { width: 20, height: 20 },
      units: [
        villager("v-a", { x: 1.5, y: 1.5 }),
        villager("v-b", { x: 2.5, y: 1.5 })
      ],
      buildingDefinitions: [house],
      stockpiles: {
        p1: { wood: 100 }
      }
    });

    simulation.queueCommand({
      type: "move",
      playerId: "p1",
      unitIds: ["v-a"],
      target: { x: 5.5, y: 1.5 }
    });
    simulation.queueCommand({
      type: "build",
      playerId: "p1",
      unitIds: ["v-a", "v-b"],
      buildingKind: "house",
      position: { x: 8, y: 8 },
      queueMode: "append"
    });

    simulation.step();

    expect(simulation.getSnapshot().buildings).toHaveLength(0);
    expect(
      simulation
        .getSnapshot()
        .units.every((unit) => unit.orderQueue?.[0]?.type === "build")
    ).toBe(true);

    const snapshot = run(simulation, 120);

    expect(snapshot.buildings).toHaveLength(1);
    expect(snapshot.buildings[0]?.kind).toBe("house");
    expect(snapshot.units.every((unit) => unit.orderQueue?.length === 0)).toBe(
      true
    );
  });
});
