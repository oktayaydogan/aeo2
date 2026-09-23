import type {
  ResourceKind,
  ResourceStockpile
} from "../types";

const RESOURCE_ORDER: readonly ResourceKind[] = [
  "food",
  "wood",
  "gold"
];

const EPSILON = 0.000001;

export interface AiSpendingReservation {
  key: string;
  cost: ResourceStockpile;
}

export interface AiEconomyPlan {
  reservation?: AiSpendingReservation;
  requiredResources: ResourceStockpile;
  deficits: ResourceStockpile;
  workerTargets: Record<ResourceKind, number>;
}

export interface CreateAiEconomyPlanOptions {
  stockpile: ResourceStockpile;
  workerCount: number;
  reservation?: AiSpendingReservation;
  recurringCosts?: readonly ResourceStockpile[];
}

export function createAiEconomyPlan(
  options: CreateAiEconomyPlanOptions
): AiEconomyPlan {
  const requiredResources = emptyResources();

  if (options.reservation) {
    addCost(requiredResources, options.reservation.cost);
  }

  for (const cost of options.recurringCosts ?? []) {
    addCost(requiredResources, cost);
  }

  const deficits = {
    wood: Math.max(requiredResources.wood - options.stockpile.wood, 0),
    food: Math.max(requiredResources.food - options.stockpile.food, 0),
    gold: Math.max(requiredResources.gold - options.stockpile.gold, 0)
  };

  return {
    reservation: options.reservation
      ? {
          key: options.reservation.key,
          cost: { ...options.reservation.cost }
        }
      : undefined,
    requiredResources,
    deficits,
    workerTargets: allocateWorkers(
      Math.max(0, Math.floor(options.workerCount)),
      deficits
    )
  };
}

export function canAffordWithReservation(
  stockpile: ResourceStockpile,
  cost: ResourceStockpile,
  reservation?: AiSpendingReservation,
  spendingKey?: string
): boolean {
  const protectedCost =
    reservation && reservation.key !== spendingKey
      ? reservation.cost
      : emptyResources();

  return RESOURCE_ORDER.every(
    (kind) =>
      stockpile[kind] - cost[kind] >= protectedCost[kind] - EPSILON
  );
}

function allocateWorkers(
  workerCount: number,
  deficits: ResourceStockpile
): Record<ResourceKind, number> {
  const result: Record<ResourceKind, number> = {
    wood: 0,
    food: 0,
    gold: 0
  };
  const hasDeficit = RESOURCE_ORDER.some(
    (kind) => deficits[kind] > EPSILON
  );

  for (let index = 0; index < workerCount; index += 1) {
    if (!hasDeficit) {
      const kind = RESOURCE_ORDER[index % RESOURCE_ORDER.length] ?? "food";
      result[kind] += 1;
      continue;
    }

    let selected = RESOURCE_ORDER[0] ?? "food";
    let selectedScore = Number.NEGATIVE_INFINITY;

    for (const kind of RESOURCE_ORDER) {
      const score = deficits[kind] / (result[kind] + 1);

      if (score > selectedScore + EPSILON) {
        selected = kind;
        selectedScore = score;
      }
    }

    result[selected] += 1;
  }

  return result;
}

function addCost(
  target: ResourceStockpile,
  cost: ResourceStockpile
): void {
  target.wood += cost.wood;
  target.food += cost.food;
  target.gold += cost.gold;
}

function emptyResources(): ResourceStockpile {
  return {
    wood: 0,
    food: 0,
    gold: 0
  };
}
