export const BUILDING_DEFINITIONS = [
  {
    kind: "house",
    displayName: "House",
    footprint: { width: 2, height: 2 },
    cost: { wood: 25, food: 0, gold: 0 },
    buildTimeSeconds: 8,
    maxHitPoints: 550,
    populationProvided: 5
  },
  {
    kind: "barracks",
    displayName: "Barracks",
    footprint: { width: 3, height: 3 },
    cost: { wood: 75, food: 0, gold: 0 },
    buildTimeSeconds: 15,
    maxHitPoints: 1200,
    populationProvided: 0
  }
] as const;
