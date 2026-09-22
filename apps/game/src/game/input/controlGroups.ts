import type { SimulationSnapshot } from "@aeo2/simulation";

const DOUBLE_TAP_WINDOW_MS = 350;

export interface ControlGroupSelection {
  unitIds: readonly string[];
  buildingId?: string;
}

export interface ControlGroupRecall {
  unitIds: readonly string[];
  buildingId?: string;
  shouldCenter: boolean;
}

export class ControlGroupManager {
  private readonly groups = new Map<number, ControlGroupSelection>();
  private readonly lastRecallAt = new Map<number, number>();

  assign(slot: number, selection: ControlGroupSelection): void {
    assertSlot(slot);

    const unitIds = [...new Set(selection.unitIds)].sort();

    if (unitIds.length > 0) {
      this.groups.set(slot, { unitIds });
      this.lastRecallAt.delete(slot);
      return;
    }

    if (selection.buildingId) {
      this.groups.set(slot, {
        unitIds: [],
        buildingId: selection.buildingId
      });
      this.lastRecallAt.delete(slot);
      return;
    }

    this.groups.delete(slot);
    this.lastRecallAt.delete(slot);
  }

  recall(
    slot: number,
    snapshot: SimulationSnapshot,
    nowMs: number
  ): ControlGroupRecall | null {
    assertSlot(slot);

    const stored = this.groups.get(slot);

    if (!stored) {
      this.lastRecallAt.delete(slot);
      return null;
    }

    const liveOwnedUnitIds = stored.unitIds.filter((unitId) =>
      snapshot.units.some(
        (unit) => unit.id === unitId && unit.ownerId === "player-1"
      )
    );
    const liveBuildingId =
      liveOwnedUnitIds.length === 0 &&
      stored.buildingId &&
      snapshot.buildings.some(
        (building) =>
          building.id === stored.buildingId &&
          building.ownerId === "player-1"
      )
        ? stored.buildingId
        : undefined;

    if (liveOwnedUnitIds.length === 0 && !liveBuildingId) {
      this.groups.delete(slot);
      this.lastRecallAt.delete(slot);
      return null;
    }

    const normalized: ControlGroupSelection =
      liveOwnedUnitIds.length > 0
        ? { unitIds: liveOwnedUnitIds }
        : { unitIds: [], buildingId: liveBuildingId };

    this.groups.set(slot, normalized);

    const previousRecallAt = this.lastRecallAt.get(slot);
    const shouldCenter =
      previousRecallAt !== undefined &&
      nowMs - previousRecallAt >= 0 &&
      nowMs - previousRecallAt <= DOUBLE_TAP_WINDOW_MS;

    this.lastRecallAt.set(slot, nowMs);

    return {
      ...normalized,
      shouldCenter
    };
  }

  get(slot: number): ControlGroupSelection | undefined {
    const group = this.groups.get(slot);

    if (!group) {
      return undefined;
    }

    return {
      unitIds: [...group.unitIds],
      buildingId: group.buildingId
    };
  }
}

function assertSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > 9) {
    throw new Error(`Control group slot must be between 1 and 9: ${slot}`);
  }
}
