import type { GridCell, GridMapDefinition } from "@aeo2/simulation";

const wall: GridCell[] = [];

for (let y = 3; y <= 16; y += 1) {
  if (y === 9 || y === 10) {
    continue;
  }

  wall.push({ x: 9, y });
}

export const PROTOTYPE_MAP: GridMapDefinition = {
  width: 20,
  height: 20,
  blocked: [
    ...wall,
    { x: 13, y: 5 },
    { x: 14, y: 5 },
    { x: 13, y: 6 },
    { x: 14, y: 6 }
  ]
};

export const BLOCKED_CELL_KEYS = new Set(
  (PROTOTYPE_MAP.blocked ?? []).map((cell) => `${cell.x},${cell.y}`)
);
