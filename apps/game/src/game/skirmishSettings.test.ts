import { describe, expect, it } from "vitest";
import {
  aiProfileFor,
  createSkirmishSearch,
  enemyResourcesFor,
  playerResourcesFor,
  readSkirmishSettings
} from "./skirmishSettings";

describe("skirmish settings", () => {
  it("round-trips reproducible URL settings", () => {
    const search = createSkirmishSearch({
      seed: 1337,
      aiDifficulty: "hard",
      startingResources: "high"
    });

    expect(readSkirmishSettings(`?${search}`)).toEqual({
      seed: 1337,
      aiDifficulty: "hard",
      startingResources: "high"
    });
  });

  it("falls back from invalid URL values", () => {
    expect(
      readSkirmishSettings("?seed=nope&ai=nightmare&resources=cheat")
    ).toEqual({
      seed: 20260920,
      aiDifficulty: "standard",
      startingResources: "standard"
    });
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
