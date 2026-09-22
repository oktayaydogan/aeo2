export type CommandIntent =
  | "none"
  | "move"
  | "gather"
  | "attack"
  | "build"
  | "rally";

export interface CommandIntentContext {
  placementActive: boolean;
  hasSelectedUnits: boolean;
  hasSelectedBuilding: boolean;
  overResource: boolean;
  overEnemyUnit: boolean;
  overEnemyBuilding: boolean;
}

export function resolveCommandIntent(
  context: CommandIntentContext
): CommandIntent {
  if (context.placementActive) {
    return "build";
  }

  if (
    context.hasSelectedUnits &&
    (context.overEnemyUnit || context.overEnemyBuilding)
  ) {
    return "attack";
  }

  if (context.hasSelectedUnits && context.overResource) {
    return "gather";
  }

  if (context.hasSelectedBuilding) {
    return "rally";
  }

  if (context.hasSelectedUnits) {
    return "move";
  }

  return "none";
}

export function cursorForCommandIntent(intent: CommandIntent): string {
  switch (intent) {
    case "attack":
    case "build":
      return "crosshair";
    case "gather":
      return "pointer";
    case "rally":
      return "copy";
    case "move":
      return "move";
    default:
      return "default";
  }
}

export function labelForCommandIntent(intent: CommandIntent): string {
  switch (intent) {
    case "attack":
      return "Attack";
    case "build":
      return "Build";
    case "gather":
      return "Gather";
    case "rally":
      return "Rally";
    case "move":
      return "Move";
    default:
      return "Invalid order";
  }
}
