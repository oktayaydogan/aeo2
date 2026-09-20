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

const WIDTH = 20;
const HEIGHT = 20;
const CENTER_CORRIDOR_Y = new Set([9, 10]);
const OBSTACLE_PAIR_TARGET = 8;

export function createSkirmishSetup(seed: number): SkirmishSetup {
  const normalizedSeed = normalizeSeed(seed);
  const random = mulberry32(normalizedSeed);

  const player: SkirmishStart = {
    townCenter: { x: 1, y: 8 },
    house: { x: 2, y: 4 },
    dropOff: { x: 0.5, y: 10 },
    unitsOrigin: { x: 2.1, y: 7.0 }
  };
  const enemy: SkirmishStart = {
    townCenter: { x: 15, y: 8 },
    house: { x: 16, y: 4 },
    dropOff: { x: 19.5, y: 10 },
    unitsOrigin: { x: 17.9, y: 7.0 }
  };

  const resources = createFairResources();
  const reserved = new Set<string>();

  reserveFootprint(reserved, player.townCenter, 4, 4, 1);
  reserveFootprint(reserved, enemy.townCenter, 4, 4, 1);
  reserveFootprint(reserved, player.house, 2, 2, 1);
  reserveFootprint(reserved, enemy.house, 2, 2, 1);

  for (const resource of resources) {
    reserveAroundPoint(reserved, resource.position, 1);
  }

  reserveAroundPoint(reserved, player.unitsOrigin, 2);
  reserveAroundPoint(reserved, enemy.unitsOrigin, 2);

  const blocked = createMirroredObstacles(random, reserved);

  return {
    seed: normalizedSeed,
    map: {
      width: WIDTH,
      height: HEIGHT,
      blocked
    },
    resources,
    player,
    enemy
  };
}

function createFairResources(): ResourceNodeState[] {
  const playerResources: ResourceNodeState[] = [
    {
      id: "player-wood",
      kind: "wood",
      position: { x: 5.5, y: 6.0 },
      amount: 300
    },
    {
      id: "player-food",
      kind: "food",
      position: { x: 5.5, y: 13.0 },
      amount: 250
    },
    {
      id: "player-gold",
      kind: "gold",
      position: { x: 7.0, y: 10.0 },
      amount: 200
    }
  ];

  return [
    ...playerResources,
    ...playerResources.map((resource) => ({
      ...resource,
      id: resource.id.replace("player-", "enemy-"),
      position: mirrorPoint(resource.position)
    }))
  ];
}

function createMirroredObstacles(
  random: () => number,
  reserved: ReadonlySet<string>
): GridCell[] {
  const blocked = new Map<string, GridCell>();
  let attempts = 0;

  while (
    blocked.size < OBSTACLE_PAIR_TARGET * 2 &&
    attempts < 400
  ) {
    attempts += 1;

    const x = 6 + Math.floor(random() * 3);
    const y = 2 + Math.floor(random() * 16);

    if (CENTER_CORRIDOR_Y.has(y)) {
      continue;
    }

    const left = { x, y };
    const right = { x: WIDTH - 1 - x, y };

    if (
      !canUseObstacle(left, reserved, blocked) ||
      !canUseObstacle(right, reserved, blocked)
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
  blocked: ReadonlyMap<string, GridCell>
): boolean {
  if (
    cell.x < 0 ||
    cell.y < 0 ||
    cell.x >= WIDTH ||
    cell.y >= HEIGHT
  ) {
    return false;
  }

  if (CENTER_CORRIDOR_Y.has(cell.y)) {
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
  padding: number
): void {
  for (let y = -padding; y < height + padding; y += 1) {
    for (let x = -padding; x < width + padding; x += 1) {
      reserveCell(reserved, origin.x + x, origin.y + y);
    }
  }
}

function reserveAroundPoint(
  reserved: Set<string>,
  point: Vector2,
  radius: number
): void {
  const originX = Math.floor(point.x);
  const originY = Math.floor(point.y);

  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      reserveCell(reserved, originX + x, originY + y);
    }
  }
}

function reserveCell(
  reserved: Set<string>,
  x: number,
  y: number
): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    return;
  }

  reserved.add(cellKey(x, y));
}

function mirrorPoint(point: Vector2): Vector2 {
  return {
    x: WIDTH - point.x,
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
