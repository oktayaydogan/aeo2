export type AiDifficulty = "easy" | "standard" | "hard";
export type StartingResourcesPreset = "low" | "standard" | "high";
export type MapSizePreset = "small" | "standard" | "large";

export interface SkirmishSettings {
  seed: number;
  aiDifficulty: AiDifficulty;
  startingResources: StartingResourcesPreset;
  mapSize: MapSizePreset;
}

export interface AiProfile {
  thinkIntervalTicks: number;
  targetVillagers: number;
  targetMilitary: number;
  attackThreshold: number;
}

export interface ResourcePreset {
  wood: number;
  food: number;
  gold: number;
}

export const DEFAULT_SKIRMISH_SETTINGS: SkirmishSettings = {
  seed: 20260920,
  aiDifficulty: "standard",
  startingResources: "standard",
  mapSize: "standard"
};

export function readSkirmishSettings(
  search =
    typeof window === "undefined"
      ? ""
      : window.location.search
): SkirmishSettings {
  const params = new URLSearchParams(search);
  const rawSeed = Number.parseInt(params.get("seed") ?? "", 10);
  const rawDifficulty = params.get("ai");
  const rawResources = params.get("resources");
  const rawMapSize = params.get("map");

  return {
    seed:
      Number.isFinite(rawSeed) && rawSeed !== 0
        ? Math.abs(rawSeed)
        : DEFAULT_SKIRMISH_SETTINGS.seed,
    aiDifficulty: isAiDifficulty(rawDifficulty)
      ? rawDifficulty
      : DEFAULT_SKIRMISH_SETTINGS.aiDifficulty,
    startingResources: isStartingResourcesPreset(rawResources)
      ? rawResources
      : DEFAULT_SKIRMISH_SETTINGS.startingResources,
    mapSize: isMapSizePreset(rawMapSize)
      ? rawMapSize
      : DEFAULT_SKIRMISH_SETTINGS.mapSize
  };
}

export function createSkirmishSearch(
  settings: SkirmishSettings,
  play = true
): string {
  const params = new URLSearchParams();

  if (play) {
    params.set("play", "1");
  }

  params.set("seed", String(Math.abs(Math.trunc(settings.seed)) || 1));
  params.set("ai", settings.aiDifficulty);
  params.set("resources", settings.startingResources);
  params.set("map", settings.mapSize);

  return params.toString();
}

export function mapSizeFor(preset: MapSizePreset): number {
  switch (preset) {
    case "small":
      return 16;
    case "large":
      return 28;
    default:
      return 20;
  }
}

export function aiProfileFor(
  difficulty: AiDifficulty
): AiProfile {
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
        thinkIntervalTicks: 24,
        targetVillagers: 5,
        targetMilitary: 9,
        attackThreshold: 4
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

export function playerResourcesFor(
  preset: StartingResourcesPreset
): ResourcePreset {
  switch (preset) {
    case "low":
      return { wood: 75, food: 0, gold: 0 };
    case "high":
      return { wood: 250, food: 200, gold: 100 };
    default:
      return { wood: 100, food: 0, gold: 0 };
  }
}

export function enemyResourcesFor(
  preset: StartingResourcesPreset
): ResourcePreset {
  switch (preset) {
    case "low":
      return { wood: 20, food: 75, gold: 30 };
    case "high":
      return { wood: 150, food: 200, gold: 100 };
    default:
      return { wood: 25, food: 100, gold: 45 };
  }
}

function isAiDifficulty(
  value: string | null
): value is AiDifficulty {
  return value === "easy" || value === "standard" || value === "hard";
}

function isStartingResourcesPreset(
  value: string | null
): value is StartingResourcesPreset {
  return value === "low" || value === "standard" || value === "high";
}


function isMapSizePreset(
  value: string | null
): value is MapSizePreset {
  return value === "small" || value === "standard" || value === "large";
}
