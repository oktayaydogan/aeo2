import { describe, expect, it } from "vitest";
import {
  aiProfileFor,
  createSkirmishSearch,
  enemyResourcesFor,
  mapSizeFor,
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
    expect(mapSizeFor("small")).toBe(16);
    expect(mapSizeFor("standard")).toBe(20);
    expect(mapSizeFor("large")).toBe(28);
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
