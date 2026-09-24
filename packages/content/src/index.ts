export const BUILDING_DEFINITIONS = [
  {
    kind: "town-center",
    displayName: "Town Center",
    footprint: { width: 4, height: 4 },
    cost: { wood: 275, food: 0, gold: 100 },
    buildTimeSeconds: 40,
    maxHitPoints: 2400,
    populationProvided: 10
  },
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
  },
  {
    kind: "archery-range",
    displayName: "Archery Range",
    footprint: { width: 3, height: 3 },
    cost: { wood: 100, food: 0, gold: 0 },
    buildTimeSeconds: 18,
    maxHitPoints: 1050,
    populationProvided: 0,
    requiredAge: 2
  },
  {
    kind: "wood-depot",
    displayName: "Wood Depot",
    footprint: { width: 2, height: 2 },
    cost: { wood: 80, food: 0, gold: 0 },
    buildTimeSeconds: 12,
    maxHitPoints: 650,
    populationProvided: 0,
    dropOffAccepts: ["wood"]
  },
  {
    kind: "granary",
    displayName: "Granary",
    footprint: { width: 2, height: 2 },
    cost: { wood: 75, food: 0, gold: 0 },
    buildTimeSeconds: 11,
    maxHitPoints: 620,
    populationProvided: 0,
    dropOffAccepts: ["food"]
  },
  {
    kind: "ore-yard",
    displayName: "Ore Yard",
    footprint: { width: 2, height: 2 },
    cost: { wood: 90, food: 0, gold: 0 },
    buildTimeSeconds: 13,
    maxHitPoints: 680,
    populationProvided: 0,
    dropOffAccepts: ["gold"]
  }
] as const;

export const UNIT_DEFINITIONS = [
  {
    kind: "villager",
    displayName: "Villager",
    cost: { wood: 0, food: 50, gold: 0 },
    trainTimeSeconds: 10,
    maxHitPoints: 25,
    speed: 2.4,
    attackDamage: 0,
    attackRange: 0,
    attackCooldownSeconds: 1,
    populationCost: 1
  },
  {
    kind: "militia",
    displayName: "Militia",
    cost: { wood: 0, food: 60, gold: 20 },
    trainTimeSeconds: 12,
    maxHitPoints: 40,
    speed: 2.5,
    attackDamage: 4,
    attackRange: 0.75,
    attackCooldownSeconds: 1.4,
    populationCost: 1
  },
  {
    kind: "archer",
    displayName: "Archer",
    cost: { wood: 25, food: 0, gold: 45 },
    trainTimeSeconds: 14,
    maxHitPoints: 30,
    speed: 2.45,
    attackDamage: 4,
    attackRange: 4.5,
    attackCooldownSeconds: 1.7,
    populationCost: 1,
    requiredAge: 2
  },
  {
    kind: "spearman",
    displayName: "Spearman",
    cost: { wood: 25, food: 45, gold: 0 },
    trainTimeSeconds: 13,
    maxHitPoints: 45,
    speed: 2.35,
    attackDamage: 3,
    attackRange: 0.8,
    attackCooldownSeconds: 1.3,
    populationCost: 1,
    requiredAge: 2,
    bonuses: [
      {
        targetKind: "archer",
        damage: 5
      }
    ]
  }
] as const;

export const TECHNOLOGY_DEFINITIONS = [
  {
    kind: "forged-weapons",
    displayName: "Forged Weapons",
    cost: { wood: 0, food: 75, gold: 75 },
    researchTimeSeconds: 20,
    buildingKind: "barracks",
    attackDamageBonus: 1,
    requiredAge: 2
  },
  {
    kind: "civic-ascension",
    displayName: "Civic Ascension",
    cost: { wood: 0, food: 300, gold: 100 },
    researchTimeSeconds: 30,
    buildingKind: "town-center",
    attackDamageBonus: 0,
    requiredAge: 1,
    advancesToAge: 2
  },
  {
    kind: "citadel-ascension",
    displayName: "Citadel Ascension",
    cost: { wood: 0, food: 450, gold: 200 },
    researchTimeSeconds: 40,
    buildingKind: "town-center",
    attackDamageBonus: 0,
    requiredAge: 2,
    advancesToAge: 3
  },
  {
    kind: "dominion-ascension",
    displayName: "Dominion Ascension",
    cost: { wood: 0, food: 650, gold: 350 },
    researchTimeSeconds: 50,
    buildingKind: "town-center",
    attackDamageBonus: 0,
    requiredAge: 3,
    advancesToAge: 4
  }
] as const;
