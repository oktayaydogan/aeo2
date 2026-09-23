import { describe, expect, it } from "vitest";
import {
  canAffordWithReservation,
  createAiEconomyPlan
} from "./AiEconomyPlanner";

describe("AiEconomyPlanner", () => {
  it("allocates workers toward reserved and recurring resource deficits", () => {
    const plan = createAiEconomyPlan({
      stockpile: { wood: 20, food: 20, gold: 0 },
      workerCount: 4,
      reservation: {
        key: "build:barracks",
        cost: { wood: 75, food: 0, gold: 0 }
      },
      recurringCosts: [
        { wood: 0, food: 50, gold: 0 }
      ]
    });

    expect(plan.requiredResources).toEqual({
      wood: 75,
      food: 50,
      gold: 0
    });
    expect(plan.deficits).toEqual({
      wood: 55,
      food: 30,
      gold: 0
    });
    expect(plan.workerTargets).toEqual({
      wood: 3,
      food: 1,
      gold: 0
    });
  });

  it("falls back to a deterministic balanced allocation when planned costs are funded", () => {
    const plan = createAiEconomyPlan({
      stockpile: { wood: 200, food: 200, gold: 200 },
      workerCount: 4
    });

    expect(plan.workerTargets).toEqual({
      wood: 1,
      food: 2,
      gold: 1
    });
  });

  it("protects reserved resources from lower-priority spending", () => {
    const reservation = {
      key: "build:barracks",
      cost: { wood: 75, food: 0, gold: 0 }
    };

    expect(
      canAffordWithReservation(
        { wood: 100, food: 70, gold: 20 },
        { wood: 25, food: 0, gold: 20 },
        reservation
      )
    ).toBe(true);

    expect(
      canAffordWithReservation(
        { wood: 100, food: 70, gold: 20 },
        { wood: 50, food: 0, gold: 0 },
        reservation
      )
    ).toBe(false);

    expect(
      canAffordWithReservation(
        { wood: 75, food: 0, gold: 0 },
        { wood: 75, food: 0, gold: 0 },
        reservation,
        "build:barracks"
      )
    ).toBe(true);
  });
});
