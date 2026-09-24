import { describe, expect, it } from "vitest";
import { EconomySystem, type EconomyUnit } from "./EconomySystem";
import type {
  DropOffPointState,
  ResourceNodeState,
  ResourceStockpile
} from "../types";

describe("EconomySystem", () => {
  it("keeps a separated villager gathering instead of repeatedly repathing", () => {
    const resources = new Map<string, ResourceNodeState>([
      [
        "wood-1",
        {
          id: "wood-1",
          kind: "wood",
          position: { x: 0, y: 0 },
          amount: 20
        }
      ]
    ]);
    const unit: EconomyUnit = {
      id: "villager-1",
      ownerId: "p1",
      kind: "villager",
      position: { x: 0.82, y: 0 },
      destination: null,
      speed: 2.4,
      hitPoints: 25,
      activity: "gathering",
      cargo: null,
      waypoints: [],
      gatherTask: {
        resourceId: "wood-1",
        phase: "gathering"
      }
    };
    let repathCount = 0;
    const system = new EconomySystem(
      20,
      resources,
      new Map(),
      () => ({ wood: 0, food: 0, gold: 0 }),
      () => {
        repathCount += 1;
        return true;
      }
    );

    system.step([unit]);

    expect(repathCount).toBe(0);
    expect(unit.activity).toBe("gathering");
    expect(unit.gatherTask?.phase).toBe("gathering");
    expect(resources.get("wood-1")?.amount).toBeLessThan(20);
  });

  it("routes drop-off work to a resolved building-edge target", () => {
    const resources = new Map<string, ResourceNodeState>([
      [
        "wood-1",
        {
          id: "wood-1",
          kind: "wood",
          position: { x: 0, y: 0 },
          amount: 20
        }
      ]
    ]);
    const dropOffPoints = new Map<string, DropOffPointState>([
      [
        "tc-1",
        {
          id: "tc-1",
          ownerId: "p1",
          buildingId: "town-center-1",
          position: { x: 5, y: 5 },
          accepts: ["wood"]
        }
      ]
    ]);
    const unit: EconomyUnit = {
      id: "villager-1",
      ownerId: "p1",
      kind: "villager",
      position: { x: 1, y: 1 },
      destination: null,
      speed: 2.4,
      hitPoints: 25,
      activity: "returning",
      cargo: { kind: "wood", amount: 10 },
      waypoints: [],
      gatherTask: {
        resourceId: "wood-1",
        phase: "to-dropoff"
      }
    };
    const targets: { x: number; y: number }[] = [];
    const resolvedTarget = { x: 4.5, y: 6.5 };
    const system = new EconomySystem(
      20,
      resources,
      dropOffPoints,
      () => ({ wood: 0, food: 0, gold: 0 }),
      (_movingUnit, target) => {
        targets.push({ ...target });
        return true;
      },
      (_movingUnit, point) =>
        point.buildingId === "town-center-1" ? resolvedTarget : null
    );

    system.beginReturnToDropOff(unit, "wood");

    expect(targets).toEqual([resolvedTarget]);
    expect(unit.gatherTask?.dropOffPointId).toBe("tc-1");
    expect(unit.gatherTask?.dropOffTarget).toEqual(resolvedTarget);
  });

  it("preserves deterministic gather, carry, drop-off, and repeat accounting", () => {
    const resources = new Map<string, ResourceNodeState>([
      [
        "wood-1",
        {
          id: "wood-1",
          kind: "wood",
          position: { x: 0, y: 0 },
          amount: 20
        }
      ]
    ]);
    const dropOffPoints = new Map<string, DropOffPointState>([
      [
        "tc-1",
        {
          id: "tc-1",
          ownerId: "p1",
          position: { x: 1, y: 0 },
          accepts: ["wood"]
        }
      ]
    ]);
    const stockpile: ResourceStockpile = { wood: 0, food: 0, gold: 0 };
    const unit: EconomyUnit = {
      id: "villager-1",
      ownerId: "p1",
      kind: "villager",
      position: { x: 0, y: 0 },
      destination: null,
      speed: 2.4,
      hitPoints: 25,
      activity: "moving",
      cargo: null,
      waypoints: [],
      gatherTask: {
        resourceId: "wood-1",
        phase: "to-resource"
      }
    };

    const system = new EconomySystem(
      20,
      resources,
      dropOffPoints,
      () => stockpile,
      (movingUnit, target) => {
        movingUnit.position = { ...target };
        movingUnit.destination = null;
        movingUnit.waypoints = [];
        return true;
      }
    );

    system.step([unit]);

    for (let index = 0; index < 50; index += 1) {
      system.step([unit]);
    }

    system.step([unit]);

    expect(stockpile.wood).toBeCloseTo(10);
    expect(resources.get("wood-1")?.amount).toBeCloseTo(10);
    expect(unit.cargo).toBeNull();
    expect(unit.gatherTask?.phase).toBe("to-resource");
  });
});
