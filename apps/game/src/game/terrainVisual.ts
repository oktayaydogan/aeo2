export interface TerrainCellVisual {
  fill: number;
  line: number;
  accent: number;
  accentAlpha: number;
  variant: number;
}

const GRASS_FILLS = [
  0x263f36,
  0x29483c,
  0x2c4b3f,
  0x304e42
] as const;

const GRASS_LINES = [
  0x5f7968,
  0x647f6d,
  0x6b8773
] as const;

const STONE_FILLS = [
  0x444641,
  0x4a4b47,
  0x50514c
] as const;

export function terrainCellVisual(
  x: number,
  y: number,
  seed: number,
  blocked: boolean
): TerrainCellVisual {
  const hash = hashCell(x, y, seed);
  const variant = hash & 0xff;

  if (blocked) {
    return {
      fill: STONE_FILLS[variant % STONE_FILLS.length] ?? STONE_FILLS[0],
      line: 0x9d987f,
      accent: 0xb8ad8a,
      accentAlpha: 0.22 + ((variant >> 3) % 4) * 0.04,
      variant
    };
  }

  return {
    fill: GRASS_FILLS[variant % GRASS_FILLS.length] ?? GRASS_FILLS[0],
    line: GRASS_LINES[(variant >> 2) % GRASS_LINES.length] ?? GRASS_LINES[0],
    accent: variant % 3 === 0 ? 0x8ba477 : 0x6f9068,
    accentAlpha: 0.12 + ((variant >> 4) % 4) * 0.025,
    variant
  };
}

export function terrainAccentOffsets(
  variant: number
): readonly [number, number][] {
  const firstX = 0.24 + ((variant & 3) * 0.11);
  const firstY = 0.38 + (((variant >> 2) & 3) * 0.08);
  const secondX = 0.56 + (((variant >> 4) & 3) * 0.08);
  const secondY = 0.28 + (((variant >> 6) & 3) * 0.1);

  return [
    [Math.min(firstX, 0.78), Math.min(firstY, 0.76)],
    [Math.min(secondX, 0.82), Math.min(secondY, 0.78)]
  ];
}

function hashCell(x: number, y: number, seed: number): number {
  let value =
    (Math.imul(x + 1, 0x45d9f3b) ^
      Math.imul(y + 1, 0x119de1f3) ^
      (seed >>> 0)) >>>
    0;

  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;

  return value >>> 0;
}
