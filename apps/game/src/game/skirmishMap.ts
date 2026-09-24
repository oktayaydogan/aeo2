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
  forestCells: GridCell[];
  player: SkirmishStart;
  enemy: SkirmishStart;
}

const DEFAULT_SIZE = 48;

export function createSkirmishSetup(
  seed: number,
  size = DEFAULT_SIZE
): SkirmishSetup {
  const normalizedSeed = normalizeSeed(seed);
  const normalizedSize = normalizeSize(size);
  const random = mulberry32(normalizedSeed);
  const centerY = Math.floor(normalizedSize / 2);
  const centerCorridorY = new Set([centerY - 1, centerY]);
  const townCenterY = centerY - 2;

  const player: SkirmishStart = {
    townCenter: { x: 1, y: townCenterY },
    house: { x: 2, y: Math.max(2, townCenterY - 4) },
    dropOff: { x: 0.5, y: centerY },
    unitsOrigin: { x: 2.1, y: townCenterY - 1.0 }
  };
  const enemy: SkirmishStart = {
    townCenter: { x: normalizedSize - 5, y: townCenterY },
    house: {
      x: normalizedSize - 4,
      y: Math.max(2, townCenterY - 4)
    },
    dropOff: { x: normalizedSize - 0.5, y: centerY },
    unitsOrigin: {
      x: normalizedSize - 2.1,
      y: townCenterY - 1.0
    }
  };

  const strategicResources = createFairResources(normalizedSize, centerY);
  const reserved = new Set<string>();

  reserveFootprint(
    reserved,
    player.townCenter,
    4,
    4,
    1,
    normalizedSize
  );
  reserveFootprint(
    reserved,
    enemy.townCenter,
    4,
    4,
    1,
    normalizedSize
  );
  reserveFootprint(
    reserved,
    player.house,
    2,
    2,
    1,
    normalizedSize
  );
  reserveFootprint(
    reserved,
    enemy.house,
    2,
    2,
    1,
    normalizedSize
  );

  for (const resource of strategicResources) {
    reserveAroundPoint(
      reserved,
      resource.position,
      1,
      normalizedSize
    );
  }

  reserveAroundPoint(
    reserved,
    player.unitsOrigin,
    2,
    normalizedSize
  );
  reserveAroundPoint(
    reserved,
    enemy.unitsOrigin,
    2,
    normalizedSize
  );

  const forestCells = createMirroredForestClusters(
    random,
    reserved,
    normalizedSize,
    centerCorridorY
  );
  const forestKeys = new Set(
    forestCells.map((cell) => cellKey(cell.x, cell.y))
  );
  const blocked = createMirroredObstacles(
    random,
    new Set([...reserved, ...forestKeys]),
    normalizedSize,
    centerCorridorY
  );
  const resources = [
    ...strategicResources,
    ...createForestResources(forestCells)
  ];

  return {
    seed: normalizedSeed,
    map: {
      width: normalizedSize,
      height: normalizedSize,
      blocked
    },
    resources,
    forestCells,
    player,
    enemy
  };
}

function createFairResources(
  size: number,
  centerY: number
): ResourceNodeState[] {
  const playerResources: ResourceNodeState[] = [
    {
      id: "player-food",
      kind: "food",
      position: {
        x: 7.5,
        y: Math.min(size - 3, centerY + 5)
      },
      amount: 300
    },
    {
      id: "player-gold",
      kind: "gold",
      position: {
        x: 9.5,
        y: centerY - 1
      },
      amount: 250
    },
    {
      id: "player-secondary-gold",
      kind: "gold",
      position: {
        x: Math.max(12.5, size * 0.28),
        y: Math.max(4, centerY - 9)
      },
      amount: 350
    },
    {
      id: "player-secondary-food",
      kind: "food",
      position: {
        x: Math.max(13.5, size * 0.3),
        y: Math.min(size - 4, centerY + 9)
      },
      amount: 350
    }
  ];

  const mirrored = playerResources.map((resource) => ({
    ...resource,
    id: resource.id.replace("player-", "enemy-"),
    position: mirrorPoint(resource.position, size)
  }));
  const neutralResources: ResourceNodeState[] = [
    {
      id: "neutral-gold-north",
      kind: "gold",
      position: { x: size / 2, y: Math.max(4, centerY - 8) },
      amount: 500
    },
    {
      id: "neutral-gold-south",
      kind: "gold",
      position: { x: size / 2, y: Math.min(size - 4, centerY + 8) },
      amount: 500
    },
    {
      id: "neutral-food-center",
      kind: "food",
      position: { x: size / 2 - 0.5, y: centerY + 2.5 },
      amount: 450
    }
  ];

  return [...playerResources, ...mirrored, ...neutralResources];
}

function createMirroredForestClusters(
  random: () => number,
  reserved: ReadonlySet<string>,
  size: number,
  centerCorridorY: ReadonlySet<number>
): GridCell[] {
  const forest = new Map<string, GridCell>();
  const clusterCount = Math.max(3, Math.round(size / 12));
  const leftMinX = 8;
  const leftMaxX = Math.max(leftMinX + 1, Math.floor(size / 2) - 5);
  const mapCenterY = Math.floor(size / 2);
  const clusters = [
    {
      centerX: 9,
      centerY: Math.max(5, mapCenterY - 8),
      radiusX: 3,
      radiusY: 3
    },
    {
      centerX: 10,
      centerY: Math.min(size - 6, mapCenterY + 9),
      radiusX: 3,
      radiusY: 3
    }
  ];

  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    clusters.push({
      centerX:
        leftMinX +
        Math.floor(random() * Math.max(1, leftMaxX - leftMinX + 1)),
      centerY: 4 + Math.floor(random() * Math.max(1, size - 8)),
      radiusX: 2 + Math.floor(random() * 3),
      radiusY: 2 + Math.floor(random() * 3)
    });
  }

  for (const cluster of clusters) {
    for (
      let y = cluster.centerY - cluster.radiusY;
      y <= cluster.centerY + cluster.radiusY;
      y += 1
    ) {
      for (
        let x = cluster.centerX - cluster.radiusX;
        x <= cluster.centerX + cluster.radiusX;
        x += 1
      ) {
        const normalized =
          Math.pow(
            (x - cluster.centerX) / Math.max(1, cluster.radiusX),
            2
          ) +
          Math.pow(
            (y - cluster.centerY) / Math.max(1, cluster.radiusY),
            2
          );

        if (normalized > 1.15 || random() < 0.12) {
          continue;
        }

        const left = { x, y };
        const right = { x: size - 1 - x, y };

        if (
          !canUseObstacle(left, reserved, forest, size, centerCorridorY) ||
          !canUseObstacle(right, reserved, forest, size, centerCorridorY)
        ) {
          continue;
        }

        forest.set(cellKey(left.x, left.y), left);
        forest.set(cellKey(right.x, right.y), right);
      }
    }
  }

  return [...forest.values()].sort(
    (a, b) => a.y - b.y || a.x - b.x
  );
}

function createForestResources(
  forestCells: readonly GridCell[]
): ResourceNodeState[] {
  return forestCells.map((cell, index) => ({
    id: `tree-${index + 1}-${cell.x}-${cell.y}`,
    kind: "wood",
    position: { x: cell.x + 0.5, y: cell.y + 0.5 },
    amount: 80,
    blocksMovement: true
  }));
}

function createMirroredObstacles(
  random: () => number,
  reserved: ReadonlySet<string>,
  size: number,
  centerCorridorY: ReadonlySet<number>
): GridCell[] {
  const blocked = new Map<string, GridCell>();
  const pairTarget = Math.max(
    4,
    Math.round((size * size) / 50)
  );
  const leftStart = Math.max(5, Math.floor(size * 0.3));
  const leftEnd = Math.max(
    leftStart,
    Math.floor(size / 2) - 2
  );
  const horizontalSpan = leftEnd - leftStart + 1;
  let attempts = 0;

  while (
    blocked.size < pairTarget * 2 &&
    attempts < pairTarget * 80
  ) {
    attempts += 1;

    const x =
      leftStart + Math.floor(random() * horizontalSpan);
    const y =
      2 + Math.floor(random() * Math.max(1, size - 4));

    if (centerCorridorY.has(y)) {
      continue;
    }

    const left = { x, y };
    const right = { x: size - 1 - x, y };

    if (
      !canUseObstacle(
        left,
        reserved,
        blocked,
        size,
        centerCorridorY
      ) ||
      !canUseObstacle(
        right,
        reserved,
        blocked,
        size,
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
  size: number,
  centerCorridorY: ReadonlySet<number>
): boolean {
  if (
    cell.x < 0 ||
    cell.y < 0 ||
    cell.x >= size ||
    cell.y >= size
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
  size: number
): void {
  for (let y = -padding; y < height + padding; y += 1) {
    for (let x = -padding; x < width + padding; x += 1) {
      reserveCell(
        reserved,
        origin.x + x,
        origin.y + y,
        size
      );
    }
  }
}

function reserveAroundPoint(
  reserved: Set<string>,
  point: Vector2,
  radius: number,
  size: number
): void {
  const originX = Math.floor(point.x);
  const originY = Math.floor(point.y);

  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      reserveCell(
        reserved,
        originX + x,
        originY + y,
        size
      );
    }
  }
}

function reserveCell(
  reserved: Set<string>,
  x: number,
  y: number,
  size: number
): void {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }

  reserved.add(cellKey(x, y));
}

function mirrorPoint(
  point: Vector2,
  size: number
): Vector2 {
  return {
    x: size - point.x,
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

function normalizeSize(size: number): number {
  if (!Number.isFinite(size)) {
    return DEFAULT_SIZE;
  }

  const normalized = Math.trunc(size);

  if (normalized < 32) {
    return 32;
  }

  if (normalized > 64) {
    return 64;
  }

  return normalized;
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
