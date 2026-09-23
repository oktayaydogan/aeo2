import {
  canStartResearch,
  hasResources,
  researchRejectionReason
} from "../commands/commandValidation";
import type {
  BuildingState,
  CommandRejectionReason,
  ResourceStockpile,
  TechnologyDefinition,
  TechnologyKind
} from "../types";

const ARRIVAL_EPSILON = 0.000001;

export class ResearchSystem {
  private readonly researchedTechnologies = new Map<
    string,
    Set<TechnologyKind>
  >();

  constructor(
    private readonly tickRate: number,
    private readonly technologyDefinitions: ReadonlyMap<
      string,
      TechnologyDefinition
    >
  ) {}

  getResearchRejectionReason(
    playerId: string,
    building: BuildingState | undefined,
    definition: TechnologyDefinition | undefined,
    stockpile: ResourceStockpile
  ): CommandRejectionReason | null {
    return researchRejectionReason({
      building,
      definition,
      playerId,
      alreadyResearched: Boolean(
        definition && this.hasTechnology(playerId, definition.kind)
      ),
      stockpile
    });
  }

  startResearch(
    playerId: string,
    building: BuildingState | undefined,
    definition: TechnologyDefinition | undefined,
    ensureStockpile: () => ResourceStockpile
  ): boolean {
    if (
      !canStartResearch({
        building,
        definition,
        playerId,
        alreadyResearched: Boolean(
          definition && this.hasTechnology(playerId, definition.kind)
        )
      }) ||
      !building ||
      !definition
    ) {
      return false;
    }

    const stockpile = ensureStockpile();

    if (!hasResources(stockpile, definition.cost)) {
      return false;
    }

    spendResources(stockpile, definition.cost);
    building.researchQueue ??= [];
    building.researchQueue.push({
      technologyKind: definition.kind,
      progress: 0
    });

    return true;
  }

  step(buildings: Iterable<BuildingState>): void {
    for (const building of buildings) {
      const item = building.researchQueue?.[0];

      if (!building.completed || !item) {
        continue;
      }

      const definition = this.technologyDefinitions.get(
        item.technologyKind
      );

      if (!definition) {
        building.researchQueue?.shift();
        continue;
      }

      item.progress = Math.min(
        item.progress +
          1 / (definition.researchTimeSeconds * this.tickRate),
        1
      );

      if (item.progress < 1 - ARRIVAL_EPSILON) {
        continue;
      }

      let researched = this.researchedTechnologies.get(building.ownerId);

      if (!researched) {
        researched = new Set<TechnologyKind>();
        this.researchedTechnologies.set(building.ownerId, researched);
      }

      researched.add(definition.kind);
      building.researchQueue?.shift();
    }
  }

  hasTechnology(
    playerId: string,
    technologyKind: TechnologyKind
  ): boolean {
    return (
      this.researchedTechnologies.get(playerId)?.has(technologyKind) ??
      false
    );
  }

  getResearched(playerId: string): readonly TechnologyKind[] {
    return [
      ...(this.researchedTechnologies.get(playerId) ?? new Set())
    ].sort();
  }

  getAttackDamageBonus(playerId: string): number {
    const researched = this.researchedTechnologies.get(playerId);

    if (!researched) {
      return 0;
    }

    let bonus = 0;

    for (const technologyKind of researched) {
      bonus +=
        this.technologyDefinitions.get(technologyKind)
          ?.attackDamageBonus ?? 0;
    }

    return bonus;
  }
}

function spendResources(
  stockpile: ResourceStockpile,
  cost: ResourceStockpile
): void {
  stockpile.wood -= cost.wood;
  stockpile.food -= cost.food;
  stockpile.gold -= cost.gold;
}
