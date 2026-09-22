export const SKIRMISH_MAP_SIZES = [20, 28, 36] as const;
export const AI_DIFFICULTIES = ["easy", "normal", "hard"] as const;
export const STARTING_RESOURCE_PRESETS = ["standard", "high"] as const;
export const GAME_SPEEDS = [0.75, 1, 1.25] as const;

export type SkirmishMapSize = (typeof SKIRMISH_MAP_SIZES)[number];
export type AiDifficulty = (typeof AI_DIFFICULTIES)[number];
export type StartingResourcePreset =
  (typeof STARTING_RESOURCE_PRESETS)[number];
export type GameSpeed = (typeof GAME_SPEEDS)[number];

export interface SkirmishSettings {
  seed: number;
  mapSize: SkirmishMapSize;
  aiDifficulty: AiDifficulty;
  startingResources: StartingResourcePreset;
  gameSpeed: GameSpeed;
}

export const DEFAULT_SKIRMISH_SETTINGS: SkirmishSettings = {
  seed: 20260920,
  mapSize: 20,
  aiDifficulty: "normal",
  startingResources: "standard",
  gameSpeed: 1
};

export interface SkirmishSettingsInput {
  seed: number;
  mapSize: number;
  aiDifficulty: string;
  startingResources: string;
  gameSpeed: number;
}

export function validateSkirmishSettings(
  input: SkirmishSettingsInput
): string[] {
  const errors: string[] = [];

  if (
    !Number.isSafeInteger(input.seed) ||
    input.seed <= 0 ||
    input.seed > 0x7fffffff
  ) {
    errors.push("Seed must be an integer between 1 and 2147483647.");
  }

  if (!SKIRMISH_MAP_SIZES.includes(input.mapSize as SkirmishMapSize)) {
    errors.push("Unsupported map size.");
  }

  if (!AI_DIFFICULTIES.includes(input.aiDifficulty as AiDifficulty)) {
    errors.push("Unsupported AI difficulty.");
  }

  if (
    !STARTING_RESOURCE_PRESETS.includes(
      input.startingResources as StartingResourcePreset
    )
  ) {
    errors.push("Unsupported starting-resource preset.");
  }

  if (!GAME_SPEEDS.includes(input.gameSpeed as GameSpeed)) {
    errors.push("Unsupported game speed.");
  }

  return errors;
}

export function normalizeSkirmishSettings(
  input: SkirmishSettingsInput
): SkirmishSettings {
  const errors = validateSkirmishSettings(input);

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }

  return {
    seed: input.seed,
    mapSize: input.mapSize as SkirmishMapSize,
    aiDifficulty: input.aiDifficulty as AiDifficulty,
    startingResources:
      input.startingResources as StartingResourcePreset,
    gameSpeed: input.gameSpeed as GameSpeed
  };
}

export function aiTuningForDifficulty(
  difficulty: AiDifficulty
): {
  thinkIntervalTicks: number;
  targetVillagers: number;
  targetMilitary: number;
  attackThreshold: number;
} {
  switch (difficulty) {
    case "easy":
      return {
        thinkIntervalTicks: 60,
        targetVillagers: 3,
        targetMilitary: 5,
        attackThreshold: 5
      };
    case "hard":
      return {
        thinkIntervalTicks: 28,
        targetVillagers: 5,
        targetMilitary: 9,
        attackThreshold: 5
      };
    default:
      return {
        thinkIntervalTicks: 40,
        targetVillagers: 4,
        targetMilitary: 7,
        attackThreshold: 5
      };
  }
}

export function startingStockpiles(
  preset: StartingResourcePreset
): {
  player: { wood: number; food: number; gold: number };
  enemy: { wood: number; food: number; gold: number };
} {
  if (preset === "high") {
    return {
      player: { wood: 300, food: 250, gold: 200 },
      enemy: { wood: 300, food: 250, gold: 200 }
    };
  }

  return {
    player: { wood: 100, food: 0, gold: 0 },
    enemy: { wood: 25, food: 100, gold: 45 }
  };
}
