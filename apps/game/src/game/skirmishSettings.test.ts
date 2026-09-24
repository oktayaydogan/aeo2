import { describe, expect, it } from "vitest";
import {
  aiProfileFor,
  createSkirmishSearch,
  enemyResourcesFor,
  isValidSkirmishSeed,
  isValidSkirmishSettings,
  mapSizeFor,
  normalizeSkirmishSeed,
  playerResourcesFor,
  readSkirmishSettings
} from "./skirmishSettings";

describe("skirmish settings", () => {
  it("round-trips reproducible URL settings", () => {
    const search = createSkirmishSearch({
      seed: 1337,
      aiDifficulty: "hard",
      startingResources: "high",
      mapSize: "large"
    });

    expect(readSkirmishSettings(`?${search}`)).toEqual({
      seed: 1337,
      aiDifficulty: "hard",
      startingResources: "high",
      mapSize: "large"
    });
  });

  it("falls back from invalid URL values", () => {
    expect(
      readSkirmishSettings("?seed=nope&ai=nightmare&resources=cheat")
    ).toEqual({
      seed: 20260920,
      aiDifficulty: "standard",
      startingResources: "standard",
      mapSize: "standard"
    });
  });

  it("maps size presets to deterministic square map dimensions", () => {
    expect(mapSizeFor("small")).toBe(32);
    expect(mapSizeFor("standard")).toBe(48);
    expect(mapSizeFor("large")).toBe(64);
  });

  it("validates seed bounds and complete settings", () => {
    expect(isValidSkirmishSeed(1)).toBe(true);
    expect(isValidSkirmishSeed(0xffffffff)).toBe(true);
    expect(isValidSkirmishSeed(0)).toBe(false);
    expect(isValidSkirmishSeed(1.5)).toBe(false);
    expect(isValidSkirmishSeed(0x100000000)).toBe(false);
    expect(normalizeSkirmishSeed(0)).toBe(1);
    expect(normalizeSkirmishSeed(0x100000000)).toBe(0xffffffff);

    expect(
      isValidSkirmishSettings({
        seed: 42,
        aiDifficulty: "standard",
        startingResources: "standard",
        mapSize: "standard"
      })
    ).toBe(true);
  });

  it("keeps current standard AI and resource defaults intact", () => {
    expect(aiProfileFor("standard")).toEqual({
      thinkIntervalTicks: 40,
      targetVillagers: 4,
      targetMilitary: 7,
      attackThreshold: 5
    });
    expect(playerResourcesFor("standard")).toEqual({
      wood: 100,
      food: 0,
      gold: 0
    });
    expect(enemyResourcesFor("standard")).toEqual({
      wood: 25,
      food: 100,
      gold: 45
    });
  });
});
