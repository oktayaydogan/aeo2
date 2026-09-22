import { describe, expect, it } from "vitest";
import { GridNavigation } from "../GridNavigation";
import {
  createFormationTargets,
  MIN_UNIT_DISTANCE,
  MovementSystem,
  type MovementUnit
} from "./MovementSystem";

function createUnit(id: string, position = { x: 1, y: 1 }): MovementUnit {
  return {
    id,
    ownerId: "p1",
    kind: "villager",
    position: { ...position },
    destination: null,
    speed: 2,
    hitPoints: 25,
    activity: "idle",
    cargo: null,
    waypoints: []
  };
}

describe("MovementSystem", () => {
  it("advances waypoints using the fixed simulation tick rate", () => {
    const unit = createUnit("unit-1", { x: 0, y: 0 });
    unit.activity = "moving";
    unit.destination = { x: 1, y: 0 };
    unit.waypoints = [{ x: 1, y: 0 }];

    const system = new MovementSystem(
      20,
      new GridNavigation({ width: 10, height: 10 })
    );

    system.moveUnits([unit]);

    expect(unit.position.x).toBeCloseTo(0.1);
    expect(unit.position.y).toBe(0);
    expect(unit.activity).toBe("moving");
    expect(unit.destination).toEqual({ x: 1, y: 0 });
  });

  it("clears destination and returns to idle when the final waypoint is reached", () => {
    const unit = createUnit("unit-1", { x: 0, y: 0 });
    unit.activity = "moving";
    unit.destination = { x: 0.05, y: 0 };
    unit.waypoints = [{ x: 0.05, y: 0 }];

    const system = new MovementSystem(
      20,
      new GridNavigation({ width: 10, height: 10 })
    );

    system.moveUnits([unit]);

    expect(unit.position).toEqual({ x: 0.05, y: 0 });
    expect(unit.destination).toBeNull();
    expect(unit.waypoints).toEqual([]);
    expect(unit.activity).toBe("idle");
  });

  it("keeps 50-unit formation targets deterministic and unique", () => {
    const first = createFormationTargets({ x: 20, y: 20 }, 50);
    const second = createFormationTargets({ x: 20, y: 20 }, 50);

    expect(first).toEqual(second);
    expect(first).toHaveLength(50);
    expect(new Set(first.map((point) => `${point.x},${point.y}`)).size).toBe(50);
  });

  it("separates overlapping units deterministically without render timing", () => {
    const first = createUnit("a", { x: 4, y: 4 });
    const second = createUnit("b", { x: 4, y: 4 });
    const repeatedFirst = createUnit("a", { x: 4, y: 4 });
    const repeatedSecond = createUnit("b", { x: 4, y: 4 });

    const system = new MovementSystem(
      20,
      new GridNavigation({ width: 10, height: 10 })
    );
    const repeatedSystem = new MovementSystem(
      20,
      new GridNavigation({ width: 10, height: 10 })
    );

    system.resolveUnitSeparation([first, second]);
    repeatedSystem.resolveUnitSeparation([repeatedFirst, repeatedSecond]);

    const distance = Math.hypot(
      first.position.x - second.position.x,
      first.position.y - second.position.y
    );

    expect(distance).toBeGreaterThanOrEqual(MIN_UNIT_DISTANCE - 0.000001);
    expect(first.position).toEqual(repeatedFirst.position);
    expect(second.position).toEqual(repeatedSecond.position);
  });

  it("assigns navigation paths and clears destination on an unreachable target", () => {
    const unit = createUnit("unit-1", { x: 1.5, y: 1.5 });
    const navigation = new GridNavigation({
      width: 5,
      height: 5,
      blocked: [
        { x: 2, y: 1 },
        { x: 1, y: 2 },
        { x: 0, y: 1 },
        { x: 1, y: 0 }
      ]
    });
    const system = new MovementSystem(20, navigation);

    expect(system.assignPath(unit, { x: 4, y: 4 })).toBe(false);
    expect(unit.destination).toBeNull();
    expect(unit.waypoints).toEqual([]);
  });
});
