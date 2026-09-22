import { describe, expect, it } from "vitest";
import {
  aiTuningForDifficulty,
  DEFAULT_SKIRMISH_SETTINGS,
  normalizeSkirmishSettings,
  startingStockpiles,
  validateSkirmishSettings
} from "./skirmishSettings";

describe("skirmish settings", () => {
  it("normalizes a valid reproducible settings contract", () => {
    expect(
      normalizeSkirmishSettings({
        seed: 12345,
        mapSize: 28,
        aiDifficulty: "hard",
        startingResources: "high",
        gameSpeed: 1.25
      })
    ).toEqual({
      seed: 12345,
      mapSize: 28,
      aiDifficulty: "hard",
      startingResources: "high",
      gameSpeed: 1.25
    });
  });

  it("rejects unsupported or non-deterministic values", () => {
    expect(
      validateSkirmishSettings({
        seed: 0,
        mapSize: 21,
        aiDifficulty: "nightmare",
        startingResources: "infinite",
        gameSpeed: 2
      })
    ).toHaveLength(5);
  });

  it("keeps defaults explicit", () => {
    expect(DEFAULT_SKIRMISH_SETTINGS).toEqual({
      seed: 20260920,
      mapSize: 20,
      aiDifficulty: "normal",
      startingResources: "standard",
      gameSpeed: 1
    });
  });

  it("maps difficulty and resources without randomness", () => {
    expect(aiTuningForDifficulty("easy").thinkIntervalTicks).toBeGreaterThan(
      aiTuningForDifficulty("hard").thinkIntervalTicks
    );
    expect(startingStockpiles("standard").player.wood).toBe(100);
    expect(startingStockpiles("high").player).toEqual({
      wood: 300,
      food: 250,
      gold: 200
    });
  });
});
