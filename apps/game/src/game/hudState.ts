import type {
  BuildingKind,
  ResourceStockpile,
  UnitKind
} from "@aeo2/simulation";

export type HudCommand = "house" | "barracks" | "villager" | "militia";

export interface HudAvailabilityInput {
  selectedUnitKinds: readonly UnitKind[];
  selectedBuildingKind?: BuildingKind;
  selectedBuildingCompleted?: boolean;
  resources: ResourceStockpile;
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

  if (input.matchEnded) {
    return {
      house: false,
      barracks: false,
      villager: false,
      militia: false
    };
  }

  return {
    house: hasVillager && input.resources.wood >= 25,
    barracks: hasVillager && input.resources.wood >= 75,
    villager:
      input.selectedBuildingKind === "town-center" &&
      input.selectedBuildingCompleted === true &&
      input.resources.food >= 50 &&
      populationAvailable,
    militia:
      input.selectedBuildingKind === "barracks" &&
      input.selectedBuildingCompleted === true &&
      input.resources.food >= 60 &&
      input.resources.gold >= 20 &&
      populationAvailable
  };
}
