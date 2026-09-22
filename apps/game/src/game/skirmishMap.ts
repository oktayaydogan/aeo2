import type {
  GridCell,
  GridMapDefinition,
  ResourceNodeState,
  Vector2
} from "@aeo2/simulation";

export interface SkirmishStart {
  townCenter: GridCell;
  house: GridCell;
  dropOff: Vector2;
  unitsOrigin: Vector2;
}

export interface SkirmishSetup {
  seed: number;
  map: GridMapDefinition;
  resources: ResourceNodeState[];
  player: SkirmishStart;
  enemy: SkirmishStart;
}

const DEFAULT_MAP_SIZE = 20;

export function createSkirmishSetup(
  seed: number,
  mapSize = DEFAULT_MAP_SIZE
): SkirmishSetup {
  if (!Number.isInteger(mapSize) || mapSize < 20) {
    throw new Error("Skirmish map size must be an integer of at least 20.");
  }

  const width = mapSize;
  const height = mapSize;
  const centerY = Math.floor(height / 2);
  const centerCorridorY = new Set([centerY - 1, centerY]);
  const obstaclePairTarget = Math.max(8, Math.round(width * 0.4));
  const normalizedSeed = normalizeSeed(seed);
  const random = mulberry32(normalizedSeed);
  const townCenterY = centerY - 2;
  const houseY = Math.max(2, centerY - 6);

  const player: SkirmishStart = {
    townCenter: { x: 1, y: townCenterY },
    house: { x: 2, y: houseY },
    dropOff: { x: 0.5, y: centerY },
    unitsOrigin: { x: 2.1, y: townCenterY - 1 }
  };
  const enemy: SkirmishStart = {
    townCenter: { x: width - 5, y: townCenterY },
    house: { x: width - 4, y: houseY },
    dropOff: { x: width - 0.5, y: centerY },
    unitsOrigin: { x: width - 2.1, y: townCenterY - 1 }
  };

  const resources = createFairResources(width, height);
  const reserved = new Set<string>();

  reserveFootprint(reserved, player.townCenter, 4, 4, 1, width, height);
  reserveFootprint(reserved, enemy.townCenter, 4, 4, 1, width, height);
  reserveFootprint(reserved, player.house, 2, 2, 1, width, height);
  reserveFootprint(reserved, enemy.house, 2, 2, 1, width, height);

  for (const resource of resources) {
    reserveAroundPoint(reserved, resource.position, 1, width, height);
  }

  reserveAroundPoint(reserved, player.unitsOrigin, 2, width, height);
  reserveAroundPoint(reserved, enemy.unitsOrigin, 2, width, height);

  const blocked = createMirroredObstacles(
    random,
    reserved,
    width,
    height,
    centerCorridorY,
    obstaclePairTarget
  );

  return {
    seed: normalizedSeed,
    map: {
      width,
      height,
      blocked
    },
    resources,
    player,
    enemy
  };
}

function createFairResources(
  width: number,
  height: number
): ResourceNodeState[] {
  const playerResources: ResourceNodeState[] = [
    {
      id: "player-wood",
      kind: "wood",
      position: { x: width * 0.275, y: height * 0.3 },
      amount: 300
    },
    {
      id: "player-food",
      kind: "food",
      position: { x: width * 0.275, y: height * 0.65 },
      amount: 250
    },
    {
      id: "player-gold",
      kind: "gold",
      position: { x: width * 0.35, y: height * 0.5 },
      amount: 200
    }
  ];

  return [
    ...playerResources,
    ...playerResources.map((resource) => ({
      ...resource,
      id: resource.id.replace("player-", "enemy-"),
      position: mirrorPoint(resource.position, width)
    }))
  ];
}

function createMirroredObstacles(
  random: () => number,
  reserved: ReadonlySet<string>,
  width: number,
  height: number,
  centerCorridorY: ReadonlySet<number>,
  obstaclePairTarget: number
): GridCell[] {
  const blocked = new Map<string, GridCell>();
  const minX = Math.floor(width * 0.3);
  const maxXExclusive = Math.max(
    minX + 1,
    Math.floor(width * 0.45)
  );
  let attempts = 0;

  while (
    blocked.size < obstaclePairTarget * 2 &&
    attempts < 800
  ) {
    attempts += 1;

    const x =
      minX + Math.floor(random() * (maxXExclusive - minX));
    const y = 2 + Math.floor(random() * (height - 4));

    if (centerCorridorY.has(y)) {
      continue;
    }

    const left = { x, y };
    const right = { x: width - 1 - x, y };

    if (
      !canUseObstacle(
        left,
        reserved,
        blocked,
        width,
        height,
        centerCorridorY
      ) ||
      !canUseObstacle(
        right,
        reserved,
        blocked,
        width,
        height,
        centerCorridorY
      )
    ) {
      continue;
    }

    blocked.set(cellKey(left.x, left.y), left);
    blocked.set(cellKey(right.x, right.y), right);
  }

  return [...blocked.values()].sort(
    (a, b) => a.y - b.y || a.x - b.x
  );
}

function canUseObstacle(
  cell: GridCell,
  reserved: ReadonlySet<string>,
  blocked: ReadonlyMap<string, GridCell>,
  width: number,
  height: number,
  centerCorridorY: ReadonlySet<number>
): boolean {
  if (
    cell.x < 0 ||
    cell.y < 0 ||
    cell.x >= width ||
    cell.y >= height
  ) {
    return false;
  }

  if (centerCorridorY.has(cell.y)) {
    return false;
  }

  const key = cellKey(cell.x, cell.y);
  return !reserved.has(key) && !blocked.has(key);
}

function reserveFootprint(
  reserved: Set<string>,
  origin: GridCell,
  width: number,
  height: number,
  padding: number,
  mapWidth: number,
  mapHeight: number
): void {
  for (let y = -padding; y < height + padding; y += 1) {
    for (let x = -padding; x < width + padding; x += 1) {
      reserveCell(
        reserved,
        origin.x + x,
        origin.y + y,
        mapWidth,
        mapHeight
      );
    }
  }
}

function reserveAroundPoint(
  reserved: Set<string>,
  point: Vector2,
  radius: number,
  width: number,
  height: number
): void {
  const originX = Math.floor(point.x);
  const originY = Math.floor(point.y);

  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      reserveCell(
        reserved,
        originX + x,
        originY + y,
        width,
        height
      );
    }
  }
}

function reserveCell(
  reserved: Set<string>,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }

  reserved.add(cellKey(x, y));
}

function mirrorPoint(point: Vector2, width: number): Vector2 {
  return {
    x: width - point.x,
    y: point.y
  };
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    return 1;
  }

  return Math.abs(Math.trunc(seed)) || 1;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
