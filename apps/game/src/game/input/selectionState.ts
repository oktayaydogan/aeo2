export function applyUnitClickSelection(
  selectedUnitIds: Set<string>,
  unitId: string,
  additive: boolean
): void {
  if (!additive) {
    selectedUnitIds.clear();
    selectedUnitIds.add(unitId);
    return;
  }

  if (selectedUnitIds.has(unitId)) {
    selectedUnitIds.delete(unitId);
  } else {
    selectedUnitIds.add(unitId);
  }
}
