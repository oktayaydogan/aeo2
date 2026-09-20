import type {
  BuildingKind,
  ResourceStockpile,
  TechnologyKind,
  UnitKind
} from "@aeo2/simulation";

export type HudCommand =
  | "house"
  | "barracks"
  | "archery-range"
  | "villager"
  | "militia"
  | "archer"
  | "forged-weapons";

export interface HudAvailabilityInput {
  selectedUnitKinds: readonly UnitKind[];
  selectedBuildingKind?: BuildingKind;
  selectedBuildingCompleted?: boolean;
  selectedBuildingResearchBusy?: boolean;
  resources: ResourceStockpile;
  researchedTechnologies?: readonly TechnologyKind[];
  populationUsed: number;
  populationQueued: number;
  populationCap: number;
  matchEnded: boolean;
}

export function getHudCommandAvailability(
  input: HudAvailabilityInput
): Record<HudCommand, boolean> {
  const hasVillager = input.selectedUnitKinds.includes("villager");
  const populationAvailable =
    input.populationUsed + input.populationQueued < input.populationCap;
  const researched = new Set(input.researchedTechnologies ?? []);

  if (input.matchEnded) {
    return {
      house: false,
      barracks: false,
      "archery-range": false,
      villager: false,
      militia: false,
      archer: false,
      "forged-weapons": false
    };
  }

  return {
    house: hasVillager && input.resources.wood >= 25,
    barracks: hasVillager && input.resources.wood >= 75,
    "archery-range": hasVillager && input.resources.wood >= 100,
    villager:
      input.selectedBuildingKind === "town-center" &&
      input.selectedBuildingCompleted === true &&
      input.resources.food >= 50 &&
      populationAvailable,
    militia:
      input.selectedBuildingKind === "barracks" &&
      input.selectedBuildingCompleted === true &&
      !input.selectedBuildingResearchBusy &&
      input.resources.food >= 60 &&
      input.resources.gold >= 20 &&
      populationAvailable,
    archer:
      input.selectedBuildingKind === "archery-range" &&
      input.selectedBuildingCompleted === true &&
      input.resources.wood >= 25 &&
      input.resources.gold >= 45 &&
      populationAvailable,
    "forged-weapons":
      input.selectedBuildingKind === "barracks" &&
      input.selectedBuildingCompleted === true &&
      !input.selectedBuildingResearchBusy &&
      !researched.has("forged-weapons") &&
      input.resources.food >= 75 &&
      input.resources.gold >= 75
  };
}
