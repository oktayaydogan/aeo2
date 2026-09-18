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


export const UNIT_DEFINITIONS = [
  {
    kind: "militia",
    displayName: "Militia",
    cost: { wood: 0, food: 60, gold: 20 },
    trainTimeSeconds: 12,
    maxHitPoints: 40,
    speed: 2.5,
    attackDamage: 4,
    attackRange: 0.75,
    attackCooldownSeconds: 1.4
  }
] as const;
