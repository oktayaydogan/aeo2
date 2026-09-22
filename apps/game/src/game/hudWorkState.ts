import type {
  BuildingState,
  UnitOrderState,
  UnitState
} from "@aeo2/simulation";

const MAX_VISIBLE_ORDERS = 3;

export function describeUnitWork(
  units: readonly UnitState[]
): string[] {
  if (units.length === 0) {
    return [];
  }

  const activityLabels = units.map((unit) =>
    activityLabel(unit.activity)
  );
  const activity =
    new Set(activityLabels).size === 1
      ? activityLabels[0]
      : "Mixed";
  const queueSignatures = units.map((unit) =>
    queueSignature(unit.orderQueue ?? [])
  );
  const queue =
    new Set(queueSignatures).size === 1
      ? queueSignatures[0]
      : "Mixed";

  return [
    `Current · ${activity}`,
    `Queue · ${queue || "Empty"}`
  ];
}

export function describeBuildingWork(
  building: BuildingState,
  researched: readonly string[]
): string[] {
  const production =
    building.trainingQueue.length === 0
      ? "Production · Empty"
      : `Production · ${building.trainingQueue
          .slice(0, MAX_VISIBLE_ORDERS)
          .map((item, index) =>
            index === 0
              ? `${unitLabel(item.unitKind)} ${Math.round(
                  item.progress * 100
                )}%`
              : unitLabel(item.unitKind)
          )
          .join(" › ")}${overflowSuffix(building.trainingQueue.length)}`;

  const researchItem = building.researchQueue?.[0];
  const research = researchItem
    ? `Research · ${technologyLabel(
        researchItem.technologyKind
      )} ${Math.round(researchItem.progress * 100)}%`
    : researched.length > 0
      ? `Research · Complete: ${researched
          .map(technologyLabel)
          .join(", ")}`
      : "Research · Idle";

  return [production, research];
}

function queueSignature(
  orders: readonly UnitOrderState[]
): string {
  if (orders.length === 0) {
    return "";
  }

  return (
    orders
      .slice(0, MAX_VISIBLE_ORDERS)
      .map((order) => orderLabel(order.type))
      .join(" › ") + overflowSuffix(orders.length)
  );
}

function overflowSuffix(count: number): string {
  return count > MAX_VISIBLE_ORDERS
    ? ` › +${count - MAX_VISIBLE_ORDERS}`
    : "";
}

function activityLabel(activity: UnitState["activity"]): string {
  switch (activity) {
    case "moving":
      return "Move";
    case "gathering":
      return "Gather";
    case "returning":
      return "Return";
    case "building":
      return "Build";
    case "attacking":
      return "Attack";
    default:
      return "Idle";
  }
}

function orderLabel(type: UnitOrderState["type"]): string {
  switch (type) {
    case "move":
      return "Move";
    case "gather":
      return "Gather";
    case "build":
      return "Build";
    case "attack":
      return "Attack";
    case "attack-building":
      return "Attack Building";
  }
}

function unitLabel(kind: string): string {
  return kind
    .split("-")
    .map(capitalize)
    .join(" ");
}

function technologyLabel(kind: string): string {
  return kind
    .split("-")
    .map(capitalize)
    .join(" ");
}

function capitalize(value: string): string {
  return value.length === 0
    ? value
    : value[0]?.toUpperCase() + value.slice(1);
}
