import { describe, expect, it } from "vitest";
import { getHudCommandAvailability } from "./hudState";

describe("getHudCommandAvailability", () => {
  it("enables construction only for selected villagers with enough wood", () => {
    const state = getHudCommandAvailability({
      selectedUnitKinds: ["villager"],
      resources: { wood: 80, food: 0, gold: 0 },
      populationUsed: 1,
      populationQueued: 0,
      populationCap: 10,
      matchEnded: false
    });

    expect(state.house).toBe(true);
    expect(state.barracks).toBe(true);
    expect(state.villager).toBe(false);
    expect(state.militia).toBe(false);
  });

  it("enables Town Center villager production only when food and population are available", () => {
    const state = getHudCommandAvailability({
      selectedUnitKinds: [],
      selectedBuildingKind: "town-center",
      selectedBuildingCompleted: true,
      resources: { wood: 0, food: 50, gold: 0 },
      populationUsed: 9,
      populationQueued: 0,
      populationCap: 10,
      matchEnded: false
    });

    expect(state.villager).toBe(true);
  });

  it("blocks production at population cap and all commands after match end", () => {
    const capped = getHudCommandAvailability({
      selectedUnitKinds: [],
      selectedBuildingKind: "barracks",
      selectedBuildingCompleted: true,
      resources: { wood: 100, food: 100, gold: 100 },
      populationUsed: 10,
      populationQueued: 0,
      populationCap: 10,
      matchEnded: false
    });

    expect(capped.militia).toBe(false);

    const ended = getHudCommandAvailability({
      selectedUnitKinds: ["villager"],
      selectedBuildingKind: "town-center",
      selectedBuildingCompleted: true,
      resources: { wood: 100, food: 100, gold: 100 },
      populationUsed: 1,
      populationQueued: 0,
      populationCap: 10,
      matchEnded: true
    });

    expect(Object.values(ended).every((enabled) => !enabled)).toBe(true);
  });
});


describe("Phase 2 HUD commands", () => {
  it("enables Archery Range construction for a villager with enough wood", () => {
    const state = getHudCommandAvailability({
      selectedUnitKinds: ["villager"],
      resources: { wood: 100, food: 0, gold: 0 },
      populationUsed: 1,
      populationQueued: 0,
      populationCap: 10,
      matchEnded: false
    });

    expect(state["archery-range"]).toBe(true);
  });

  it("enables Archer production only from a completed Archery Range", () => {
    const state = getHudCommandAvailability({
      selectedUnitKinds: [],
      selectedBuildingKind: "archery-range",
      selectedBuildingCompleted: true,
      resources: { wood: 25, food: 0, gold: 45 },
      populationUsed: 4,
      populationQueued: 0,
      populationCap: 10,
      matchEnded: false
    });

    expect(state.archer).toBe(true);
    expect(state.militia).toBe(false);
  });

  it("enables Forged Weapons once and blocks it after research", () => {
    const available = getHudCommandAvailability({
      selectedUnitKinds: [],
      selectedBuildingKind: "barracks",
      selectedBuildingCompleted: true,
      resources: { wood: 0, food: 75, gold: 75 },
      populationUsed: 4,
      populationQueued: 0,
      populationCap: 10,
      matchEnded: false
    });

    expect(available["forged-weapons"]).toBe(true);

    const researched = getHudCommandAvailability({
      selectedUnitKinds: [],
      selectedBuildingKind: "barracks",
      selectedBuildingCompleted: true,
      resources: { wood: 0, food: 200, gold: 200 },
      researchedTechnologies: ["forged-weapons"],
      populationUsed: 4,
      populationQueued: 0,
      populationCap: 10,
      matchEnded: false
    });

    expect(researched["forged-weapons"]).toBe(false);
  });
});
